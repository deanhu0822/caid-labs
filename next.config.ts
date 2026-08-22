import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/*': ['./synthetic-assets/rover-alpha/**/*'],
  },
};

export default nextConfig;
