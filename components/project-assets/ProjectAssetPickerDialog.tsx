"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectAsset } from "@/lib/project-assets";
import styles from "./project-asset-picker.module.css";

export type ProjectAssetMediaKind = "image" | "video";

export type ProjectAssetPickerDialogProps = {
  projectId: string;
  allowedKinds: ProjectAssetMediaKind[];
  onClose: () => void;
  onSelect: (asset: ProjectAsset) => void;
};

function isVideoUrl(value: string): boolean {
  return /^data:video\//i.test(value) || /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(value);
}

function assetKind(asset: ProjectAsset): ProjectAssetMediaKind {
  return isVideoUrl(asset.primaryImageUrl) ? "video" : "image";
}

function kindLabel(kind: ProjectAssetMediaKind): string {
  return kind === "video" ? "视频" : "图片";
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
  return body;
}

export function ProjectAssetPickerDialog({
  projectId,
  allowedKinds,
  onClose,
  onSelect,
}: ProjectAssetPickerDialogProps) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const allowedKindSet = useMemo(() => new Set(allowedKinds), [allowedKinds]);
  const visibleAssets = useMemo(
    () => assets.filter((asset) => allowedKindSet.has(assetKind(asset))),
    [allowedKindSet, assets],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/projects/${projectId}/assets`, { cache: "no-store" })
      .then((response) => responseJson<{ assets: ProjectAsset[] }>(response))
      .then(({ assets: nextAssets }) => {
        if (!cancelled) setAssets(nextAssets);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "加载项目素材失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="选择项目素材"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p>PROJECT ASSETS</p>
            <h3>选择项目素材</h3>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        {error ? <p className={styles.state}>{error}</p> : null}
        {loading ? <p className={styles.state}>正在加载素材...</p> : null}
        {!loading && !error && visibleAssets.length === 0 ? (
          <p className={styles.state}>当前没有可用于此槽位的项目素材。</p>
        ) : null}

        <div className={styles.grid}>
          {visibleAssets.map((asset) => {
            const kind = assetKind(asset);
            return (
              <button
                type="button"
                key={asset.id}
                className={styles.card}
                onClick={() => onSelect(asset)}
              >
                <span className={styles.media}>
                  {kind === "video" ? (
                    <video src={asset.primaryImageUrl} muted playsInline preload="metadata" />
                  ) : (
                    <span style={{ backgroundImage: `url(${JSON.stringify(asset.primaryImageUrl)})` }} />
                  )}
                </span>
                <span className={styles.badge}>{kindLabel(kind)}</span>
                <strong>{asset.name}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
