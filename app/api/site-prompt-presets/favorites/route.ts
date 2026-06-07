import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { formatDbError } from "@/lib/db/format-db-error";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json()) as { presetId?: unknown; isFavorite?: unknown };
    const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";
    const isFavorite = body.isFavorite === true;
    if (!presetId) return NextResponse.json({ error: "presetId 不能为空" }, { status: 400 });
    const writeClient = maybeCreateSupabaseAdminClient() ?? supabase;

    if (isFavorite) {
      const { data: existingPreset, error: existingPresetError } = await writeClient
        .from("site_prompt_presets")
        .select("id")
        .eq("id", presetId)
        .maybeSingle();
      if (existingPresetError) throw existingPresetError;

      if (!existingPreset) {
        await getWorkspaceSnapshot(writeClient);
        const { data: repairedPreset, error: repairedPresetError } = await writeClient
          .from("site_prompt_presets")
          .select("id")
          .eq("id", presetId)
          .maybeSingle();
        if (repairedPresetError) throw repairedPresetError;
        if (!repairedPreset) {
          return NextResponse.json(
            { error: "这个预设还没有同步到预设库，暂时无法收藏。请先到设置页保存一次该预设后再试。" },
            { status: 409 },
          );
        }
      }

      const { error } = await writeClient.from("site_prompt_preset_favorites").upsert(
        {
          user_id: user.id,
          preset_id: presetId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,preset_id" },
      );
      if (error) throw error;
    } else {
      const { error } = await writeClient
        .from("site_prompt_preset_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("preset_id", presetId);
      if (error) throw error;
    }

    return NextResponse.json({ presetId, isFavorite });
  } catch (e) {
    console.error("[site-prompt-presets/favorites PUT]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
