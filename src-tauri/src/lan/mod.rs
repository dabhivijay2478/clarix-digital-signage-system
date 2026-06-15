use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Emitter;

pub mod server;

const SERVICE_TYPE: &str = "_signalos._tcp.local.";

/// Resolve the local private IP address.
/// Instead of using local_ip_address::local_ip() which can connect to 8.8.8.8 and return public WAN/NAT IPs
/// (like 152.59.5.8), this function iterates through all network interfaces and selects a private IPv4 address
/// (10.x.x.x, 192.168.x.x, 172.16.x.x) on the main network interface (Wi-Fi, Ethernet).
pub fn resolve_local_private_ip() -> anyhow::Result<String> {
    use std::net::IpAddr;

    let interfaces = local_ip_address::list_afinet_netifas()
        .map_err(|e| anyhow::anyhow!("Failed to list net interfaces: {}", e))?;

    let mut candidates = Vec::new();

    for (name, ip) in interfaces {
        if let IpAddr::V4(ipv4) = ip {
            let octets = ipv4.octets();
            let is_private = (octets[0] == 10)
                || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
                || (octets[0] == 192 && octets[1] == 168);

            if is_private && !ipv4.is_loopback() {
                candidates.push((name, ipv4.to_string()));
            }
        }
    }

    // Sort to prioritize Wi-Fi and Ethernet interfaces
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

    if let Some((_, ip_str)) = candidates.first() {
        Ok(ip_str.clone())
    } else {
        // Fall back to original library default if no private IP was discovered
        let fallback = local_ip_address::local_ip()?.to_string();
        Ok(fallback)
    }
}

/// Type alias for the shared LAN state managed by Tauri.
pub type LanDiscoveryState = Arc<RwLock<LanDiscovery>>;

/// Struct to hold the dynamically bound server port.
pub struct LanServerPort(pub u16);

/// Manages LAN peer discovery using mDNS (Bonjour-compatible).
pub struct LanDiscovery {
    pub peers: Arc<RwLock<HashMap<String, PeerScreen>>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PeerScreen {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub is_controller: bool,
}

impl LanDiscovery {
    pub fn new() -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register this instance as a SignalOS service on the LAN.
    pub fn register_self(&self, screen_name: &str, port: u16) -> anyhow::Result<()> {
        let mdns = ServiceDaemon::new()?;
        let ip = resolve_local_private_ip()?;

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

        let service = ServiceInfo::new(
            SERVICE_TYPE,
            screen_name,
            &hostname,
            ip.as_str(),
            port,
            None,
        )?;

        mdns.register(service)?;
        tracing::info!("Registered mDNS service: {} at {}:{}", screen_name, ip, port);
        Ok(())
    }

    /// Start discovering peers on the LAN. Emits `peer_discovered` and `peer_lost`
    /// events to the Tauri frontend.
    pub async fn discover_peers(&self, app_handle: tauri::AppHandle) -> anyhow::Result<()> {
        let mdns = ServiceDaemon::new()?;
        let receiver = mdns.browse(SERVICE_TYPE)?;
        let peers = self.peers.clone();

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

                        let peer = PeerScreen {
                            id: info.get_fullname().to_string(),
                            name: info.get_hostname().trim_end_matches('.').to_string(),
                            ip,
                            port: info.get_port(),
                            is_controller: false,
                        };
                        let id = peer.id.clone();
                        tracing::info!("Peer discovered: {} at {}", peer.name, peer.ip);
                        let _ = app_handle.emit("peer_discovered", &peer);
                        peers.write().await.insert(id, peer);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        tracing::info!("Peer lost: {}", fullname);
                        peers.write().await.remove(&fullname);
                        let _ = app_handle.emit("peer_lost", &fullname);
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

/// Ping a screen IP over LAN (TCP connect on port 7420) to determine if it's online.
/// Returns true if the screen responds within 500ms.
pub async fn ping_screen_ip(ip: &str, port: u16) -> bool {
    use tokio::net::TcpStream;
    use std::time::Duration;

    let addr = if ip.contains(':') {
        ip.to_string()
    } else {
        format!("{}:{}", ip, port)
    };

    match tokio::time::timeout(Duration::from_millis(500), TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => true,
        _ => false,
    }
}

/// Ping via ICMP-style using a TCP connection to a common port (80 or 7420).
/// Tries port 7420 first (SignalOS), then port 80 (HTTP), then returns false.
pub async fn probe_host_reachable(ip: &str) -> bool {
    if ping_screen_ip(ip, 7420).await {
        return true;
    }
    ping_screen_ip(ip, 80).await
}
