use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Emitter;
use crate::models::{DeviceIdentity, DeviceRole};

pub mod server;

const SERVICE_TYPE: &str = "_clarix._tcp.local.";

/// Resolve the local private IP address.
/// Instead of using local_ip_address::local_ip() which can connect to 8.8.8.8 and return public WAN/NAT IPs
/// (like 152.59.5.8), this function iterates through all network interfaces and selects a private IPv4 address
/// (10.x.x.x, 192.168.x.x, 172.16.x.x) on the main network interface (Wi-Fi, Ethernet).
pub fn resolve_local_network_interface() -> anyhow::Result<(String, String)> {
    use std::net::IpAddr;

    let default_route_ip = local_ip_address::local_ip().ok().and_then(|ip| match ip {
        IpAddr::V4(ipv4) => Some(ipv4.to_string()),
        IpAddr::V6(_) => None,
    });
    let interfaces = local_ip_address::list_afinet_netifas()
        .map_err(|e| anyhow::anyhow!("Failed to list net interfaces: {}", e))?;

    let mut candidates = Vec::new();

    for (name, ip) in interfaces {
        if let IpAddr::V4(ipv4) = ip {
            if is_eligible_interface(&name, ipv4) {
                candidates.push((name, ipv4.to_string()));
            }
        }
    }

    if let Some(default_ip) = default_route_ip {
        if let Some(candidate) = candidates.iter().find(|(_, ip)| ip == &default_ip) {
            return Ok(candidate.clone());
        }
    }

    // If the default route is not eligible, prefer a normal Wi-Fi or Ethernet interface.
    candidates.sort_by(|a, b| {
        let a_is_priority = a.0.starts_with("en") 
            || a.0.starts_with("eth") 
            || a.0.starts_with("wlan") 
            || a.0.to_lowercase().contains("ethernet") 
            || a.0.to_lowercase().contains("wi-fi");
        let b_is_priority = b.0.starts_with("en") 
            || b.0.starts_with("eth") 
            || b.0.starts_with("wlan") 
            || b.0.to_lowercase().contains("ethernet") 
            || b.0.to_lowercase().contains("wi-fi");

        match (a_is_priority, b_is_priority) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.0.cmp(&b.0),
        }
    });

    if let Some((name, ip_str)) = candidates.first() {
        Ok((name.clone(), ip_str.clone()))
    } else {
        anyhow::bail!("No eligible private local-network interface is available")
    }
}

fn is_eligible_interface(name: &str, ipv4: std::net::Ipv4Addr) -> bool {
    let octets = ipv4.octets();
    let is_private = (octets[0] == 10)
        || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] == 192 && octets[1] == 168);
    let lower = name.to_lowercase();
    let excluded = lower.contains("vpn")
        || lower.starts_with("utun")
        || lower.starts_with("tun")
        || lower.starts_with("tap")
        || lower.starts_with("bridge")
        || lower.contains("docker")
        || lower.contains("vmnet")
        || lower.contains("vbox");
    is_private && !ipv4.is_loopback() && !ipv4.is_link_local() && !excluded
}

pub fn resolve_local_private_ip() -> anyhow::Result<String> {
    resolve_local_network_interface().map(|(_, ip)| ip)
}

/// Type alias for shared local-network discovery state managed by Tauri.
pub type LanDiscoveryState = Arc<RwLock<LanDiscovery>>;

/// Struct to hold the fixed controller server port, or zero when this device is a player.
pub struct LanServerPort(pub u16);

/// Manages local-network controller discovery using mDNS (Bonjour-compatible).
pub struct LanDiscovery {
    pub peers: Arc<RwLock<HashMap<String, PeerScreen>>>,
    local_device_id: String,
    registration: Arc<RwLock<Option<(ServiceDaemon, String, String, u16)>>>,
    browser: Arc<RwLock<Option<ServiceDaemon>>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PeerScreen {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub is_controller: bool,
    pub role: String,
    pub protocol_version: String,
}

impl LanDiscovery {
    pub fn new(local_device_id: String) -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            local_device_id,
            registration: Arc::new(RwLock::new(None)),
            browser: Arc::new(RwLock::new(None)),
        }
    }

    /// Register the controller using a unique instance name and DNS-SD metadata.
    pub async fn register_self(&self, identity: &DeviceIdentity, port: u16) -> anyhow::Result<()> {
        if identity.role != DeviceRole::Controller {
            return Ok(());
        }
        let mdns = ServiceDaemon::new()?;
        let (_, ip) = resolve_local_network_interface()?;

        // Ensure hostname ends with '.local.' for mDNS compatibility
        let raw_hostname = gethostname::gethostname()
            .to_string_lossy()
            .to_string();
        let hostname = if raw_hostname.ends_with(".local") {
            format!("{}.", raw_hostname)
        } else if raw_hostname.ends_with(".local.") {
            raw_hostname
        } else {
            format!("{}.local.", raw_hostname)
        };

        let suffix = identity.device_id.chars().take(8).collect::<String>();
        let instance_name = format!("Clarix-{}", suffix);
        let properties = [
            ("device_id", identity.device_id.as_str()),
            ("role", identity.role.as_str()),
            ("protocol", identity.protocol_version.as_str()),
            ("name", identity.display_name.as_str()),
        ];
        let service = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &hostname,
            ip.as_str(),
            port,
            &properties[..],
        )?;
        let fullname = service.get_fullname().to_string();
        mdns.register(service)?;
        *self.registration.write().await = Some((mdns, fullname, ip.clone(), port));
        tracing::info!("Registered controller service: {} at {}:{}", instance_name, ip, port);
        Ok(())
    }

    pub async fn refresh_registration(&self, identity: &DeviceIdentity, port: u16) -> anyhow::Result<()> {
        if identity.role != DeviceRole::Controller || port == 0 {
            return Ok(());
        }
        let current_ip = resolve_local_private_ip()?;
        let unchanged = self.registration.read().await.as_ref()
            .map(|(_, _, ip, registered_port)| ip == &current_ip && registered_port == &port)
            .unwrap_or(false);
        if unchanged {
            return Ok(());
        }
        if let Some((daemon, fullname, _, _)) = self.registration.write().await.take() {
            let _ = daemon.unregister(&fullname);
        }
        self.register_self(identity, port).await
    }

    /// Start discovering controllers on the local network. Emits `peer_discovered` and `peer_lost`
    /// events to the Tauri frontend.
    pub async fn discover_peers(&self, app_handle: tauri::AppHandle) -> anyhow::Result<()> {
        let mdns = ServiceDaemon::new()?;
        let receiver = mdns.browse(SERVICE_TYPE)?;
        *self.browser.write().await = Some(mdns);
        let peers = self.peers.clone();
        let local_device_id = self.local_device_id.clone();

        tokio::spawn(async move {
            while let Ok(event) = receiver.recv_async().await {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        // Prefer IPv4 address
                        let ip = info
                            .get_addresses()
                            .iter()
                            .find(|a| a.is_ipv4())
                            .or_else(|| info.get_addresses().iter().next())
                            .map(|a| a.to_string())
                            .unwrap_or_default();
                        let device_id = info
                            .get_property_val_str("device_id")
                            .unwrap_or(info.get_fullname())
                            .to_string();
                        if device_id == local_device_id {
                            continue;
                        }
                        let role = info
                            .get_property_val_str("role")
                            .unwrap_or("Controller")
                            .to_string();

                        let peer = PeerScreen {
                            id: device_id,
                            name: info
                                .get_property_val_str("name")
                                .unwrap_or_else(|| info.get_hostname().trim_end_matches('.'))
                                .to_string(),
                            ip,
                            port: info.get_port(),
                            is_controller: role == "Controller",
                            role,
                            protocol_version: info
                                .get_property_val_str("protocol")
                                .unwrap_or("1")
                                .to_string(),
                        };
                        let id = peer.id.clone();
                        tracing::info!("Peer discovered: {} at {}", peer.name, peer.ip);
                        let _ = app_handle.emit("peer_discovered", &peer);
                        peers.write().await.insert(id, peer);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        tracing::info!("Peer lost: {}", fullname);
                        let mut known = peers.write().await;
                        let removed_id = known.keys()
                            .find(|id| fullname.contains(&id.chars().take(8).collect::<String>()))
                            .cloned();
                        if let Some(id) = removed_id {
                            known.remove(&id);
                            let _ = app_handle.emit("peer_lost", &id);
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    /// Get the current list of discovered peers.
    pub async fn get_peers(&self) -> Vec<PeerScreen> {
        self.peers.read().await.values().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::is_eligible_interface;
    use std::net::Ipv4Addr;

    #[test]
    fn rejects_virtual_and_non_private_interfaces() {
        assert!(!is_eligible_interface("utun4", Ipv4Addr::new(10, 0, 0, 5)));
        assert!(!is_eligible_interface("docker0", Ipv4Addr::new(172, 17, 0, 1)));
        assert!(!is_eligible_interface("en0", Ipv4Addr::new(169, 254, 1, 2)));
        assert!(!is_eligible_interface("en0", Ipv4Addr::new(8, 8, 8, 8)));
    }

    #[test]
    fn accepts_normal_private_wifi_interfaces() {
        assert!(is_eligible_interface("en0", Ipv4Addr::new(192, 168, 2, 109)));
        assert!(is_eligible_interface("Wi-Fi", Ipv4Addr::new(10, 133, 93, 90)));
    }
}
