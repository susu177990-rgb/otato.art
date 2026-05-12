import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * GitHub Flavored Markdown + 单换行保留为硬换行。
 * CommonMark 默认会把「单个 \\n」收成空格，故编辑框里有断行、预览却连成一段；remark-breaks 与 textarea 观感对齐。
 */
export const REMARK_PLUGINS_GFM = [remarkGfm, remarkBreaks];
