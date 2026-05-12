import path from "path";

/** 仓库根（含 agent/、knowledge/、skills/）。服务器或自定义布局可通过 SCRIPT_AGENT_ROOT 覆盖。 */
export function resolveAgentRoot(): string {
  const env = process.env.SCRIPT_AGENT_ROOT?.trim();
  if (env) return path.resolve(env);
  return process.cwd();
}

/** 项目 JSON 目录。可通过 SCRIPT_AGENT_DATA_DIR 指向持久化卷。 */
export function resolveDataProjectsDir(): string {
  const env = process.env.SCRIPT_AGENT_DATA_DIR?.trim();
  if (env) return path.resolve(env);
  return path.join(process.cwd(), "data", "projects");
}
