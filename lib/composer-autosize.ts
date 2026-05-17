/**
 * 编剧室 / 策划对话底部 composer
 * - 空态固定单行高度（避免移动端 WebKit 在 height:auto 下 scrollHeight 虚高）
 * - 有文字时随 scrollHeight 增高，最高 **3 行**正文（再多则框内滚动）
 *
 * 数值须与 `shell.module.css` 中 `.textareaComposer` 一致：
 * font-size 13px · line-height 1.35 · 上下 padding 5px+5px · 边框 1px+1px
 */
const FONT_PX = 13;
const LINE_HEIGHT_RATIO = 1.35;
/** 单行正文所占像素（向上取整，与 CSS line-height 一致） */
const LINE_BOX_PX = Math.ceil(FONT_PX * LINE_HEIGHT_RATIO);
/** 上下 padding + 上下 border（与 .textareaComposer 同步） */
const VERTICAL_CHROME_PX = 5 + 5 + 1 + 1;

export const COMPOSER_MAX_LINES = 3;

export const COMPOSER_AUTOSIZE_MIN_PX = VERTICAL_CHROME_PX + LINE_BOX_PX;
export const COMPOSER_AUTOSIZE_MAX_PX = VERTICAL_CHROME_PX + COMPOSER_MAX_LINES * LINE_BOX_PX;

export function syncComposerTextareaHeight(el: HTMLTextAreaElement | null, value: string) {
  if (!el) return;
  const MIN = COMPOSER_AUTOSIZE_MIN_PX;
  const MAX = COMPOSER_AUTOSIZE_MAX_PX;

  if (!value.trim()) {
    el.style.height = `${MIN}px`;
    el.style.overflowY = "hidden";
    return;
  }

  el.style.height = `${MIN}px`;
  const sh = el.scrollHeight;
  const next = Math.min(Math.max(sh, MIN), MAX);
  el.style.height = `${next}px`;
  el.style.overflowY = sh > MAX ? "auto" : "hidden";
}
