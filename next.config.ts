import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const DEV_API = process.env.DEV_API_URL || "http://localhost:3001";

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async rewrites() {
    if (!isDev) return [];
    return [
      { source: "/api/parse", destination: `${DEV_API}/parse` },
      { source: "/api/generate-takeoff", destination: `${DEV_API}/generate-takeoff` },
      { source: "/api/generate-data-unit", destination: `${DEV_API}/generate-data-unit` },
      { source: "/api/crossref-lookup", destination: `${DEV_API}/crossref-lookup` },
    ];
  },
};

export default config;
