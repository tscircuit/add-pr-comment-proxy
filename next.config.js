/** @type {import('next').NextConfig} */

/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: '/api/:path*',
        },
      ],
    }
  },
}

module.exports = nextConfig