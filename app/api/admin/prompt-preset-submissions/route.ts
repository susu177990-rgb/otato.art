import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { writeAuditLog } from "@/lib/admin/user-management";
import { formatDbError } from "@/lib/db/format-db-error";
import {
  getPromptPresetSubmission,
  listPromptPresetSubmissions,
  markPromptPresetSubmissionReviewed,
  upsertSitePromptPreset,
  type PromptPresetSubmissionStatus,
} from "@/lib/db/prompt-preset-store";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeStatus(raw: string | null): PromptPresetSubmissionStatus | "all" {
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "pending";
}

function publishedPresetIdForSubmission(submissionId: string): string {
  return submissionId.startsWith("submission_")
    ? `community_${submissionId.slice("submission_".length)}`
    : `community_${submissionId}`;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const status = normalizeStatus(new URL(req.url).searchParams.get("status"));
    const readClient = maybeCreateSupabaseAdminClient() ?? auth.supabase;
    const submissions = await listPromptPresetSubmissions(readClient, status);
    return NextResponse.json({ submissions });
  } catch (e) {
    console.error("[admin/prompt-preset-submissions GET]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = (await req.json()) as {
      submissionId?: unknown;
      action?: unknown;
      reviewNote?: unknown;
    };
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
    const action = typeof body.action === "string" ? body.action : "";
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
    if (!submissionId) return NextResponse.json({ error: "submissionId 不能为空" }, { status: 400 });
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action 必须是 approve / reject" }, { status: 400 });
    }

    const writeClient = maybeCreateSupabaseAdminClient() ?? auth.supabase;
    const submission = await getPromptPresetSubmission(writeClient, submissionId);
    if (!submission) return NextResponse.json({ error: "投稿不存在" }, { status: 404 });
    if (submission.status !== "pending") {
      return NextResponse.json({ error: "这条投稿已经审核过" }, { status: 409 });
    }

    if (action === "reject") {
      const reviewed = await markPromptPresetSubmissionReviewed(writeClient, submissionId, {
        status: "rejected",
        reviewedBy: auth.user.id,
        reviewNote,
      });
      await writeAuditLog(writeClient, {
        actor: auth.actor,
        action: "prompt_submission.reject",
        targetUserId: submission.submitterUserId,
        targetEmail: submission.submitterEmail ?? null,
        metadata: { submissionId, kind: submission.kind, title: submission.title },
      });
      return NextResponse.json({ submission: reviewed });
    }

    const publishedPresetId = publishedPresetIdForSubmission(submission.id);
    const publishedPreset = await upsertSitePromptPreset(writeClient, submission.kind, {
      id: publishedPresetId,
      kind: submission.kind,
      title: submission.title,
      promptTemplate: submission.promptTemplate,
      coverImageUrl: submission.coverImageUrl,
      refSlotHints: submission.refSlotHints,
      tags: submission.tags,
      description: submission.description,
    });
    const reviewed = await markPromptPresetSubmissionReviewed(writeClient, submissionId, {
      status: "approved",
      reviewedBy: auth.user.id,
      publishedPresetId: publishedPreset.id,
      reviewNote,
    });
    await writeAuditLog(writeClient, {
      actor: auth.actor,
      action: "prompt_submission.approve",
      targetUserId: submission.submitterUserId,
      targetEmail: submission.submitterEmail ?? null,
      metadata: { submissionId, publishedPresetId: publishedPreset.id, kind: submission.kind, title: submission.title },
    });
    return NextResponse.json({ submission: reviewed, preset: publishedPreset });
  } catch (e) {
    console.error("[admin/prompt-preset-submissions PATCH]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
