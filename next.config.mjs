/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['shiki', '@prisma/client', 'bcryptjs', '@auth/prisma-adapter'],
    esmExternals: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // Handle node: protocol imports that Prisma v7 uses
    config.externals.push(({ request }, callback) => {
      if (request && /^node:/.test(request)) {
        return callback(null, `commonjs ${request}`)
      }
      callback()
    })
    return config
  },
};
export default nextConfig;
