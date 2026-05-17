import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Home klasöründeki eski package-lock.json'ın workspace root olarak algılanmasını engelle.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
