import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output is for the sandbox/local container workflow;
  // Vercel builds with its own Next.js runtime.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  // keep native/libsql packages out of the server bundle (loaded at runtime)
  serverExternalPackages: ["@libsql/client", "libsql", "@prisma/adapter-libsql"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
