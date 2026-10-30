use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use crate::models::{DeviceIdentity, DeviceRole};

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct PeerScreen {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub is_controller: bool,
    pub role: String,
    pub protocol_version: String,
}

/// Resolve the local private IP address.
/// This only inspects local network interfaces; it does not ask the OS for an
/// internet/default-route address, because offline routers can make that call
/// slow or unavailable during app startup.
pub fn resolve_local_network_interface() -> anyhow::Result<(String, String)> {
    use std::net::IpAddr;

    let interfaces = local_ip_address::list_afinet_netifas()
        .map_err(|e| anyhow::anyhow!("Failed to list net interfaces: {e}"))?;

    let mut candidates = Vec::new();

    for (name, ip) in interfaces {
        if let IpAddr::V4(ipv4) = ip {
            if is_eligible_interface(&name, ipv4) {
                candidates.push((name, ipv4.to_string()));
            }
        }
    }

    // Prefer a normal Wi-Fi or Ethernet interface.
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

/// Type alias for shared local-network discovery state.
pub type LanDiscoveryState = Arc<Mutex<LanDiscovery>>;

const SERVICE_TYPE: &str = "_mgenterprise._tcp.local.";

pub mod server;

/// Manages local-network controller discovery using mDNS (Bonjour-compatible).
pub struct LanDiscovery {
    pub peers: Arc<RwLock<HashMap<String, PeerScreen>>>,
    local_device_id: String,
    registration: Mutex<Option<(ServiceDaemon, String, String, u16)>>,
    browser: Mutex<Option<ServiceDaemon>>,
}

impl LanDiscovery {
    pub fn new(local_device_id: String) -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            local_device_id,
            registration: Mutex::new(None),
            browser: Mutex::new(None),
        }
    }

    /// Register the controller using a unique instance name and DNS-SD metadata.
    pub fn register_self(&self, identity: &DeviceIdentity, port: u16) -> anyhow::Result<()> {
        if identity.role != DeviceRole::Controller {
            return Ok(());
        }
        let mdns = ServiceDaemon::new()?;
        let (_, ip) = resolve_local_network_interface()?;

        // Ensure hostname ends with '.local.' for mDNS compatibility
        let raw_hostname = gethostname::gethostname().to_string_lossy().to_string();
        let hostname = if raw_hostname.ends_with(".local") {
            format!("{raw_hostname}.")
        } else if raw_hostname.ends_with(".local.") {
            raw_hostname
        } else {
            format!("{raw_hostname}.local.")
        };

        let suffix = identity.device_id.chars().take(8).collect::<String>();
        let instance_name = format!("MG-Enterprise-{suffix}");
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
        *self.registration.lock().unwrap() = Some((mdns, fullname, ip.clone(), port));
        tracing::info!("Registered controller service: {instance_name} at {ip}:{port}");
        Ok(())
    }

    pub fn refresh_registration(&self, identity: &DeviceIdentity, port: u16) -> anyhow::Result<()> {
        if identity.role != DeviceRole::Controller || port == 0 {
            return Ok(());
        }
        let current_ip = resolve_local_private_ip()?;
        let unchanged = self
            .registration
            .lock()
            .unwrap()
            .as_ref()
            .map(|(_, _, ip, registered_port)| ip == &current_ip && registered_port == &port)
            .unwrap_or(false);
        if unchanged {
            return Ok(());
        }
        if let Some((daemon, fullname, _, _)) = self.registration.lock().unwrap().take() {
            let _ = daemon.unregister(&fullname);
        }
        self.register_self(identity, port)
    }

    /// Start discovering controllers on the local network. Discovered peers are
    /// stored in-memory for the UI to read.
    pub fn discover_peers(&self) -> anyhow::Result<()> {
        let mdns = ServiceDaemon::new()?;
        let receiver = mdns.browse(SERVICE_TYPE)?;
        *self.browser.lock().unwrap() = Some(mdns);
        let peers = self.peers.clone();
        let local_device_id = self.local_device_id.clone();

        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
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
                        if let Ok(mut known) = peers.write() {
                            known.insert(id, peer);
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        tracing::info!("Peer lost: {fullname}");
                        let mut known = match peers.write() {
                            Ok(known) => known,
                            Err(_) => continue,
                        };
                        let removed_id = known
                            .keys()
                            .find(|id| fullname.contains(&id.chars().take(8).collect::<String>()))
                            .cloned();
                        if let Some(id) = removed_id {
                            known.remove(&id);
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    /// Get the current list of discovered peers.
    pub fn get_peers(&self) -> Vec<PeerScreen> {
        self.peers
            .read()
            .map(|known| known.values().cloned().collect())
            .unwrap_or_default()
    }
}
