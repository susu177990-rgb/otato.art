import type { ImageWorkspaceSettings } from "@/lib/image-workspace";
import type { VideoWorkspaceSettings } from "@/lib/video-workspace";
import type { Settings } from "@/lib/types";
import type { ApiUsageMode, WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import type { PersonalApiModule, PersonalApiTestResult } from "@/lib/personal-api-test";

export async function fetchWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/workspace-settings", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("无法加载工作区设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function saveWorkspaceSnapshot(payload: {
  llm?: Settings;
  imageWorkspace?: ImageWorkspaceSettings;
  videoWorkspace?: VideoWorkspaceSettings;
  apiUsageMode?: ApiUsageMode;
  publicApiAccess?: Record<string, unknown>;
}): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/workspace-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error?.trim() || "无法保存工作区设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function testWorkspaceApiConnection(payload: {
  module: PersonalApiModule;
  modelId: string;
}): Promise<PersonalApiTestResult> {
  const res = await fetch("/api/workspace-settings/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<PersonalApiTestResult> & { error?: string };
  if (data.code && data.module && data.stage && data.message) {
    return data as PersonalApiTestResult;
  }
  return {
    ok: false,
    code: res.ok ? "TEST_RESPONSE_INVALID" : "TEST_CONNECTION_FAILED",
    module: payload.module,
    modelId: payload.modelId,
    stage: "upstream_submit",
    message: data.error?.trim() || "测试连接失败",
  };
}

export async function fetchAdminWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/admin/workspace-settings", { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error?.trim() || "无法加载全局设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function saveAdminWorkspaceSnapshot(payload: {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
  videoWorkspace: VideoWorkspaceSettings;
}): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/admin/workspace-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error?.trim() || "无法保存全局设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function uploadImageModeCover(
  modeId: string,
  file: File,
): Promise<{ coverImageUrl: string; imageWorkspace: ImageWorkspaceSettings }> {
  const fd = new FormData();
  fd.set("modeId", modeId);
  fd.set("file", file);
  const res = await fetch("/api/image-mode-covers", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    coverImageUrl?: string;
    imageWorkspace?: ImageWorkspaceSettings;
  };
  if (!res.ok) throw new Error(data.error?.trim() || "无法上传模式封面");
  if (!data.coverImageUrl || !data.imageWorkspace) throw new Error("上传封面响应不完整");
  return { coverImageUrl: data.coverImageUrl, imageWorkspace: data.imageWorkspace };
}

export async function deleteImageModeCover(
  modeId: string,
): Promise<{ imageWorkspace: ImageWorkspaceSettings }> {
  const res = await fetch("/api/image-mode-covers", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modeId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    imageWorkspace?: ImageWorkspaceSettings;
  };
  if (!res.ok) throw new Error(data.error?.trim() || "无法删除模式封面");
  if (!data.imageWorkspace) throw new Error("删除封面响应不完整");
  return { imageWorkspace: data.imageWorkspace };
}

export async function uploadVideoModeCover(
  modeId: string,
  file: File,
): Promise<{ coverImageUrl: string; videoWorkspace: VideoWorkspaceSettings }> {
  const fd = new FormData();
  fd.set("modeId", modeId);
  fd.set("file", file);
  const res = await fetch("/api/video-mode-covers", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    coverImageUrl?: string;
    videoWorkspace?: VideoWorkspaceSettings;
  };
  if (!res.ok) throw new Error(data.error?.trim() || "无法上传模式封面");
  if (!data.coverImageUrl || !data.videoWorkspace) throw new Error("上传封面响应不完整");
  return { coverImageUrl: data.coverImageUrl, videoWorkspace: data.videoWorkspace };
}

export async function deleteVideoModeCover(
  modeId: string,
): Promise<{ videoWorkspace: VideoWorkspaceSettings }> {
  const res = await fetch("/api/video-mode-covers", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modeId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    videoWorkspace?: VideoWorkspaceSettings;
  };
  if (!res.ok) throw new Error(data.error?.trim() || "无法删除模式封面");
  if (!data.videoWorkspace) throw new Error("删除封面响应不完整");
  return { videoWorkspace: data.videoWorkspace };
}

export async function fetchGalleryRecords() {
  const res = await fetch("/api/image/gallery", { cache: "no-store" });
  if (!res.ok) throw new Error("无法加载画廊");
  const data = (await res.json()) as { records: import("@/lib/image-workspace").ImageGalleryRecord[] };
  return data.records;
}

export async function fetchVideoGalleryRecords() {
  const res = await fetch("/api/video/gallery", { cache: "no-store" });
  if (!res.ok) throw new Error("无法加载生视频记录");
  const data = (await res.json()) as { records: import("@/lib/video-gallery").VideoGalleryRecord[] };
  return data.records;
}

export async function prependVideoGalleryRecordApi(record: import("@/lib/video-gallery").VideoGalleryRecord) {
  const res = await fetch("/api/video/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepend", record }),
  });
  if (!res.ok) throw new Error("无法保存生视频记录");
  const data = (await res.json()) as { records: import("@/lib/video-gallery").VideoGalleryRecord[] };
  return data.records;
}

export async function replaceVideoGalleryRecordsApi(records: import("@/lib/video-gallery").VideoGalleryRecord[]) {
  const res = await fetch("/api/video/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "replace", records }),
  });
  if (!res.ok) throw new Error("无法更新生视频记录");
  const data = (await res.json()) as { records: import("@/lib/video-gallery").VideoGalleryRecord[] };
  return data.records;
}

export async function importVideoGalleryRecordsApi(records: import("@/lib/video-gallery").VideoGalleryRecord[]) {
  const res = await fetch("/api/video/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "import", records }),
  });
  if (!res.ok) throw new Error("无法导入生视频记录");
  const data = (await res.json()) as { records: import("@/lib/video-gallery").VideoGalleryRecord[] };
  return data.records;
}

export async function prependGalleryRecordApi(
  record: import("@/lib/image-workspace").ImageGalleryRecord,
) {
  const res = await fetch("/api/image/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepend", record }),
  });
  if (!res.ok) throw new Error("无法保存画廊记录");
  const data = (await res.json()) as { records: import("@/lib/image-workspace").ImageGalleryRecord[] };
  return data.records;
}

export async function replaceGalleryRecordsApi(
  records: import("@/lib/image-workspace").ImageGalleryRecord[],
) {
  const res = await fetch("/api/image/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "replace", records }),
  });
  if (!res.ok) throw new Error("无法更新画廊");
  const data = (await res.json()) as { records: import("@/lib/image-workspace").ImageGalleryRecord[] };
  return data.records;
}

export async function importGalleryRecordsApi(
  records: import("@/lib/image-workspace").ImageGalleryRecord[],
) {
  const res = await fetch("/api/image/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "import", records }),
  });
  if (!res.ok) throw new Error("无法导入画廊");
  const data = (await res.json()) as { records: import("@/lib/image-workspace").ImageGalleryRecord[] };
  return data.records;
}
