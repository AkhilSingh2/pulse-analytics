import type { NextConfig } from 'next';

// STATIC_DEMO=true builds a browser-only demo for GitHub Pages (see src/demo).
const staticDemo = process.env.STATIC_DEMO === 'true';
const basePath = '/pulse-analytics';

const nextConfig: NextConfig = {
  transpilePackages: ['@pulse/shared', '@pulse/sdk', '@pulse/db'],
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  poweredByHeader: false,
  ...(staticDemo
    ? {
        output: 'export',
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        serverExternalPackages: ['postgres'],
        env: { NEXT_PUBLIC_STATIC_DEMO: 'true', NEXT_PUBLIC_BASE_PATH: basePath },
      }
    : {}),
};

export default nextConfig;
