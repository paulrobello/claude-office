import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for production builds
  output: "export",
  // Disable image optimization (not supported in static export)
  images: {
    unoptimized: true,
  },
  // Disabled: StrictMode's double-mount races with @pixi/react v8 <Application>
  // WebGL context creation. The second mount tries to acquire a context while
  // the first is still initializing, hanging the tab on floor view entry.
  reactStrictMode: false,
};

export default nextConfig;
