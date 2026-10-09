import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async redirects() {
    return [
      {
        source: "/ropings/:path*",
        destination: "/events/:path*",
        permanent: true,
      },
      {
        source: "/settings/divisions",
        destination: "/settings/roping-templates",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
