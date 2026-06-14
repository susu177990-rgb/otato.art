"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROJECT_ASSET_IMAGE_MAX_BYTES,
  PROJECT_ASSET_REFERENCE_LIMIT,
  PROJECT_ASSET_TYPES,
  projectAssetsToMentionCandidates,
  type ProjectAsset,
  type ProjectAssetInput,
  type ProjectAssetType,
  type ProjectGalleryItem,
} from "@/lib/project-assets";
import type { AssetMentionCandidate } from "@/lib/asset-mentions";
import { ProjectGallery } from "./ProjectGallery";
import styles from "./project-assets.module.css";

const TYPE_LABELS: Record<ProjectAssetType, string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
};

const ACCEPTED_IMAGE_MIME_RE = /^image\/(?:png|jpe?g|webp|gif|bmp|avif)$/i;

type Draft = ProjectAssetInput & {
  id?: string;
  sourceGalleryRecordId?: string;
};

const EMPTY_DRAFT: Draft = {
  type: "character",
  name: "",
  description: "",
  tags: [],
  primaryImageUrl: "",
  referenceImageUrls: [],
};

export type ProjectAssetLibraryProps = {
  projectId: string;
  onMentionCandidatesChange?: (candidates: AssetMentionCandidate[]) => void;
};

async function readFileDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_MIME_RE.test(file.type)) {
    throw new Error("素材图片只支持 PNG、JPEG、WebP、GIF、BMP 或 AVIF");
  }
  if (file.size > PROJECT_ASSET_IMAGE_MAX_BYTES) {
    throw new Error("单张素材图片不能超过 20MB");
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
  return body;
}

export function ProjectAssetLibrary({
  projectId,
  onMentionCandidatesChange,
}: ProjectAssetLibraryProps) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [galleryItems, setGalleryItems] = useState<ProjectGalleryItem[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [activeType, setActiveType] = useState<ProjectAssetType | "all">("all");
  const [view, setView] = useState<"assets" | "gallery">("assets");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    onMentionCandidatesChange?.(projectAssetsToMentionCandidates(assets));
  }, [assets, onMentionCandidatesChange]);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => activeType === "all" || asset.type === activeType),
    [activeType, assets],
  );

  const resetDraft = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const editAsset = useCallback((asset: ProjectAsset) => {
    setDraft({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      primaryImageUrl: asset.primaryImageUrl,
      referenceImageUrls: asset.referenceImageUrls,
    });
    setView("assets");
  }, []);

  const convertGalleryImage = useCallback(
    (item: Extract<ProjectGalleryItem, { kind: "image" }>) => {
      setDraft({
        ...EMPTY_DRAFT,
        name: item.name,
        description: item.description,
        primaryImageUrl: item.mediaUrl,
        sourceGalleryRecordId: item.sourceRecordId,
      });
      setView("assets");
    },
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/projects/${projectId}/assets/${draft.id}`
          : `/api/projects/${projectId}/assets`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
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
        if (draft.id === assetId) resetDraft();
        await load();
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : "删除素材失败");
      }
    },
    [draft.id, load, projectId, resetDraft],
  );

  return (
    <section className={styles.library}>
      <header className={styles.header}>
        <div>
          <p>PROJECT MEDIA</p>
          <h2>项目素材与画廊</h2>
        </div>
        <div className={styles.viewTabs}>
          <button
            type="button"
            aria-pressed={view === "assets"}
            onClick={() => setView("assets")}
          >
            素材库
          </button>
          <button
            type="button"
            aria-pressed={view === "gallery"}
            onClick={() => setView("gallery")}
          >
            统一画廊
          </button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {view === "gallery" ? (
        <ProjectGallery
          items={galleryItems}
          loading={loading}
          onConvertImage={convertGalleryImage}
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
              {visibleAssets.map((asset) => (
                <article className={styles.assetCard} key={asset.id}>
                  <button
                    type="button"
                    className={styles.assetPreview}
                    style={{
                      backgroundImage: `url(${JSON.stringify(asset.primaryImageUrl)})`,
                    }}
                    onClick={() => editAsset(asset)}
                    aria-label={`编辑 ${asset.name}`}
                  />
                  <div className={styles.cardBody}>
                    <span>{TYPE_LABELS[asset.type]}</span>
                    <strong>{asset.name}</strong>
                    {asset.description ? <p>{asset.description}</p> : null}
                    <div className={styles.tags}>
                      {asset.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <div className={styles.cardActions}>
                      <button type="button" onClick={() => editAsset(asset)}>编辑</button>
                      <button type="button" onClick={() => void remove(asset.id)}>删除</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h3>{draft.id ? "编辑素材" : draft.sourceGalleryRecordId ? "画廊转素材" : "新增素材"}</h3>
            <label>
              分类
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as ProjectAssetType,
                  }))
                }
              >
                {PROJECT_ASSET_TYPES.map((type) => (
                  <option value={type} key={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input
                value={draft.name}
                maxLength={120}
                required
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              描述
              <textarea
                value={draft.description}
                maxLength={4000}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <label>
              标签
              <input
                value={(draft.tags ?? []).join(", ")}
                placeholder="服装, 年龄, 风格"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                  }))
                }
              />
            </label>
            <label>
              主图
              <input
                type="file"
                accept="image/*"
                required={!draft.primaryImageUrl}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const primaryImageUrl = await readFileDataUrl(file);
                    setDraft((current) => ({ ...current, primaryImageUrl }));
                    setError("");
                  } catch (readError) {
                    setError(readError instanceof Error ? readError.message : "读取主图失败");
                  }
                }}
              />
            </label>
            {draft.primaryImageUrl ? (
              <div
                className={styles.formPreview}
                style={{
                  backgroundImage: `url(${JSON.stringify(draft.primaryImageUrl)})`,
                }}
              />
            ) : null}
            <label>
              参考图（最多 {PROJECT_ASSET_REFERENCE_LIMIT} 张）
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (event) => {
                  try {
                    const files = Array.from(event.target.files ?? []).slice(
                      0,
                      PROJECT_ASSET_REFERENCE_LIMIT,
                    );
                    const referenceImageUrls = await Promise.all(files.map(readFileDataUrl));
                    setDraft((current) => ({ ...current, referenceImageUrls }));
                    setError("");
                  } catch (readError) {
                    setError(readError instanceof Error ? readError.message : "读取参考图失败");
                  }
                }}
              />
            </label>
            <div className={styles.referenceGrid}>
              {(draft.referenceImageUrls ?? []).map((url, index) => (
                <button
                  type="button"
                  key={`${url.slice(0, 32)}-${index}`}
                  style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
                  aria-label={`移除参考图 ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      referenceImageUrls: (current.referenceImageUrls ?? []).filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                />
              ))}
            </div>
            <div className={styles.formActions}>
              <button type="submit" disabled={saving || !draft.primaryImageUrl || !draft.name.trim()}>
                {saving ? "保存中..." : "保存素材"}
              </button>
              {(draft.id || draft.sourceGalleryRecordId || draft.name) ? (
                <button type="button" onClick={resetDraft}>取消</button>
              ) : null}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
