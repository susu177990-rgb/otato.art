"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@rjsf/utils";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "../skill-form.module.css";

type AssetRow = {
  asset_id: string;
  role_tag: string;
  asset_url: string;
  description?: string;
};

type ItemSchema = {
  properties?: {
    role_tag?: {
      enum?: string[];
      default?: string;
    };
  };
};

function newAssetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssetUploaderWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange, schema } = props;
  const rows = (Array.isArray(value) ? value : []) as AssetRow[];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roleOptions = useMemo(() => {
    const itemSchema = (schema.items ?? {}) as ItemSchema;
    const enumValues = itemSchema.properties?.role_tag?.enum;
    if (Array.isArray(enumValues) && enumValues.length > 0) {
      return enumValues;
    }
    return ["角色", "场景", "道具", "服装", "风格"];
  }, [schema.items]);

  const defaultRoleTag = useMemo(() => {
    const itemSchema = (schema.items ?? {}) as ItemSchema;
    return itemSchema.properties?.role_tag?.default ?? roleOptions[0] ?? "角色";
  }, [roleOptions, schema.items]);

  const setRows = useCallback(
    (next: AssetRow[]) => {
      onChange(next);
    },
    [onChange],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || disabled || readonly) return;
    setUploadError(null);
    setUploading(true);
    const next = [...rows];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`「${file.name}」不是图片文件`);
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/skill-assets/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || "上传失败");
        }
        const data = (await res.json()) as { url: string };
        next.push({
          asset_id: newAssetId(),
          role_tag: defaultRoleTag,
          asset_url: data.url,
          description: file.name.replace(/\.[^.]+$/, ""),
        });
      }
      setRows(next);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateRow = (index: number, patch: Partial<AssetRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setRows(next);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.assetUploader} id={id}>
      {schema.description ? <p className={shellStyles.helpText}>{schema.description}</p> : null}

      {rows.length > 0 ? (
        <div className={styles.assetList}>
          {rows.map((row, index) => (
            <div key={`${row.asset_id}-${index}`} className={styles.assetRow}>
              <img src={row.asset_url} alt="" className={styles.assetThumb} />
              <div className={styles.assetFields}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>资产角色</span>
                  <select
                    className={shellStyles.select}
                    value={row.role_tag}
                    disabled={disabled || readonly}
                    onChange={(e) => updateRow(index, { role_tag: e.target.value })}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>资产描述</span>
                  <input
                    className={shellStyles.input}
                    type="text"
                    value={row.description ?? ""}
                    disabled={disabled || readonly}
                    placeholder="可选"
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                  />
                </label>
              </div>
              {!readonly && !disabled ? (
                <button type="button" className={[shellStyles.button, shellStyles.buttonDanger, styles.assetRemove].join(" ")} onClick={() => removeRow(index)}>
                  移除
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.assetDropHint}>尚未添加参考图</div>
      )}

      {!readonly && !disabled ? (
        <div className={styles.assetActions}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.hiddenFile}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            className={shellStyles.button}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "上传中…" : "添加参考图"}
          </button>
        </div>
      ) : null}

      {uploadError ? <p className={shellStyles.bannerError}>{uploadError}</p> : null}
    </div>
  );
}
