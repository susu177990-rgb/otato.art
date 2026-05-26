import { NextResponse } from "next/server";
import { formatDbError } from "@/lib/db/format-db-error";
import { getSiteSkillPackById } from "@/lib/db/site-skill-store";
import type { ImageModelId } from "@/lib/image-workspace";
import { runSkillForm } from "@/lib/skills/run-skill-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RunBody = {
  packId?: string;
  payload?: unknown;
  preferredImageModelId?: ImageModelId;
  action?: "prompt" | "generate";
  masterPrompt?: string;
};

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json()) as RunBody;
    const packId = body.packId?.trim();
    if (!packId) return NextResponse.json({ error: "packId 必填" }, { status: 400 });
    if (body.payload === undefined) {
      return NextResponse.json({ error: "payload 必填" }, { status: 400 });
    }

    const pack = await getSiteSkillPackById(supabase, packId);
    if (!pack) return NextResponse.json({ error: "Skill 包不存在" }, { status: 404 });

    const result = await runSkillForm({
      supabase,
      userId: user.id,
      pack,
      payload: body.payload,
      preferredImageModelId: body.preferredImageModelId,
      action: body.action,
      masterPrompt: body.masterPrompt,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "执行失败";
    console.error("[skills/run]", e);
    const status = /不存在|缺少|无效|请/.test(message) ? 400 : 500;
    return NextResponse.json({ error: formatDbError(e) || message }, { status });
  }
}
