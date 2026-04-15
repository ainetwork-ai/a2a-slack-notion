import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@notion/shared'],
};

export default nextConfig;
