import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    "192.168.31.238",
    "192.168.31.232",
    "192.168.31.170",
    "192.168.31.238:3000",
    "192.168.31.232:3000",
    "192.168.31.170:3000"
  ]
};

export default nextConfig;
