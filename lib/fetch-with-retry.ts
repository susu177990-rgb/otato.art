/** 默认认为可自动重试的上游 HTTP 状态（含限流与网关类错误） */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function peekJsonErrorField(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    const j = (await res.clone().json()) as { error?: unknown };
    return typeof j.error === "string" ? j.error : null;
  } catch {
    return null;
  }
}

function shouldRetryStatus(status: number): boolean {
  if (status === 401 || status === 403) return false;
  if (RETRYABLE_STATUS.has(status)) return true;
  return false;
}

/** 本工程路由把上游失败包装成 `API 错误 (状态): …` 时的补充判断 */
function shouldRetryFromErrorMessage(msg: string | null): boolean {
  if (!msg) return false;
  if (/API 错误\s*\((\d+)/.test(msg)) {
    const m = msg.match(/API 错误\s*\((\d+)/);
    const n = m ? parseInt(m[1], 10) : 0;
    if (n === 401 || n === 403) return false;
    if (n === 429 || n === 408) return true;
    if (n >= 500 && n < 600) return true;
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up/i.test(msg)) {
    return true;
  }
  return false;
}

export type FetchWithRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

/**
 * 对瞬时性网络 / 上游错误自动退避重试（默认最多 4 次）。
 * 不重试 401/403；对 429、5xx、408 及文案含「API 错误(5xx/429…)」的 JSON 错误会重试。
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: FetchWithRetryOptions
): Promise<Response> {
  const maxAttempts = Math.max(1, Math.min(8, opts?.maxAttempts ?? 4));
  const baseDelayMs = opts?.baseDelayMs ?? 700;
  const maxDelayMs = opts?.maxDelayMs ?? 10_000;

  let lastRes: Response | undefined;
  let lastThrow: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;

      const errHint = await peekJsonErrorField(res);
      const retry =
        attempt < maxAttempts &&
        (shouldRetryStatus(res.status) || shouldRetryFromErrorMessage(errHint));

      lastRes = res;
      if (!retry) return res;

      const backoff = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      );
      await sleep(backoff);
    } catch (e) {
      lastThrow = e;
      if (attempt >= maxAttempts) throw e;
      const backoff = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      );
      await sleep(backoff);
    }
  }

  if (lastRes) return lastRes;
  throw lastThrow instanceof Error ? lastThrow : new Error(String(lastThrow ?? "fetchWithRetry 失败"));
}
