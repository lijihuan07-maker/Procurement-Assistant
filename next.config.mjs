/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};
export default nextConfig;
