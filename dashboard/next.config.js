/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Route dashboard API calls to the bot API when developing locally
        destination: process.env.BOT_API_URL || 'http://localhost:8989/api/:path*',
      },
      {
        source: '/auth/:path*',
        destination: process.env.BOT_API_URL ? `${process.env.BOT_API_URL}/auth/:path*` : 'http://localhost:8989/auth/:path*',
      }
    ];
  },
};

module.exports = nextConfig;
