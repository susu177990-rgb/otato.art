import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCreditBalanceSnapshot } from "@/lib/credits/accounts";
import { CreditPricingError, quoteImageCredits, quoteVideoCredits } from "@/lib/credits/pricing";
import { IMAGE_MODEL_ORDER, type GptImageQuality, type ImageModelId, type ImageSizeTier } from "@/lib/image-workspace";
import {
  VIDEO_MODEL_ORDER,
  isDisabledVideoModel,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";

function imageSize(value: unknown): ImageSizeTier {
  return value === "2K" || value === "4K" ? value : "1K";
}

function gptQuality(value: unknown): GptImageQuality | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : "low";
}

function videoMode(value: unknown): VideoGenerationModeId | null {
  if (
    value === "text_to_video" ||
    value === "start_frame" ||
    value === "start_end_frame" ||
    value === "multi_image_reference" ||
    value === "video_edit" ||
    value === "motion_control"
  ) {
    return value;
  }
  return null;
}

function videoResolution(value: unknown): VideoResolution | null {
  if (value === "480p" || value === "720p" || value === "1080p" || value === "4k") return value;
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === "video" ? "video" : body.kind === "image" ? "image" : null;
  if (!kind) return Response.json({ error: "quote kind 无效" }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    let quote;
    if (kind === "image") {
      if (!IMAGE_MODEL_ORDER.includes(body.modelId as ImageModelId)) {
        return Response.json({ error: "图片模型无效" }, { status: 400 });
      }
      quote = await quoteImageCredits(admin, {
        feature: "image",
        modelId: body.modelId as ImageModelId,
        imageSize: imageSize(body.imageSize),
        gptImageQuality: gptQuality(body.gptImageQuality),
      });
    } else {
      const modeId = videoMode(body.modeId);
      const resolution = videoResolution(body.resolution);
      if (!VIDEO_MODEL_ORDER.includes(body.modelId as VideoModelId) || isDisabledVideoModel(body.modelId as VideoModelId)) {
        return Response.json({ error: "视频模型无效" }, { status: 400 });
      }
      if (!modeId) return Response.json({ error: "视频模式无效" }, { status: 400 });
      if (!resolution) return Response.json({ error: "视频分辨率无效" }, { status: 400 });
      quote = await quoteVideoCredits(admin, {
        feature: "video",
        modelId: body.modelId as VideoModelId,
        modeId,
        resolution,
        durationSeconds: Number(body.durationSeconds),
      });
    }
    const balance = await getCreditBalanceSnapshot(supabase, user.id);
    return Response.json({
      quote,
      balance: {
        availableCredits: balance.account.availableCredits,
        reservedCredits: balance.account.reservedCredits,
        enough: balance.account.availableCredits >= quote.credits,
      },
    });
  } catch (error) {
    if (error instanceof CreditPricingError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
