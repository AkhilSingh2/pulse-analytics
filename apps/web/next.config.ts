import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pulse/shared', '@pulse/sdk', '@pulse/db'],
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
};

export default nextConfig;
