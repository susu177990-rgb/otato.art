#!/usr/bin/env node
/**
 * Next standalone 不会自动带上 public、.next/static，或通过 fs 读取的仓库资源；
 * 构建后复制到 .next/standalone/，让 node .next/standalone/server.js 可独立运行。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const standaloneRoot = path.join(repoRoot, ".next", "standalone");

const COPY_TARGETS = [
  { from: "agent", to: "agent", required: true },
  { from: "public", to: "public", required: false },
  { from: ".next/static", to: ".next/static", required: true },
];

if (!fs.existsSync(standaloneRoot)) {
  console.warn(`[copy-repo-assets-to-standalone] skip: ${standaloneRoot} missing (no standalone build?)`);
  process.exit(0);
}

for (const target of COPY_TARGETS) {
  const src = path.join(repoRoot, target.from);
  const dest = path.join(standaloneRoot, target.to);
  if (!fs.existsSync(src)) {
    const level = target.required ? "warn" : "log";
    console[level](`[copy-repo-assets-to-standalone] skip missing source: ${src}`);
    continue;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-repo-assets-to-standalone] ${target.from} -> ${dest}`);
}
