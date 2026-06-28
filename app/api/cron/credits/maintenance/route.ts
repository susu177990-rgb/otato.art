import { runCreditMaintenance } from "@/lib/credits/maintenance";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runCreditMaintenance());
  } catch (error) {
    const message = error instanceof Error ? error.message : "积分维护任务失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
