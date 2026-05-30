/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['sherpa-onnx-node'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
      },
      {
        protocol: 'https',
        hostname: 'books.google.com',
      },
    ],
  },
};

export default nextConfig;
