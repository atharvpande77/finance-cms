import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  poweredByHeader: false,
  // Postgres driver and mailer stay as Node externals.
  serverExternalPackages: ["postgres", "nodemailer"],
};

export default nextConfig;
