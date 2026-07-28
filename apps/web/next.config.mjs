/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine packages are TypeScript sources in the workspace; Next compiles
  // them alongside the app rather than requiring a separate build step in dev.
  transpilePackages: ['@plan2quote/core', '@plan2quote/geometry', '@plan2quote/classify'],
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', '@tabler/icons-react'],
  },

  webpack: (config) => {
    // The engine packages are written for NodeNext and therefore import each
    // other with explicit `.js` extensions, which is correct TypeScript for ESM
    // output. Compiling them from source means webpack sees those specifiers
    // pointing at files that do not exist yet. This maps them back to the
    // sources rather than forcing a build step before every `next dev`.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
