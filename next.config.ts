import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next 应用现在位于仓库根，standalone tracing 也以仓库根为边界。
  outputFileTracingRoot: process.cwd(),
  /** 仅 externalize 当前项目已安装且确实会在服务端使用的包，避免 dev 中解析异常 */
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
