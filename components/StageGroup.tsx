"use client";

import type { Artifact } from "@/lib/types";
import StageFlatManual from "./StageFlatManual";
import EpisodeTreeEditor from "./EpisodeTreeEditor";
import shellStyles from "@/app/shared/shell.module.css";

interface Props {
  stageId: number;
  artifacts: Artifact[];
  onArtifactUpsert?: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onArtifactRemove?: (stage: number, subKey: string) => void;
  onArtifactRemoveSubtree?: (rootSubKey: string) => void;
}

/**
 * 编剧室主区右侧 ArtifactPanel 内的「单阶段产物组」。
 * 旧版本承担了：编号块 / 阶段名 / 重新记录 / 开始按钮 / PipelineProgressBar。
 * 重构后这些 chrome 全部上提到 ArtifactPanel header；本组件只剩说明 + 编辑器。
 */
export default function StageGroup({
  stageId,
  artifacts,
  onArtifactUpsert,
  onArtifactRemove,
  onArtifactRemoveSubtree,
}: Props) {
  const isEpisodes = stageId === 7;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className={shellStyles.helpText} style={{ lineHeight: 1.6 }}>
        {isEpisodes
          ? "分集为卡片总览（大屏 5 列），每集「概述 + 正文」双槽；点卡片在弹窗编辑；左侧解析落入 epN / epN.body。"
          : stageId === 5
            ? "仅三块：在对应 ∆ 分类正文里用 @名称 登记即可；自动记录会落入这三栏，无需逐条拆成子卡片。"
            : stageId === 6
              ? "逐集大纲：∆资产 → 开头钩子 → 本集剧情 → 结尾悬念；每集一块，自动记录落入对应集。"
              : "下方槽位与工程验收项一致；可直接粘贴左侧助手输出，或点上方「重新记录」自动抓取。"}
      </p>

      {onArtifactUpsert && onArtifactRemove && onArtifactRemoveSubtree ? (
        isEpisodes ? (
          <EpisodeTreeEditor
            artifacts={artifacts}
            onUpsert={onArtifactUpsert}
            onRemoveSubtree={onArtifactRemoveSubtree}
          />
        ) : (
          <StageFlatManual
            stageId={stageId}
            artifacts={artifacts}
            onUpsert={onArtifactUpsert}
            onRemove={onArtifactRemove}
          />
        )
      ) : null}
    </div>
  );
}
