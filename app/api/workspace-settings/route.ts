import { NextResponse } from "next/server";
import type { Settings } from "@/lib/types";
import {
  canWriteWorkspaceSettingsFile,
  getMergedWorkspaceSnapshot,
  mergeLlmFromWorkspaceFile,
  writeWorkspaceSettingsToDisk,
  type WorkspaceSettingsFileV1,
} from "@/lib/workspace-settings-server";
import { mergeImageSettings, type ImageWorkspaceSettings } from "@/lib/image-workspace";

export async function GET() {
  try {
    const snapshot = getMergedWorkspaceSnapshot();
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings GET]", e);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!canWriteWorkspaceSettingsFile()) {
    return NextResponse.json(
      {
        error: "write_disabled",
        hint:
          "仅本地开发（next dev）或设置环境变量 ALLOW_WORKSPACE_SETTINGS_WRITE=1 时可写入 workspace-settings.json；线上多为只读文件系统，请在本机保存后 git commit / push。",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as { llm?: Settings; imageWorkspace?: unknown };
    const llm = mergeLlmFromWorkspaceFile(body?.llm);
    const imageWorkspace = mergeImageSettings(body?.imageWorkspace ?? {}) as ImageWorkspaceSettings;
    const payload: WorkspaceSettingsFileV1 = {
      version: 1,
      llm,
      imageWorkspace,
    };
    writeWorkspaceSettingsToDisk(payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[workspace-settings POST]", e);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}
