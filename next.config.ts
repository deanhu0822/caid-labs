import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/workspace', destination: '/_workspace/index.html' }];
  },
  outputFileTracingIncludes: {
    '/api/*': ['./synthetic-assets/rover-alpha/**/*'],
  },
};

export default nextConfig;
