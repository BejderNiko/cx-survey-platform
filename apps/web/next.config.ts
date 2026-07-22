import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "exceljs"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  async redirects() {
    // Gamle sektioner er lagt sammen under /studies; Opfølgning er fjernet.
    return [
      { source: "/distributions", destination: "/studies", permanent: false },
      { source: "/responses", destination: "/studies", permanent: false },
      { source: "/followup", destination: "/home", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  experimental: {
    workerThreads: true,
    serverActions: {
      // Panel import files are sent through server actions (limit checked again server-side).
      bodySizeLimit: "10mb",
    },
    // Klientens router-cache: genbrug netop besøgte sider i 30 s, så
    // frem/tilbage-navigation føles øjeblikkelig i stedet for at vente på serveren.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
