import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

loadEnvConfig(path.resolve(process.cwd(), '../..'), process.env.NODE_ENV === 'development');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NUMORA_WEB_DIST_DIR ?? '.next',
  transpilePackages: ['@tka/ui'],
  agentRules: false,
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
