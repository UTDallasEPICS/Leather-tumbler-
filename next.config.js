/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',  
  disable: process.env.NODE_ENV === "development",   
  register: true,     
  skipWaiting: true,  
});

const nextConfig = withPWA({
  output: 'export', // <--- ADD THIS LINE (CRITICAL)
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
});

module.exports = nextConfig;