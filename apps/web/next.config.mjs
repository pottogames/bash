/**
 * Two build modes.
 *
 * The normal one is an ordinary Next build. Setting `P2Q_STATIC_EXPORT=1`
 * switches to a fully static export for GitHub Pages, which serves from
 * `/<repo>/` rather than the domain root — so the base path has to be baked in
 * at build time. Every page in this app is a client component and prerenders
 * statically already, so the export needs no other concessions.
 */
const isStaticExport = process.env.P2Q_STATIC_EXPORT === '1';
const basePath = process.env.P2Q_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine packages are TypeScript sources in the workspace; Next compiles
  // them alongside the app rather than requiring a separate build step in dev.
  transpilePackages: ['@plan2quote/core', '@plan2quote/geometry', '@plan2quote/classify'],
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', '@tabler/icons-react'],
  },

  ...(isStaticExport
    ? {
        output: 'export',
        // Pages has no rewrite layer, so `/upload` must resolve to a real file.
        // `trailingSlash` makes the export write `upload/index.html`, which the
        // static server can find without any configuration.
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
      }
    : {}),

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
