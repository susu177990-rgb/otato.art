/**
 * 右侧产物面板「槽位」定义：与 stage-gate / artifact-extract 的 subKey 对齐。
 * UI 始终渲染这些槽；无数据时显示空编辑区。
 */

export interface FixedSlotDef {
  subKey: string;
  label: string;
  /** Gate 可选项等，仅文案提示 */
  optional?: boolean;
}

export const STAGE1_SLOTS: FixedSlotDef[] = [
  { subKey: "oneliner", label: "一句话梗概" },
  /** 长文正文统一在此；解析若带出「详细剧情梗概」标题会并入本槽，无需重复填写 */
  { subKey: "outline", label: "完整大纲" },
  { subKey: "cast_list", label: "本剧角色" },
];

export const STAGE2_FIXED_SLOTS: FixedSlotDef[] = [
  { subKey: "relationship", label: "核心关系定义" },
  { subKey: "cast_matrix", label: "人物矩阵总览" },
];

export const STAGE3_SLOTS: FixedSlotDef[] = [
  { subKey: "act1", label: "第一幕" },
  { subKey: "act2", label: "第二幕" },
  { subKey: "act3", label: "第三幕" },
  { subKey: "summary", label: "三幕式总检" },
];

export const STAGE4_FIXED_SLOTS: FixedSlotDef[] = [
  { subKey: "chain_check", label: "事件链总检", optional: true },
];

/** STAGE 5 设定集：三个固定分类槽 */
export const STAGE5_CATEGORY_SLOTS: FixedSlotDef[] = [
  { subKey: "cat_characters", label: "∆人物" },
  { subKey: "cat_items", label: "∆物品" },
  { subKey: "cat_scenes", label: "∆场景" },
];

/** STAGE 5 资产前缀 */
export const STAGE5_CHAR_PREFIX = "char_" as const;
export const STAGE5_ITEM_PREFIX = "item_" as const;
export const STAGE5_SCENE_PREFIX = "scene_" as const;

/** STAGE 6 分集大纲：动态 outline_epN */
export const STAGE6_OUTLINE_PREFIX = "outline_ep" as const;

/** 动态角色槽：除 fixed 外，凡 subKey 以 char_ / supporting_ 开头的解析产物 */
export const STAGE2_CHAR_PREFIX = "char_" as const;
export const STAGE2_SUPPORTING_PREFIX = "supporting_" as const;

/** 动态事件：event_N */
export const STAGE4_EVENT_PREFIX = "event_" as const;
