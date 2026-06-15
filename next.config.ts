import type { NextConfig } from "next";
import os from "os";

const getLocalIPs = () => {
  const interfaces = os.networkInterfaces();
  const hosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"];
  
  // Extract all local IPs
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (list) {
      for (const net of list) {
        // Support older/newer Node.js family types ('IPv4', 'IPv6', 4, 6)
        if (net.address) {
          hosts.push(net.address);
          // If IPv6 contains scopes (e.g. %en0), add the base IP too
          if (net.address.includes("%")) {
            hosts.push(net.address.split("%")[0]);
          }
        }
      }
    }
  }

  // Remove duplicates
  const uniqueHosts = Array.from(new Set(hosts));

  // We want to support the raw host as well as various common development ports
  const devPorts = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 7420, 7421, 7422, 7423, 7424, 7425];
  const origins: string[] = [];

  for (const host of uniqueHosts) {
    origins.push(host);
    for (const port of devPorts) {
      origins.push(`${host}:${port}`);
      // IPv6 hosts require brackets when port is appended (e.g., [::1]:3000)
      if (host.includes(":")) {
        origins.push(`[${host}]:${port}`);
      }
    }
  }

  return origins;
};

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: getLocalIPs(),
};

export default nextConfig;
