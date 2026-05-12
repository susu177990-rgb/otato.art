"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginInner() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "登录失败");
        return;
      }
      const next = searchParams.get("next") || "/";
      window.location.assign(next.startsWith("/") ? next : "/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/30"
      >
        <div className="mb-5">
          <h1 className="text-lg font-semibold tracking-tight">剧本工作台</h1>
          <p className="mt-1 text-xs text-zinc-500">请输入访问密码</p>
        </div>

        <label className="block text-xs font-medium text-zinc-400" htmlFor="site-password">
          密码
        </label>
        <input
          id="site-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-indigo-500"
          placeholder="输入密码"
        />
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "验证中..." : "进入"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center bg-zinc-950 text-zinc-500">
          加载中...
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

