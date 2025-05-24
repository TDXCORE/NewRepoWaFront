/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  trailingSlash: true,
  
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
    NEXT_PUBLIC_WS_TOKEN: process.env.NEXT_PUBLIC_WS_TOKEN,
  },
  
  images: {
    unoptimized: true,
    domains: ['localhost'],
  },
  
  // Rewrites no son compatibles con export estático
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/ws/:path*',
  //       destination: 'http://localhost:8000/:path*',
  //     },
  //   ]
  // },
}

module.exports = nextConfig
