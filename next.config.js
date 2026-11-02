/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',  
  disable: process.env.NODE_ENV === "development",   
  register: true,     
  skipWaiting: true,  
});

const nextConfig = withPWA({
  output: 'export', // <--- ADD THIS LINE (CRITICAL)
images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  // dev-only Next.js badge; bottom-left would sit on top of the desktop menu's footer
  devIndicators: { position: 'bottom-right' },
});

module.exports = nextConfig;