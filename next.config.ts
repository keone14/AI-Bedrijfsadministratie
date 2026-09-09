import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const protectedPageHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
];

const protectedPageSources = [
  "/dashboard/:path*",
  "/facturen/:path*",
  "/documenten/:path*",
  "/deadlines/:path*",
  "/onboarding/:path*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      ...protectedPageSources.map((source) => ({
        source,
        headers: protectedPageHeaders,
      })),
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
