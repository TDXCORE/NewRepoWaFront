/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
    NEXT_PUBLIC_WS_TOKEN: process.env.NEXT_PUBLIC_WS_TOKEN,
  },
  
  images: {
    domains: ['localhost'],
  },
  
  async rewrites() {
    return [
      {
        source: '/api/ws/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ]
  },
}

module.exports = nextConfig