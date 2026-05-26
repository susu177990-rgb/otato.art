"use client";

import type { SkillFormRunResult, SkillPackRecord } from "@/lib/chat/types";
import { skillPackDisplayLabel } from "@/lib/chat/skill-pack";
import shellStyles from "@/app/shared/shell.module.css";
import { DynamicSkillForm } from "@/components/skill-form/DynamicSkillForm";
import { DynamicSkillOutput } from "@/components/skill-form/DynamicSkillOutput";
import styles from "./skill-form.module.css";

export function SkillFormPanel({
  pack,
  result,
  loading,
  error,
  onSubmit,
  onConfirmImage,
}: {
  pack: SkillPackRecord;
  result: SkillFormRunResult | null;
  loading: boolean;
  error: string | null;
  onSubmit: (payload: unknown) => void;
  onConfirmImage?: () => void;
}) {
  if (!pack.inputSchema) return null;

  const label = skillPackDisplayLabel(pack);
  const emptyHint =
    pack.chatUsageHint?.trim() ||
    `## ${label}\n\n填写上方表单并点击「生成分镜」，系统将先生成可审核的提示词；确认后再生成分镜图。`;

  return (
    <div className={styles.panel}>
      <header className={styles.panelHeader}>
        <p className={styles.panelEyebrow}>Skill 表单</p>
        <h2 className={styles.panelTitle}>{label}</h2>
        <p className={styles.panelMeta}>先生成提示词 · 确认后生图</p>
      </header>

      <div className={styles.panelGrid}>
        <section className={[shellStyles.card, styles.sectionCard].join(" ")}>
          <div className={shellStyles.cardHead}>
            <div>
              <h3 className={shellStyles.cardTitle}>填写需求</h3>
              <p className={shellStyles.cardSubtitle}>故事、场景与参考资产</p>
            </div>
          </div>
          <DynamicSkillForm inputSchema={pack.inputSchema} disabled={loading} onSubmit={onSubmit} />
        </section>

        <section className={[shellStyles.card, styles.sectionCard].join(" ")}>
          <div className={shellStyles.cardHead}>
            <div>
              <h3 className={shellStyles.cardTitle}>生成结果</h3>
              <p className={shellStyles.cardSubtitle}>
                {loading ? "正在调用模型…" : result ? "可预览 Markdown 并确认生图" : "提交后展示于此"}
              </p>
            </div>
            {loading ? <span className={shellStyles.spinner} aria-hidden /> : null}
          </div>

          {error ? <p className={shellStyles.bannerError}>{error}</p> : null}

          <DynamicSkillOutput
            outputSchema={pack.outputSchema}
            result={result}
            emptyHint={emptyHint}
            onAction={onConfirmImage}
            actionLoading={loading}
          />
        </section>
      </div>
    </div>
  );
}
