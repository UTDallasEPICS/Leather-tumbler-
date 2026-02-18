/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out',
  trailingSlash: true,
  images: {
    unoptimized: true
    
  },
   exclude: ['android', 'ios'],
  
};

module.exports = nextConfig;
