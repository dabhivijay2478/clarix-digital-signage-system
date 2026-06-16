import type { NextConfig } from "next";
import os from "node:os";

const explicitDevOrigins = (process.env.CLARIX_DEV_ORIGINS ?? process.env.SIGNALOS_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    if (origin.startsWith("*.")) return origin;
    try {
      return new URL(origin.includes("://") ? origin : `http://${origin}`).hostname;
    } catch {
      return origin;
    }
  });

const localPrivateDevOrigins = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) => {
  const normalized = name.toLowerCase();
  const isVirtual = ["bridge", "docker", "tap", "tun", "utun", "vbox", "vmnet", "vpn"]
    .some((fragment) => normalized.includes(fragment));
  if (isVirtual) return [];

  return (addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address)
    .filter((address) => {
      const [first, second] = address.split(".").map(Number);
      return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
    });
});

const allowedDevOrigins = Array.from(new Set([
  "localhost",
  "127.0.0.1",
  ...explicitDevOrigins,
  ...localPrivateDevOrigins,
]));

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins,
};

export default nextConfig;
