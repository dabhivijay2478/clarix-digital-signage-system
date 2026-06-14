use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Emitter;

pub mod server;

const SERVICE_TYPE: &str = "_signalos._tcp.local.";

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
        let ip = local_ip_address::local_ip()?.to_string();

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

    let addr = format!("{}:{}", ip, port);
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
