import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Treat heic-convert (and its transitive libheif-js WASM bundler) as external
  // for server bundles — silences the "Critical dependency: require function..." warning
  // and avoids webpack trying to statically analyze its dynamic require.
  serverExternalPackages: ['heic-convert', 'heic-decode', 'libheif-js'],
};

export default nextConfig;
