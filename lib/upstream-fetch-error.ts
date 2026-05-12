/** 把 undici/fetch 的失败原因展开成可读字符串（便于区分未启动服务 vs 其它网络错误） */
export function describeUpstreamFetchError(error: unknown): { message: string; code?: string } {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const parts: string[] = [];
  let code: string | undefined;

  const walk = (err: unknown): void => {
    if (!err) return;
    if (err instanceof Error) {
      if (err.message && !parts.includes(err.message)) parts.push(err.message);
      const e = err as NodeJS.ErrnoException;
      if (typeof e.code === "string" && !code) code = e.code;
      walk(err.cause);
    }
    if (typeof AggregateError !== "undefined" && err instanceof AggregateError) {
      for (const sub of err.errors) walk(sub);
    }
  };

  walk(error);

  const message = parts.filter(Boolean).join(" · ") || error.message || "fetch failed";
  return { message, code };
}
