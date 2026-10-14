import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@looper/ui", "@looper/types"],
  async headers() { return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }]; },
};
export default nextConfig;
