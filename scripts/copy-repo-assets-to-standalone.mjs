#!/usr/bin/env node
/**
 * Next standalone 不会自动带上通过 fs 读取的仓库资源；构建后复制到 .next/standalone/，
 * 与 resolveAgentRoot()（根目录运行时指向仓库根）一致。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const standaloneRoot = path.join(repoRoot, ".next", "standalone");

const DIRS = ["agent", "knowledge", "skills"];

if (!fs.existsSync(standaloneRoot)) {
  console.warn(`[copy-repo-assets-to-standalone] skip: ${standaloneRoot} missing (no standalone build?)`);
  process.exit(0);
}

for (const name of DIRS) {
  const src = path.join(repoRoot, name);
  const dest = path.join(standaloneRoot, name);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-repo-assets-to-standalone] skip missing source: ${src}`);
    continue;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-repo-assets-to-standalone] ${name} -> ${dest}`);
}
