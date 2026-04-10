/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',  
  disable: process.env.NODE_ENV === "development",   
  register: true,     
  skipWaiting: true,  
});

const nextConfig = withPWA({
  output: 'export', //this line was important cus i decided that having a pwa build maintained in the same codebase with just a flag, an env variable basically
images: {
    unoptimized: true,
  },
  reactStrictMode: true,
});

module.exports = nextConfig;