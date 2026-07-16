import type { NextConfig } from "next";

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const buildTime = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "nodemailer", "sharp"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
};

export default nextConfig;

if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
