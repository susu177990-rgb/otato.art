"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import {
  GPT_IMAGE_QUALITY_LABELS,
  IMAGE_MODEL_ORDER,
  type ImageAspectRatio,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import shellStyles from "../shared/shell.module.css";
import styles from "./ai-live-action-page.module.css";

type UploadState = { file: File; previewUrl: string } | null;
type CharacterInput = { id: string; name: string; notes: string; image: UploadState };
type PropInput = { id: string; name: string; boundCharacterName: string; notes: string; image: UploadState };

type ReconstructResponse = {
  assetReview: string;
  reconstructionOutput: string;
  assetSummary: string;
  aspectRatio: ImageAspectRatio;
};

type RunResponse = ReconstructResponse & {
  redrawOutput: string;
  finalPrompt: string;
  negativePrompt: string;
  imageUrl: string;
  payloadKind: string;
  galleryRecordId: string;
};

const ASPECT_RATIOS: ImageAspectRatio[] = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
const IMAGE_SIZES: ImageSizeTier[] = ["1K", "2K", "4K"];

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function revokeUpload(upload: UploadState) {
  if (upload?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(upload.previewUrl);
}

function uploadFromFile(file: File): UploadState {
  return { file, previewUrl: URL.createObjectURL(file) };
}

function closestAspectRatio(width: number, height: number): ImageAspectRatio {
  if (!width || !height) return "auto";
  const ratio = width / height;
  const candidates: Array<[ImageAspectRatio, number]> = [
    ["1:1", 1],
    ["2:3", 2 / 3],
    ["3:2", 3 / 2],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["21:9", 21 / 9],
  ];
  return candidates.reduce((best, next) =>
    Math.abs(next[1] - ratio) < Math.abs(best[1] - ratio) ? next : best,
  )[0];
}

function inferImageRatio(file: File): Promise<ImageAspectRatio> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(closestAspectRatio(img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve("auto");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function UploadBox({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: UploadState;
  onChange: (next: UploadState) => void;
}) {
  return (
    <div className={styles.uploadBox}>
      <div>
        <div className={styles.uploadLabel}>
          <span>{title}</span>
          <span>{value ? "已选择" : "未选择"}</span>
        </div>
        <p className={styles.uploadHint}>{hint}</p>
      </div>
      {value ? <img src={value.previewUrl} alt={title} className={styles.preview} /> : null}
      <label className={styles.uploadButton}>
        上传图片
        <input
          className={styles.fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onChange(uploadFromFile(file));
            e.currentTarget.value = "";
          }}
        />
      </label>
      {value?.file.name ? <span className={styles.fileName}>{value.file.name}</span> : null}
    </div>
  );
}

function appendUpload(fd: FormData, key: string, upload: UploadState) {
  if (upload?.file) fd.append(key, upload.file, upload.file.name || `${key}.png`);
}

async function readApiJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error?.trim() || `请求失败 (${res.status})`);
  return data;
}

export default function AiLiveActionPage() {
  const { imageWorkspace, workspaceReady, openSettings } = useApiSettings();
  const [sceneGrid, setSceneGrid] = useState<UploadState>(null);
  const [markedSceneGrid, setMarkedSceneGrid] = useState<UploadState>(null);
  const [sourceFirstFrame, setSourceFirstFrame] = useState<UploadState>(null);
  const [characters, setCharacters] = useState<CharacterInput[]>([]);
  const [props, setProps] = useState<PropInput[]>([]);
  const [userIntent, setUserIntent] = useState("");
  const [modelId, setModelId] = useState<ImageModelId>("nano-banana-pro");
  const [imageSize, setImageSize] = useState<ImageSizeTier>("2K");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("auto");
  const [busy, setBusy] = useState<"reconstruct" | "run" | null>(null);
  const [error, setError] = useState("");
  const [reconstructResult, setReconstructResult] = useState<ReconstructResponse | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);

  const selectedModel = imageWorkspace.models[modelId];
  const modelReady = Boolean(selectedModel?.endpointUrl?.trim() && selectedModel.apiKey?.trim() && selectedModel.modelName?.trim());

  const formReady = Boolean(sceneGrid?.file && sourceFirstFrame?.file);

  const modelOptions = useMemo(
    () => IMAGE_MODEL_ORDER.map((id) => imageWorkspace.models[id]).filter(Boolean),
    [imageWorkspace.models],
  );

  const setSourceUpload = useCallback(async (next: UploadState) => {
    setSourceFirstFrame((prev) => {
      revokeUpload(prev);
      return next;
    });
    if (next?.file) setAspectRatio(await inferImageRatio(next.file));
  }, []);

  function buildFormData(): FormData {
    const fd = new FormData();
    appendUpload(fd, "sceneGridImage", sceneGrid);
    appendUpload(fd, "markedSceneGridImage", markedSceneGrid);
    appendUpload(fd, "sourceFirstFrameImage", sourceFirstFrame);
    fd.set("userIntent", userIntent);
    fd.set("aspectRatio", aspectRatio);
    fd.set("modelId", modelId);
    fd.set("imageSize", imageSize);

    const charactersMeta = characters
      .filter((item) => item.name.trim() && item.image?.file)
      .map((item, index) => {
        const fileField = `characterImage_${index}`;
        appendUpload(fd, fileField, item.image);
        return { id: item.id, name: item.name.trim(), notes: item.notes.trim(), fileField };
      });
    fd.set("charactersMeta", JSON.stringify(charactersMeta));

    const propsMeta = props
      .filter((item) => item.name.trim() && item.image?.file)
      .map((item, index) => {
        const fileField = `propImage_${index}`;
        appendUpload(fd, fileField, item.image);
        return {
          id: item.id,
          name: item.name.trim(),
          boundCharacterName: item.boundCharacterName.trim(),
          notes: item.notes.trim(),
          fileField,
        };
      });
    fd.set("propsMeta", JSON.stringify(propsMeta));
    return fd;
  }

  async function handleReconstruct() {
    setError("");
    setRunResult(null);
    if (!formReady) {
      setError("请至少上传目标场景资产宫格图和原实拍首帧图。");
      return;
    }
    setBusy("reconstruct");
    try {
      const res = await fetch("/api/ai-live-action/reconstruct", { method: "POST", body: buildFormData() });
      setReconstructResult(await readApiJson<ReconstructResponse>(res));
    } catch (e) {
      setError(e instanceof Error ? e.message : "首帧分析失败");
    } finally {
      setBusy(null);
    }
  }

  async function handleRun() {
    setError("");
    if (!formReady) {
      setError("请至少上传目标场景资产宫格图和原实拍首帧图。");
      return;
    }
    if (!modelReady) {
      setError("当前生图模型配置不完整，请先到设置页填写 Endpoint / API Key / 模型名。");
      return;
    }
    setBusy("run");
    try {
      const res = await fetch("/api/ai-live-action/run", { method: "POST", body: buildFormData() });
      const data = await readApiJson<RunResponse>(res);
      setReconstructResult(data);
      setRunResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "首帧生成失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>AI+实拍 · 首帧工作台</p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <Link href="/image/gallery" className={shellStyles.navLink}>
            图库
          </Link>
          <button type="button" onClick={openSettings} className={shellStyles.navLink}>
            设置
          </button>
        </nav>
      </header>

      <div className={shellStyles.body}>
        <div className={[shellStyles.shell, shellStyles.shellWide].join(" ")}>
          <div className={styles.layout}>
            <section className={styles.stack}>
              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h1 className={shellStyles.cardTitle}>输入素材</h1>
                    <p className={shellStyles.cardSubtitle}>一次上传，后续 Agent 自动调取素材包。</p>
                  </div>
                </div>
                <div className={styles.uploadGrid}>
                  <UploadBox
                    title="目标场景资产宫格图"
                    hint="提供场景、美术、材质、光线和空间结构。"
                    value={sceneGrid}
                    onChange={(next) => {
                      revokeUpload(sceneGrid);
                      setSceneGrid(next);
                    }}
                  />
                  <UploadBox
                    title="位置角色标识图"
                    hint="在目标场景图上标出角色位置、接触点和遮挡关系。"
                    value={markedSceneGrid}
                    onChange={(next) => {
                      revokeUpload(markedSceneGrid);
                      setMarkedSceneGrid(next);
                    }}
                  />
                  <UploadBox
                    title="原实拍视频首帧图"
                    hint="锁定动作、镜头角度、构图比例和人物轮廓。"
                    value={sourceFirstFrame}
                    onChange={(next) => void setSourceUpload(next)}
                  />
                </div>
              </div>

              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h2 className={shellStyles.cardTitle}>目标角色图</h2>
                    <p className={shellStyles.cardSubtitle}>可添加多个角色，每个角色必须绑定名称。</p>
                  </div>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => setCharacters((prev) => [...prev, { id: makeId("character"), name: "", notes: "", image: null }])}
                  >
                    添加角色
                  </button>
                </div>
                <div className={styles.itemList}>
                  {characters.length === 0 ? <p className={styles.statusLine}>暂无角色图。没有角色图也可先跑，但身份一致性会更弱。</p> : null}
                  {characters.map((item) => (
                    <div key={item.id} className={styles.assetItem}>
                      {item.image ? <img src={item.image.previewUrl} alt={item.name || "角色图"} className={styles.thumb} /> : <div className={styles.thumb} />}
                      <div className={styles.assetFields}>
                        <input
                          className={shellStyles.input}
                          placeholder="角色名称，例如：女主"
                          value={item.name}
                          onChange={(e) => setCharacters((prev) => prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))}
                        />
                        <label className={[styles.uploadButton, styles.uploadButtonSecondary].join(" ")}>
                          上传角色图
                          <input
                            className={styles.fileInput}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setCharacters((prev) =>
                                prev.map((x) => {
                                  if (x.id !== item.id) return x;
                                  revokeUpload(x.image);
                                  return { ...x, image: uploadFromFile(file) };
                                }),
                              );
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {item.image?.file.name ? <span className={styles.fileName}>{item.image.file.name}</span> : null}
                        <input
                          className={shellStyles.input}
                          placeholder="角色备注，可选"
                          value={item.notes}
                          onChange={(e) => setCharacters((prev) => prev.map((x) => (x.id === item.id ? { ...x, notes: e.target.value } : x)))}
                        />
                        <button
                          type="button"
                          className={shellStyles.buttonSubtle}
                          onClick={() => {
                            revokeUpload(item.image);
                            setCharacters((prev) => prev.filter((x) => x.id !== item.id));
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h2 className={shellStyles.cardTitle}>目标道具图</h2>
                    <p className={shellStyles.cardSubtitle}>可添加多个道具，并可绑定关联角色。</p>
                  </div>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => setProps((prev) => [...prev, { id: makeId("prop"), name: "", boundCharacterName: "", notes: "", image: null }])}
                  >
                    添加道具
                  </button>
                </div>
                <div className={styles.itemList}>
                  {props.length === 0 ? <p className={styles.statusLine}>暂无道具图。没有强制道具时可以留空。</p> : null}
                  {props.map((item) => (
                    <div key={item.id} className={styles.assetItem}>
                      {item.image ? <img src={item.image.previewUrl} alt={item.name || "道具图"} className={styles.thumb} /> : <div className={styles.thumb} />}
                      <div className={styles.assetFields}>
                        <input
                          className={shellStyles.input}
                          placeholder="道具名称，例如：手提箱"
                          value={item.name}
                          onChange={(e) => setProps((prev) => prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))}
                        />
                        <input
                          className={shellStyles.input}
                          placeholder="关联角色，可选"
                          value={item.boundCharacterName}
                          onChange={(e) => setProps((prev) => prev.map((x) => (x.id === item.id ? { ...x, boundCharacterName: e.target.value } : x)))}
                        />
                        <label className={[styles.uploadButton, styles.uploadButtonSecondary].join(" ")}>
                          上传道具图
                          <input
                            className={styles.fileInput}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setProps((prev) =>
                                prev.map((x) => {
                                  if (x.id !== item.id) return x;
                                  revokeUpload(x.image);
                                  return { ...x, image: uploadFromFile(file) };
                                }),
                              );
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {item.image?.file.name ? <span className={styles.fileName}>{item.image.file.name}</span> : null}
                        <input
                          className={shellStyles.input}
                          placeholder="道具备注，可选"
                          value={item.notes}
                          onChange={(e) => setProps((prev) => prev.map((x) => (x.id === item.id ? { ...x, notes: e.target.value } : x)))}
                        />
                        <button
                          type="button"
                          className={shellStyles.buttonSubtle}
                          onClick={() => {
                            revokeUpload(item.image);
                            setProps((prev) => prev.filter((x) => x.id !== item.id));
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={shellStyles.card}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>用户意图 / 注意事项</span>
                  <textarea
                    className={shellStyles.textarea}
                    value={userIntent}
                    onChange={(e) => setUserIntent(e.target.value)}
                    placeholder="可选。例如：女主抓着豪华游艇侧边栏杆，身体像挂在游艇一侧，镜头从下往上拍... 不填时 Agent 会根据图片自行分析。"
                  />
                </label>
                <div className={shellStyles.row}>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>生图模型</span>
                    <select className={shellStyles.select} value={modelId} onChange={(e) => setModelId(e.target.value as ImageModelId)}>
                      {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} · {model.modelName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>尺寸档位</span>
                    <select className={shellStyles.select} value={imageSize} onChange={(e) => setImageSize(e.target.value as ImageSizeTier)}>
                      {IMAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>图片比例</span>
                    <select className={shellStyles.select} value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}>
                      {ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio === "auto" ? "auto（自动）" : ratio}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={styles.statusLine}>
                  {workspaceReady ? "工作区设置已加载。" : "正在加载工作区设置..."}
                  {selectedModel?.provider === "gpt-image" ? ` GPT quality: ${GPT_IMAGE_QUALITY_LABELS[imageWorkspace.gptImageQuality]}` : ""}
                </p>
                {busy ? (
                  <p className={styles.statusLine}>
                    {busy === "reconstruct"
                      ? "正在调用镜头重构师分析图片；中转后台完成后还需要等待本站读取并整理响应。"
                      : "正在运行完整流程：镜头重构师分析图片 → 首帧转绘师整理 prompt → 生图并保存图库。"}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button type="button" className={shellStyles.button} disabled={Boolean(busy)} onClick={() => void handleReconstruct()}>
                    {busy === "reconstruct" ? "分析中..." : "只分析首帧"}
                  </button>
                  <button type="button" className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")} disabled={Boolean(busy)} onClick={() => void handleRun()}>
                    {busy === "run" ? "生成中..." : "一键生成首帧"}
                  </button>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
              </div>
            </section>

            <section className={styles.stack}>
              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h2 className={shellStyles.cardTitle}>输出结果</h2>
                    <p className={shellStyles.cardSubtitle}>主理人、镜头重构师、首帧转绘师在这里汇总。</p>
                  </div>
                </div>
                {!reconstructResult && !runResult ? <p className={styles.statusLine}>上传素材后点击“只分析首帧”或“一键生成首帧”。</p> : null}
                {runResult?.imageUrl ? <img src={runResult.imageUrl} alt="AI+实拍首帧生成结果" className={styles.resultImage} /> : null}
                {runResult ? (
                  <p className={styles.statusLine}>
                    已生成并保存到图库。记录 ID：{runResult.galleryRecordId}；payload：{runResult.payloadKind}
                  </p>
                ) : null}
              </div>

              {reconstructResult ? (
                <div className={shellStyles.card}>
                  <h3 className={shellStyles.cardTitle}>素材检查 / 主理人输出</h3>
                  <pre className={styles.outputBlock}>{reconstructResult.assetReview}</pre>
                </div>
              ) : null}

              {reconstructResult ? (
                <div className={shellStyles.card}>
                  <h3 className={shellStyles.cardTitle}>镜头重构师输出</h3>
                  <pre className={styles.outputBlock}>{reconstructResult.reconstructionOutput}</pre>
                </div>
              ) : null}

              {runResult ? (
                <div className={shellStyles.card}>
                  <h3 className={shellStyles.cardTitle}>首帧转绘师输出</h3>
                  <pre className={styles.outputBlock}>{runResult.redrawOutput}</pre>
                </div>
              ) : null}

              {runResult ? (
                <div className={shellStyles.card}>
                  <h3 className={shellStyles.cardTitle}>最终 Prompt</h3>
                  <pre className={styles.outputBlock}>{runResult.finalPrompt}</pre>
                  {runResult.negativePrompt ? (
                    <>
                      <h3 className={shellStyles.cardTitle}>Negative Prompt</h3>
                      <pre className={styles.outputBlock}>{runResult.negativePrompt}</pre>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
