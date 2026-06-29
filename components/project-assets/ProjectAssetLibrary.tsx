"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PROJECT_ASSET_IMAGE_MAX_BYTES,
  PROJECT_ASSET_VIDEO_MAX_BYTES,
  PROJECT_ASSET_TYPES,
  projectAssetsToMentionCandidates,
  type ProjectAsset,
  type ProjectAssetInput,
  type ProjectAssetType,
  type ProjectGalleryItem,
} from "@/lib/project-assets";
import type { AssetMentionCandidate } from "@/lib/asset-mentions";
import {
  DeleteIcon,
  DownloadIcon,
  downloadMediaUrl,
  ProjectGallery,
  safeMediaDownloadName,
} from "./ProjectGallery";
import styles from "./project-assets.module.css";

const TYPE_LABELS: Record<ProjectAssetType, string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
};

const ACCEPTED_MEDIA_MIME_RE = /^(?:image\/(?:png|jpe?g|webp|gif|bmp|avif)|video\/(?:mp4|webm|quicktime|x-m4v|ogg))$/i;
const VIDEO_MIME_RE = /^video\//i;

type Draft = ProjectAssetInput & {
  id: string;
};

export type ProjectAssetLibraryProps = {
  projectId: string;
  onClose?: () => void;
  onMentionCandidatesChange?: (candidates: AssetMentionCandidate[]) => void;
};

function isVideoUrl(value: string): boolean {
  return /^data:video\//i.test(value) || /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(value);
}

function assetMediaLabel(url: string): string {
  return isVideoUrl(url) ? "视频" : "图片";
}

function assetDownloadKind(url: string): "image" | "video" {
  return isVideoUrl(url) ? "video" : "image";
}

function fileNameWithoutExtension(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").trim() || "未命名素材";
}

function fileNameFromMediaUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    const decoded = decodeURIComponent(segment).trim();
    const name = decoded.replace(/\.[^.]+$/, "").trim();
    return name || fallback || "未命名素材";
  } catch {
    const segment = url.split(/[?#]/)[0]?.split("/").filter(Boolean).at(-1) ?? "";
    const name = decodeURIComponent(segment).replace(/\.[^.]+$/, "").trim();
    return name || fallback || "未命名素材";
  }
}

function validateMediaFile(file: File) {
  if (!ACCEPTED_MEDIA_MIME_RE.test(file.type)) {
    throw new Error("素材只支持图片或 MP4、WebM、MOV 视频");
  }
  const limit = VIDEO_MIME_RE.test(file.type) ? PROJECT_ASSET_VIDEO_MAX_BYTES : PROJECT_ASSET_IMAGE_MAX_BYTES;
  if (file.size > limit) {
    throw new Error(`单个素材不能超过 ${Math.floor(limit / 1024 / 1024)}MB`);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
  return body;
}

export function ProjectAssetLibrary({
  projectId,
  onClose,
  onMentionCandidatesChange,
}: ProjectAssetLibraryProps) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [galleryItems, setGalleryItems] = useState<ProjectGalleryItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeType, setActiveType] = useState<ProjectAssetType | "all">("all");
  const [view, setView] = useState<"assets" | "gallery">("assets");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assetsResponse, galleryResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/assets`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/gallery`, { cache: "no-store" }),
      ]);
      const [{ assets: nextAssets }, { items }] = await Promise.all([
        responseJson<{ assets: ProjectAsset[] }>(assetsResponse),
        responseJson<{ items: ProjectGalleryItem[] }>(galleryResponse),
      ]);
      setAssets(nextAssets);
      setGalleryItems(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载素材失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDraft(null);
  }, [projectId]);

  useEffect(() => {
    onMentionCandidatesChange?.(projectAssetsToMentionCandidates(assets));
  }, [assets, onMentionCandidatesChange]);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => activeType === "all" || asset.type === activeType),
    [activeType, assets],
  );

  const resetDraft = useCallback(() => setDraft(null), []);

  const editAsset = useCallback((asset: ProjectAsset) => {
    setDraft({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      primaryImageUrl: asset.primaryImageUrl,
      referenceImageUrls: [],
    });
    setView("assets");
  }, []);

  const createAsset = useCallback(
    async (input: ProjectAssetInput): Promise<ProjectAsset> => {
      const response = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const { asset } = await responseJson<{ asset: ProjectAsset }>(response);
      return asset;
    },
    [projectId],
  );

  const uploadAssetFile = useCallback(
    async (file: File): Promise<ProjectAsset> => {
      validateMediaFile(file);
      const form = new FormData();
      form.append("file", file, file.name || "asset");
      form.append("type", activeType === "all" ? "character" : activeType);
      form.append("name", fileNameWithoutExtension(file));
      form.append("description", "");
      form.append("tags", "[]");
      const response = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
      });
      const { asset } = await responseJson<{ asset: ProjectAsset }>(response);
      return asset;
    },
    [activeType, projectId],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileList = Array.from(files);
      if (fileList.length === 0) return;
      setSaving(true);
      setError("");
      try {
        let lastCreated: ProjectAsset | null = null;
        for (const file of fileList) {
          lastCreated = await uploadAssetFile(file);
        }
        setView("assets");
        await load();
        if (lastCreated) editAsset(lastCreated);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "上传素材失败");
      } finally {
        setSaving(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      }
    },
    [editAsset, load, uploadAssetFile],
  );

  const convertGalleryItem = useCallback(
    async (item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>) => {
      setSaving(true);
      setError("");
      try {
        const asset = await createAsset({
          type: activeType === "all" ? "character" : activeType,
          name: fileNameFromMediaUrl(item.mediaUrl, item.name),
          description: "",
          tags: [],
          primaryImageUrl: item.mediaUrl,
          referenceImageUrls: [],
        });
        setView("assets");
        await load();
        editAsset(asset);
      } catch (convertError) {
        setError(convertError instanceof Error ? convertError.message : "转为素材失败");
      } finally {
        setSaving(false);
      }
    },
    [activeType, createAsset, editAsset, load],
  );

  const deleteGalleryItem = useCallback(
    async (item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>) => {
      setSaving(true);
      setError("");
      try {
        const response = await fetch(`/api/projects/${projectId}/gallery`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: item.kind,
            sourceRecordId: item.sourceRecordId,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "删除生成记录失败");
        }
        setGalleryItems((current) => current.filter((entry) => entry.id !== item.id));
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "删除生成记录失败");
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/assets/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          name: draft.name,
          description: "",
          tags: [],
        }),
      });
      await responseJson<{ asset: ProjectAsset }>(response);
      resetDraft();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存素材失败");
    } finally {
      setSaving(false);
    }
  }, [draft, load, projectId, resetDraft]);

  const remove = useCallback(
    async (assetId: string) => {
      setError("");
      try {
        const response = await fetch(`/api/projects/${projectId}/assets/${assetId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "删除素材失败");
        }
        if (draft?.id === assetId) resetDraft();
        await load();
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : "删除素材失败");
      }
    },
    [draft?.id, load, projectId, resetDraft],
  );

  return (
    <section className={styles.library}>
      <header className={styles.header}>
        <div className={styles.viewTabs}>
          <button
            type="button"
            aria-pressed={view === "assets"}
            onClick={() => setView("assets")}
          >
            素材
          </button>
          <button
            type="button"
            aria-pressed={view === "gallery"}
            onClick={() => setView("gallery")}
          >
            生成记录
          </button>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.uploadAction}
            disabled={saving}
            onClick={() => uploadInputRef.current?.click()}
          >
            {saving ? "处理中..." : "上传素材"}
          </button>
          <input
            ref={uploadInputRef}
            className={styles.hiddenUpload}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
            multiple
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
            }}
          />
          {onClose ? (
            <button
              type="button"
              className={styles.closeAction}
              onClick={onClose}
              aria-label="关闭素材与画廊"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {view === "gallery" ? (
        <ProjectGallery
          items={galleryItems}
          loading={loading}
          onConvertItem={convertGalleryItem}
          onDeleteItem={deleteGalleryItem}
        />
      ) : (
        <div className={styles.assetLayout}>
          <div>
            <nav className={styles.typeTabs} aria-label="素材分类">
              <button
                type="button"
                aria-pressed={activeType === "all"}
                onClick={() => setActiveType("all")}
              >
                全部
              </button>
              {PROJECT_ASSET_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  aria-pressed={activeType === type}
                  onClick={() => setActiveType(type)}
                >
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </nav>
            {loading ? <p className={styles.empty}>正在加载素材...</p> : null}
            {!loading && visibleAssets.length === 0 ? (
              <p className={styles.empty}>该分类还没有素材。</p>
            ) : null}
            <div className={styles.assetGrid}>
              {visibleAssets.map((asset) => {
                const isEditing = draft?.id === asset.id;
                return (
                <article
                  className={`${styles.assetCard} ${isEditing ? styles.assetCardEditing : ""}`}
                  key={asset.id}
                >
                  <button type="button" className={styles.assetPreview} onClick={() => editAsset(asset)} aria-label={`编辑 ${asset.name}`}>
                    {isVideoUrl(asset.primaryImageUrl) ? (
                      <video src={asset.primaryImageUrl} preload="metadata" muted playsInline />
                    ) : (
                      <span style={{ backgroundImage: `url(${JSON.stringify(asset.primaryImageUrl)})` }} />
                    )}
                    <em>{assetMediaLabel(asset.primaryImageUrl)}</em>
                  </button>
                  <div className={styles.cardBody}>
                    {isEditing && draft ? (
                      <form
                        className={styles.inlineEditor}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void save();
                        }}
                      >
                        <label>
                          <span>类型</span>
                          <select
                            aria-label="分类"
                            value={draft.type}
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, type: event.target.value as ProjectAssetType } : current,
                              )
                            }
                          >
                            {PROJECT_ASSET_TYPES.map((type) => (
                              <option value={type} key={type}>{TYPE_LABELS[type]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>名称</span>
                          <input
                            aria-label="名称"
                            value={draft.name}
                            maxLength={120}
                            required
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, name: event.target.value } : current,
                              )
                            }
                          />
                        </label>
                      </form>
                    ) : (
                        <>
                          <span>{TYPE_LABELS[asset.type]}</span>
                          <strong>{asset.name}</strong>
                          <div className={styles.galleryIconActions}>
                            <button
                              type="button"
                              className={styles.iconAction}
                              aria-label="下载素材"
                              title="下载"
                              onClick={() =>
                                downloadMediaUrl(
                                  asset.primaryImageUrl,
                                  safeMediaDownloadName(asset.name, assetDownloadKind(asset.primaryImageUrl)),
                                )
                              }
                            >
                              <DownloadIcon />
                            </button>
                            <button
                              type="button"
                              className={[styles.iconAction, styles.deleteIconAction].join(" ")}
                              aria-label="删除素材"
                              title="删除"
                              onClick={() => void remove(asset.id)}
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                      </>
                    )}
                    {isEditing ? (
                      <button
                        type="button"
                        className={styles.saveAction}
                        disabled={saving || !draft?.name.trim()}
                        onClick={() => void save()}
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                    ) : null}
                  </div>
                </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
