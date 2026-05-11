import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lastfm.freetls.fastly.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.last.fm',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.archive.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'archive.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.ca.archive.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.us.archive.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'coverartarchive.org',
        pathname: '/**',
      },
    ],
    // Cache optimized images for 7 days at the browser level
    minimumCacheTTL: 604800,
  },

  async headers() {
    return [
      {
        // Next.js static assets are content-hashed — safe to cache forever
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Optimized images: 7-day cache + stale-while-revalidate
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
