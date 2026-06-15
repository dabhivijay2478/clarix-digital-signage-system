import type { NextConfig } from "next";
const allowedDevOrigins = (process.env.SIGNALOS_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins,
};

export default nextConfig;
