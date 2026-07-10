import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 's.gravatar.com' },
      { hostname: '*.gravatar.com' },
      { hostname: 'cdn.auth0.com' },
      { hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
