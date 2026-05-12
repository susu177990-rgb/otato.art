/**
 * 手动/CI 可选：`npx tsx lib/artifact-extract.stage5.smoke.ts`
 * 校验 STAGE 5 集-场-幕解析与 parentKey 链。
 */
import { extractArtifacts } from "./artifact-extract";

const sample = `
## 第1集

### 本集定位
test

### 本集剧情摘要
summary

### 场次 1
- **场次编号**：E1-S1

#### 幕 1
first beat

#### 幕 2
second beat

### 集尾卡点
hook line
`;

const r = extractArtifacts(sample, 5);
const ep = r.find((a) => a.subKey === "ep1" && !a.parentKey);
const sc = r.find((a) => a.subKey === "ep1.scene1");
const m1 = r.find((a) => a.subKey === "ep1.scene1.m1");
const m2 = r.find((a) => a.subKey === "ep1.scene1.m2");
const hook = r.find((a) => a.subKey === "ep1.hook");

if (!ep) throw new Error("missing ep1");
if (!sc) throw new Error("missing ep1.scene1");
if (!m1 || !m2) throw new Error("missing beats");
if (sc.parentKey !== "ep1") throw new Error(`scene parentKey want ep1 got ${sc.parentKey}`);
if (m1.parentKey !== "ep1.scene1") throw new Error("m1 parentKey");
if (!hook || hook.parentKey !== "ep1") throw new Error("hook parentKey");

console.log("artifact-extract stage5 smoke: ok", r.length, "artifacts");
