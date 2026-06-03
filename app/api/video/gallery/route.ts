import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  importVideoGalleryRecords,
  listVideoGalleryRecords,
  prependVideoGalleryRecord,
  replaceVideoGalleryRecords,
} from "@/lib/db/video-gallery-store";
import type { VideoGalleryRecord } from "@/lib/video-gallery";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const records = await listVideoGalleryRecords(supabase);
    return NextResponse.json({ records });
  } catch (e) {
    console.error("[video/gallery GET]", e);
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
      record?: VideoGalleryRecord;
      records?: VideoGalleryRecord[];
    };

    if (body.action === "prepend" && body.record) {
      const records = await prependVideoGalleryRecord(supabase, body.record);
      return NextResponse.json({ records });
    }

    if (body.action === "replace" && Array.isArray(body.records)) {
      await replaceVideoGalleryRecords(supabase, body.records);
      const records = await listVideoGalleryRecords(supabase);
      return NextResponse.json({ records });
    }

    if (body.action === "import" && Array.isArray(body.records)) {
      await importVideoGalleryRecords(supabase, body.records);
      const records = await listVideoGalleryRecords(supabase);
      return NextResponse.json({ records });
    }

    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  } catch (e) {
    console.error("[video/gallery POST]", e);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}

