import type { ImageWorkspaceSettings } from "@/lib/image-workspace";
import type { Settings } from "@/lib/types";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";

export async function fetchWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/workspace-settings", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("无法加载工作区设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function saveWorkspaceSnapshot(payload: {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
}): Promise<WorkspaceSnapshot> {
  const res = await fetch("/api/workspace-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("无法保存工作区设置");
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function fetchGalleryRecords() {
  const res = await fetch("/api/image/gallery", { cache: "no-store" });
  if (!res.ok) throw new Error("无法加载画廊");
  const data = (await res.json()) as { records: import("@/lib/image-workspace").ImageGalleryRecord[] };
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
