import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  compactGalleryRecords,
  importGalleryRecords,
  listGalleryRecords,
  prependGalleryRecord,
  replaceGalleryRecords,
} from "@/lib/db/gallery-store";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { projectIdFromRequest } from "@/lib/db/project-scope";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const projectId = projectIdFromRequest(req);
    const scope = projectId === undefined ? {} : { projectId };
    try {
      const records = await listGalleryRecords(supabase, undefined, scope);
      return NextResponse.json({ records });
    } catch (listError) {
      // 历史数据含内联 base64 时可能先超时；尝试 compact 后再读一次
      const msg = listError instanceof Error ? listError.message : String(listError);
      const code = listError && typeof listError === "object" && "code" in listError ? String((listError as { code?: string }).code) : "";
      if (code !== "57014" && !msg.includes("statement timeout")) throw listError;
      console.warn("[image/gallery GET] timeout, compacting and retrying", listError);
      await compactGalleryRecords(supabase);
      const records = await listGalleryRecords(supabase, undefined, scope);
      return NextResponse.json({ records });
    }
  } catch (e) {
    console.error("[image/gallery GET]", e);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = (await req.json()) as {
      action?: "prepend" | "replace" | "import";
      record?: ImageGalleryRecord;
      records?: ImageGalleryRecord[];
      projectId?: string | null;
    };
    const projectId = projectIdFromRequest(req, body.projectId);
    const scope = projectId === undefined ? {} : { projectId };

    if (body.action === "prepend" && body.record) {
      const records = await prependGalleryRecord(supabase, body.record, scope);
      return NextResponse.json({ records });
    }

    if (body.action === "replace" && Array.isArray(body.records)) {
      await replaceGalleryRecords(supabase, body.records, scope);
      const records = await listGalleryRecords(supabase, undefined, scope);
      return NextResponse.json({ records });
    }

    if (body.action === "import" && Array.isArray(body.records)) {
      await importGalleryRecords(supabase, body.records, scope);
      const records = await listGalleryRecords(supabase, undefined, scope);
      return NextResponse.json({ records });
    }

    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  } catch (e) {
    console.error("[image/gallery POST]", e);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}
