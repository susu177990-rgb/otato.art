import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next 应用现在位于仓库根，standalone tracing 也以仓库根为边界。
  outputFileTracingRoot: process.cwd(),
  /** 仅 externalize 当前项目已安装且确实会在服务端使用的包，避免 dev 中解析异常 */
  serverExternalPackages: ["pdf-parse"],
  /**
   * 参考图 multipart 体积较大时，Next 在代理链路上会对请求体设上限；默认偏小会导致「正文截断 / 解析失败」。
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
   */
  experimental: {
    proxyClientMaxBodySize: "128mb",
  },
};

export default nextConfig;
