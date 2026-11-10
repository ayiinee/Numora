import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

loadEnvConfig(path.resolve(process.cwd(), '../..'), process.env.NODE_ENV === 'development');

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Reuse explicit development origins so LAN clients can load Next.js assets.
  allowedDevOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => new URL(origin.trim()).hostname),
  distDir: process.env.NUMORA_WEB_DIST_DIR ?? '.next',
  transpilePackages: ['@tka/ui'],
  // Keep the tracked Next.js guidance in AGENTS.md instead of deleting it on startup.
  agentRules: true,
  ...(process.env.NUMORA_LOW_MEMORY === 'true'
    ? { experimental: { cpus: 1, webpackBuildWorker: false, webpackMemoryOptimizations: true } }
    : {}),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // The app embeds no frames, so only the clickjacking directive is enforced here.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000',
                },
              ]
            : []),
        ],
      },
    ];
  },
  async redirects() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: '127.0.0.1' }],
        destination: 'http://localhost:3000/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
