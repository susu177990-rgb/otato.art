import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { writeAuditLog } from "@/lib/admin/user-management";
import { getWorkspaceSnapshot, upsertWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergePreserveApiKeysForModels(
  incomingRaw: unknown,
  existingRaw: unknown,
): UnknownRecord {
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  const existing = isObject(existingRaw) ? existingRaw : {};
  const next: UnknownRecord = { ...incoming };

  for (const [modelId, rawIncomingModel] of Object.entries(incoming)) {
    const incomingModel = isObject(rawIncomingModel) ? rawIncomingModel : {};
    const existingModel = isObject(existing[modelId]) ? (existing[modelId] as UnknownRecord) : {};
    const incomingApiKey = text(incomingModel.apiKey);
    const existingApiKey = text(existingModel.apiKey);

    if (!incomingApiKey || incomingApiKey === API_KEY_CONFIGURED_PLACEHOLDER) {
      if (existingApiKey) {
        next[modelId] = {
          ...incomingModel,
          apiKey: existingApiKey,
        };
      }
      continue;
    }
  }

  return next;
}

function preserveAdminLlmModels(incomingRaw: unknown, existingRaw: unknown): UnknownRecord {
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  const existing = isObject(existingRaw) ? existingRaw : {};
  const nextModels = mergePreserveApiKeysForModels(incoming.models, existing.models);

  if (Object.keys(nextModels).length > 0) {
    return {
      ...incoming,
      models: nextModels,
    };
  }

  return incoming;
}

function preserveAdminImageModels(incomingRaw: unknown, existingRaw: unknown): UnknownRecord {
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  const existing = isObject(existingRaw) ? existingRaw : {};
  const nextModels = mergePreserveApiKeysForModels(incoming.models, existing.models);

  return {
    ...incoming,
    models: nextModels,
  };
}

function preserveAdminVideoModels(incomingRaw: unknown, existingRaw: unknown): UnknownRecord {
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  const existing = isObject(existingRaw) ? existingRaw : {};
  const nextModels = mergePreserveApiKeysForModels(incoming.models, existing.models);

  return {
    ...incoming,
    models: nextModels,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.trim();
  }
  return "";
}

export async function GET() {
  try {
    const auth = await requireAdmin("manageSystem");
    if ("error" in auth) return auth.error;
    return NextResponse.json(await getWorkspaceSnapshot(auth.supabase));
  } catch (e) {
    console.error("[admin/workspace-settings GET]", e);
    return NextResponse.json({ error: describeError(e) || "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin("manageSystem");
    if ("error" in auth) return auth.error;
    const body = (await req.json()) as { llm?: unknown; imageWorkspace?: unknown; videoWorkspace?: unknown };
    const current = await getWorkspaceSnapshot(auth.supabase);
    const llm = preserveAdminLlmModels(body.llm, current.llm);
    const imageWorkspace = preserveAdminImageModels(body.imageWorkspace, current.imageWorkspace);
    const videoWorkspace = preserveAdminVideoModels(body.videoWorkspace, current.videoWorkspace);
    const snapshot = await upsertWorkspaceSnapshot(auth.supabase, {
      llm: llm as Parameters<typeof upsertWorkspaceSnapshot>[1]["llm"],
      imageWorkspace,
      videoWorkspace,
    });
    await writeAuditLog(auth.supabase, {
      actor: auth.actor,
      action: "workspace_settings.update",
      metadata: {
        llm: body.llm !== undefined,
        imageWorkspace: body.imageWorkspace !== undefined,
        videoWorkspace: body.videoWorkspace !== undefined,
      },
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[admin/workspace-settings POST]", e);
    return NextResponse.json({ error: describeError(e) || "write_failed" }, { status: 500 });
  }
}
