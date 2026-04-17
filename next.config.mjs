/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Recharts uses browser-only APIs; keep it out of the server bundle.
  experimental: {
    optimizePackageImports: ['recharts'],
  },
};

export default nextConfig;
