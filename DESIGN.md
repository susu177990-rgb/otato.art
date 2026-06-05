# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-01
- Primary product surfaces: home (`/`), login (`/login`), unified project settings (`/settings`), standalone chat (`/chat`), Wattpad tools (`/wattpad`), project list (`/projects`), project intake (`/project/[id]/onboarding`), script studio (`/studio/[id]`), image workspace (`/image`, `/image/gallery`), infinite canvas (`/canvas`, `/canvas/[id]`), AI+实拍首帧工作台 (`/ai-live-action`).
- Evidence reviewed: every page above + `app/shared/shell.module.css` (new shared shell), `app/image/image-page.module.css` (canvas + floating panels reference), `app/ai-live-action/page.tsx`, `app/ai-live-action/ai-live-action-page.module.css`, `app/settings/settings-page.module.css`, `app/image/gallery/gallery-page.module.css`, `app/projects/projects-page.module.css`, `app/wattpad/wattpad-page.module.css`, `app/project/[id]/onboarding/onboarding-page.module.css`, `app/studio/[id]/studio-page.module.css`, `components/ApiSettingsProvider.tsx`, `components/SettingsDialog.tsx` (storage helpers only), `components/ChatWindow.tsx`, `components/chat/ChatWorkspace.tsx`, `components/skill-form/*` (RJSF dynamic form + output), `components/ArtifactPanel.tsx`, `components/StudioStageStrip.tsx`, `components/StudioBibleDrawer.tsx`, `components/PlanningChatPanel.tsx`, `components/MessageBubble.tsx`, `components/StageGroup.tsx`, `lib/image-workspace.ts`, `lib/image-storage.ts`, `lib/types.ts`, `lib/model-presets.ts`.

## Brand
- Personality: quiet, professional, precise, tool-like, visually premium without looking like a marketing page.
- Trust signals: stable layout, clear controls, unobtrusive state feedback, predictable saved history, single source for settings, consistent cross-page chrome.
- Avoid: heavy cards, crude bordered columns, loud color blocks, candy-colored indigo CTA buttons, decorative gradients, one-note neon/purple styling, cluttered helper copy.

## Product goals
- Goals: deliver focused creative workflows that feel fast, controlled, and mode-driven; make every page read as **the same instrument family**.
- Non-goals: marketing-style hero sections, tutorial-heavy UI, decorative imagery on tool pages.
- Success signals: a user can switch from `/` → `/projects` → `/studio/[id]` → `/image` without noticing a stylistic break.

## Personas and jobs
- Primary personas: local creator/operator running script + image production end-to-end.
- User jobs: search source material, intake projects, draft + revise scripts, generate and curate character art, configure APIs.
- Key contexts of use: desktop-first, single dark workspace, often left running for an extended creation session.

## Information architecture
- **Settings entry — single source**: project-wide configuration is **only reachable from the home page** (`app/page.tsx`) via a single **`设置`** pill in the topnav that navigates to **`/settings`**. **No other page surfaces a settings button.** Studio / onboarding may still call `useApiSettings().openSettings()` programmatically when the API key is missing — this method **navigates** to `/settings` rather than opening a modal. `ApiSettingsProvider` no longer mounts a `SettingsDialog`, no longer auto-opens on hydrate, and remains in `app/layout.tsx` purely so any page can read `settings` and trigger the navigation.
- **Unified shell**: every route renders the same chrome — `shellStyles.page` (full-viewport flex column with the radial-haloed near-black gradient background) + `shellStyles.topbar` (56px translucent border-bottom bar with `backdrop-filter: blur(20px)`). The topbar's left cluster uses `topbarLeft` and may carry `plainDockText` "back" links (`返回首页` / `返回作图` / `返回项目页` / `返回项目列表`) plus a `topbarTagline` subtitle. The right cluster uses `topnav` and may carry `navLink` pills (and optional `navLinkPrimary` / `navLinkDanger` modifiers).
- **`/`** (home): topbar tagline `Gleam Media Studios 工作台` + single `设置` pill. Body is a centered `heroWrap` with a `tileGrid` of large `tile` cards: 扒网文 → `/wattpad`, 创作剧本 → `/projects`, 作图 → `/image`, 无限画布 → `/canvas`, AI+实拍 → `/ai-live-action`, 对话 → `/chat`.
- **`/chat`** — **standalone Agent chat** (not tied to `projects`): topbar `返回首页` + tagline `对话` + `会话` toggle. Body is full-height `ChatWorkspace` — left rail (LLM 只读摘要 + 全站 Skill 勾选 + 作图提示), centre message stream + composer **or Skill 表单面板**, optional right session list. **Dual mode**: when the selected Skill pack exposes `interface/input.json`, the centre column switches to **`SkillFormPanel`** (vertical stack: 填写需求 card → 生成结果 card; no message composer; results are ephemeral React state, not persisted to `chat_conversations`). Skills without `inputSchema` keep the bubble stream + `ChatComposer`. Data: `chat_conversations` per user; **全站 Skill** in `site_skill_packs` (upload/delete in `/settings` → Skill; current internal policy allows any logged-in user to manage shared settings); **LLM** 共用 `site_settings.llm`；作图读 `image_workspace`。Server `POST /api/chat/agent` runs tool loop (`generate_image` → `lib/image-generate`); form mode uses `POST /api/skills/run`.
- **`/login`**: same shell; centered `card` with one `field` (password) + `bannerError` (when applicable) + `button buttonPrimary` (`进入`).
- **`/projects`**: topbar (back to `/` + tagline `项目列表` + `新建项目` `navLinkPrimary`, which now POSTs `/api/projects` and routes straight to onboarding without an interstitial). Body `shell shellWide` carrying a search input + sort `select` row plus a responsive grid of `projectCard`s (each with three `metaPill`s — `已验至 S{n}` / `集数` / `圣经✓ or ·`).
- **`/project/new`**: kept as a server-side `redirect('/projects')` stub for legacy deeplinks; no UI.
- **`/project/[id]/onboarding`** — **4-tabs single page**: shell + topbar (`返回项目列表` + tagline `项目立项` + 模式 `segmented` 原创 / 改编 in the right `topnav`). Body is a `shell` containing one `segmented` strip (基本信息 / 素材 / 策划 / 立项确认) and a single content section that swaps with `activeTab`. The 立项确认 tab renders a `finalizeGrid` with three cards (创作思路确认书 / 系列圣经 / 英语简报). A right-aligned `stickyCta` at the bottom hosts the only progression CTA `保存并进入编剧室`. The legacy `briefOpen` / `briefDraft` modal, `step 1/2` state machine, and ready-bar "手填圣经 + LLM 生成" duplicate UI are all removed. The改编 `phase` is preserved in data and only used to derive a "next-step" tab highlight + section enable/disable; it never branches the entire page anymore.
- **`/studio/[id]`** — **canvas + side-by-side glass cards layout**: a single-row topbar carries everything: left cluster `返回` + project title (compact); centre is a **`stageStripCluster`** with **`margin-left: 28px`** so it clears the title cluster — inner prelude row **`思路书` · `圣经` · `简报`** use the same **`stageStripTile`** chrome as STAGE tiles (28px pill, 11px label, trailing **`stageStripDot`**), separated by a subtle vertical rule from the scrollable `stageStrip` (7 inline tiles, each = 编号 + 短名 + Gate 计数 `n/m` + 状态 dot, click → `stagePopover` 下方滑出长名 / Gate 清单 / 未达标仍标 / 查看产物); right cluster = `自动 S{n}` switch · `体检` · `ZIP` (`navLink`s). **`StudioBibleDrawer`** hosts three segmented tabs (**思路书** / **系列圣经** / **英语简报**): the brief tab edits **`creativeBrief`** with debounced `PUT` and optional `.txt` export. Body is `canvasStage` — a single dark canvas region with 24px outer padding and 24px inter-card gap — that hosts two non-overlapping flex sibling cards: a 380px-wide **`sideCard`** carrying `ChatWindow` and a flex-1 **`canvasCard`** carrying `ArtifactPanel`. Both cards share the same 22px-radius glass treatment (1px low-opacity border, blurred dark surface, soft drop shadow) so neither feels demoted; the dark canvas shows through the 24px gap between them. `ArtifactPanel` itself owns: header row 1 (stage label + 重新记录 chip), header row 2 (`开始本阶段 / 连续大纲 / 连续分集` `buttonPrimary` — promoted from `StageGroup`), and a contextual `pipelineStrip` at the top when running stage 6/7 auto pipeline. The previous right-side thin process rail is **removed** in favour of the topbar `stageStrip`.
- **`/wattpad`**: shell + topbar. Body splits into a top **search `card`** (label/input/button + checkbox row) → table+preview split (each a `card`) → log `card`. Modals reuse `card` chrome with the global `modalBackdrop` blur.
- **`/image`** top bar: left = `返回首页` + `画廊` (`plainDockText` + `dockTextLink`) + tagline; right is empty. Body keeps the floating mode strip (left), canvas, history strip (right), reference strip + composer.
- **`/image/gallery`** top bar: left = `返回作图` + tagline; right = `清空记录` (`navLink navLinkDanger`).
- **`/canvas`**: topbar `返回首页` + tagline `无限画布`; right = `新建画布` (`navLinkPrimary`). Body uses `shell shellWide` with a glass intro card and a responsive grid of board cards. Board cards allow inline title edit, enter, and delete. Data lives in `canvas_boards` per user.
- **`/canvas/[id]`**: topbar `返回画布库` + inline board title + save status. Body is a full-height dark infinite canvas with grid, glass toolbar, text/image nodes, relation lines, drag/select/delete, image upload, and debounced cloud save. It uses Studio CSS Modules and shared shell primitives, not the upstream canvas app UI.
- **`/ai-live-action`**: topbar `返回首页` + tagline `AI+实拍 · 首帧工作台`; right = `图库` + `设置`. Body is a vertical workflow, not a left/right split: input materials and controls first, output results below. The input materials card starts with one shared upload grid row containing the required scene grid / marked scene grid / source first frame plus one default character image slot and one default prop image slot. All initial upload slots use the same card size, preview ratio, and state language; the explicit upload button is removed, and clicking the image preview frame opens file selection. Character/prop text fields live inside the same dashed upload card. Additional character/prop slots append to the same grid rather than separate sections.
- **`/settings`**: current UI-structure pilot for the next page migration. It reads/writes shared `site_settings`, `site_skill_packs`, and the first-stage **预设库** table `site_prompt_presets`, while keeping the project dark glass visual language. Header is a compact floating category bar: `返回首页` + three top-level categories **API设置 / 预设库 / skill** on the left, `保存` + micro-toast on the right. Body is a two-zone layout: left vertical child nav and right floating-card content. **API设置** child pages: LLM / 图片 / 视频, mapping to LLM API, 生图模型 API, 生视频模型 API. **预设库** child pages: 生图提示词预设 / 生视频提示词预设. **skill** contains Skill 包设置 only. First-stage preset library is deliberately small: each preset has type, title, prompt template, optional cover, and image ref-slot hints; no search, tags, sorting, favorites, versioning, import/export, or batch tools yet.
- Core routes/screens: `/`, `/login`, `/settings`, `/chat`, `/image`, `/image/gallery`, `/canvas`, `/canvas/[id]`, `/ai-live-action`, `/projects`, `/project/new`, `/project/[id]/onboarding`, `/studio/[id]`, `/wattpad`.
- **Removed**: `/image/settings` (folded into `/settings`).

## Design principles
- Principle 1 — **One shell, staged migration**: most routes still boot from `shellStyles.page` + `shellStyles.topbar`. `/settings` is the first approved exception and pilots the next compact floating-card shell before other pages migrate.
- Principle 2 — **Floating instruments**: panels, cards, and pills feel translucent and slightly elevated (`backdrop-filter: blur(18px)` + `box-shadow: 0 16px 60px rgba(0,0,0,0.32)`).
- Principle 3 — **Inverted neutrals for action**: primary CTAs use `#fafafa` background + `#09090b` text (the same inversion as the `segmentedItemActive` / `modeButtonActive` token). No more saturated indigo as the primary affordance.
- Principle 4 — **Quiet color**: work surfaces stay monochrome zinc on near-black, with accent color only on state (red danger, green confirmation, amber warning). Structural sketches may guide layout only; do not copy sketch colors unless explicitly requested.
- Principle 5 — **One workspace, one CTA**: each working page (`/project/[id]/onboarding`, `/studio/[id]`) has exactly one persistent primary action. High-frequency tools are aggregated in the top bar; low-frequency / contextual tools live in popovers and drawers, never inline.
- Principle 6 — **Canvas + side-by-side glass cards over partitioned columns**: working pages with multi-pane content (`/image`, `/studio/[id]`) drop the dividing-line "left column / center / right column" pattern in favour of a single dark `canvasStage` background that hosts large glass cards (`sideCard`, `canvasCard`) as non-overlapping flex siblings, separated by a 24px gap that lets the canvas show through. Each card is rounded 22px, 1px low-opacity border, soft 30–90px drop shadow, `backdrop-filter: blur(20–24px)`. No vertical/horizontal divider lines on the studio main area.
- Principle 7 — **Stage strip over side rail**: the `/studio/[id]` 7-stage process is shown as a single horizontal `stageStrip` inside the topbar (编号 + 短名 + n/m Gate 计数 + 状态 dot per tile, click → `stagePopover` below tile with long name + full Gate items + override + jump). The earlier right-side thin rail and 44px column layout is retired.
- Principle 8 — **Phase as tab, not as state machine**: the onboarding flow flattens its previous "step / phase" branches into a single 4-tab surface; phase data only steers tab highlight, not entire-page conditional rendering.
- Tradeoffs: prioritize desktop precision over mobile density; hand off rare phone UX to follow-up.

## Visual language
- Color: near-black canvas (`linear-gradient(180deg,#070708,#030304)` + radial halo at 50%/42%); foreground `#fafafa`/`#e4e4e7`/`#a1a1aa`/`#71717a`; surfaces `rgba(255,255,255,0.025–0.08)`; borders `rgba(255,255,255,0.08–0.22)`. Status: `#6ee7b7` / green (success), `#fcd34d`/`#fde68a` (warn), `#fca5a5`/`#fecaca` (danger), no saturated brand accents.
- Typography: small dense Chinese UI labels; primary section title 13–14px / 600; helper text 11px / 500 in `#71717a`. Mono for keys, prompts, and IDs.
- Spacing/layout rhythm: 56px topbar, 24px page horizontal padding, 12–16px gap between sibling cards, 6–10px field internal gaps. Avoid >24px between related cards.
- Shape/radius/elevation: shell cards 18–22px, pills 11–999px depending on role, buttons 14px, segmented inner 14px / outer 18px, modals 18–24px. Compact structure can use a floating top category bar and sticky left rail, but surfaces remain glass: thin borders, blurred dark fills, layered shadows. Avoid full-width slabs unless content requires it.
- Motion: 140ms ease for hover/focus transitions; only the auto-pipeline indicator and the canvas spinner animate. No content-pop or marketing transitions.
- Imagery/iconography: real generated/recorded images are the only photographic content. Icons are 16–20px stroke SVGs, never filled glyphs. Avatars/badges use the `brandBadge` gradient.

## Components
### Existing primitives reused (in `app/shared/shell.module.css`)
- **`page`**: top-level page shell — full-viewport flex column with the dark gradient background.
- **`body`** / **`bodyTight`**: `flex: 1; overflow-y: auto` content region under the topbar.
- **`shell`** / **`shellWide`** / **`shellNarrow`**: centered max-width content wrappers (980 / 1180 / 720px).
- **`topbar`**, **`topbarLeft`**, **`topbarTagline`**, **`topnav`**: fixed-height translucent bar.
- **`plainDockText`**, **`dockTextLink`**: small zinc text label / clickable variant for topbar "back" + tagline links.
- **`navLink`** + **`navLinkPrimary`** (white-on-dark inversion) + **`navLinkDanger`** (red): the entire pill-button family used in topbars and in inline secondary actions.
- **`segmented`** + **`segmentedItem`** + **`segmentedItemActive`**: replaces the old `modelTabs` / page-specific tabs in legacy-shell pages. Used in image page composer and onboarding `原创/改编`; `/settings` no longer uses this for top-level IA and instead owns sketch pills locally.
- **`card`** + **`cardCompact`** + **`cardHead`** + **`cardTitle`** + **`cardSubtitle`**: glass card section. Used by every page that needs a content slab (settings, wattpad, login).
- **`field`** + **`fieldLabel`** + **`input`** + **`inputCompact`** + **`select`** + **`textarea`** + **`row`** + **`rowFull`** + **`checkboxRow`** + **`mono`**: form primitives.
- **`button`** + **`buttonPrimary`** + **`buttonDanger`** + **`buttonSubtle`**: form/inline buttons (taller and bolder than `navLink`).
- **`banner`** + **`bannerInfo`** / **`bannerSuccess`** / **`bannerWarn`** / **`bannerError`**: state callouts (replaces inline `bg-amber-950 …` / `bg-emerald-950 …` Tailwind chains).
- **`empty`**, **`savedHint`**, **`helpText`**, **`statusDot`** (+ Ok / Warn / Err), **`spinner`**, **`bigSpinner`**: ambient utilities.
- **`heroWrap`**, **`heroTitle`**, **`heroSubtitle`**: home-style centered intro slab.
- **`tileGrid`**, **`tile`**, **`tileIcon`**, **`tileTitle`**, **`tileMeta`**: square-ish "select-one" tiles used by `/` and `/projects`.
- **`bubbleRow`** + **`bubbleRowUser`** / **`bubbleRowAssistant`** + **`bubbleUser`** / **`bubbleAssistant`**: chat message rows. User = white-on-dark inversion; assistant = glass card. Replaces the old indigo `MessageBubble`.
- **`canvasStage`** + **`sideCard`** + **`canvasCard`**: studio main canvas (24px gap flex row) + left 380px chat glass card + flex-1 main glass slab. Both cards share the same glass treatment so the page feels like two refined cards on a canvas, never overlapping.
- **`stageStrip`** + **`stageStripTile`** + **`stageStripTileActive`** + **`stageStripTileInferred`** + **`stageStripIndex`** + **`stageStripCount`** + **`stageStripDot`** + **`stagePopover`**: topbar 7-stage horizontal strip with click-down popover. Used by `<StudioStageStrip />` (replaces the retired `<StudioProcessRail />`).
- **`floater`** + **`floaterTitle`** + **`floaterSubtitle`** + **`floaterList`** + **`floaterListItem`**: 280px popover stack reused by `stagePopover` and any other contextual overlay.
- **`pipelineStrip`** + **`pipelineStripPaused`** / **`pipelineStripDone`** / **`pipelineStripError`** + **`pipelineStripText`** + **`pipelineStripBar`** + **`pipelineStripBarFill`**: top-of-`ArtifactPanel` auto pipeline status bar.
- **`modalScrim`** + **`modalCard`** + **`modalHead`** + **`modalTitle`**: shared modal stack (used by `ArtifactPanel`'s 分集体检 modal, etc.).
- **`drawerScrim`** + **`drawerCard`** + **`drawerHead`** + **`drawerBody`**: shared right-side drawer stack (used by `StudioBibleDrawer`).
- **`stickyCta`**: bottom-anchored CTA row that fades from transparent to the page background. Used for onboarding's `保存并进入编剧室`.
- **`tabsRow`** + **`finalizeGrid`** + **`finalizeGridFull`**: onboarding tabs row + responsive grid for the 立项确认 tab.
- **`metaPill`** + **`metaPillOk`** / **`metaPillMute`**: small inline status pills used by `/projects` cards.
- **`iconBtn`**: 30×30 ghost icon button (artifact panel header collapse / re-extract chip etc.).

### Page-specific modules
- **`app/image/image-page.module.css`** keeps everything image-only: `stage` grid, `canvas` / `canvasInner` / `resultImage`, mode strip + history rail (frames, chevrons, scroll-fade caps, history thumbnails, mode pill, mode list, active state), reference slot grid, composer + prompt input + composer toolbar + composer select. The composer toolbar tabs now consume `shellStyles.segmented`.
- **`app/canvas/canvas-page.module.css`** owns the infinite canvas project list and operation surface: board grid, full-height canvas, grid layer, transformed world, relation paths, text/image nodes, bottom glass toolbar, and save/interaction status panel. It must stay visually aligned with shell primitives and avoid upstream Ant Design/Tailwind chrome.
- **`app/ai-live-action/ai-live-action-page.module.css`** owns the AI+实拍 two-column workspace, unified upload-card styling (`uploadBox`, preview frame, upload footer), material section dividers, character/prop asset grids, and output image blocks. Upload states must stay visually identical across required base materials and optional character/prop materials.
- **`app/image/gallery/gallery-page.module.css`**: gallery body + masonry + tile + tileImg + tileMeta + lightbox modal stack. Removed local `navLinkDanger` (use shared one).
- **`app/settings/settings-page.module.css`**: owns the new compact floating-card settings shell: top category bar, sticky left child-nav rail, right content surface, local dark-glass card overrides, API card grid, and prompt textarea / cover-card sizing.
- **`app/projects/projects-page.module.css`**: list grid + project card visual + corner remove button.
- **`app/wattpad/wattpad-page.module.css`**: search card layout + table + preview pane + log pane + export modal.
- **`app/project/[id]/onboarding/onboarding-page.module.css`**: body + shell + step pills + material list + actions row + back-link helper.
- **`app/studio/[id]/studio-page.module.css`**: auto-pipeline switch + auto label + warning banner + topbar cluster helpers (`stageStripCluster`, `prePipelineNav`, …).

### Auto-pipeline switch (studio top right)
- Lives in `studio-page.module.css`. Pill-shaped wrapper (`autoCluster`, 30px tall) with a 32×18 toggle (`autoSwitch`), `autoSwitchActive` (emerald) and `autoSwitchError` (red) state colors, and a label (`autoLabel` + `autoLabelActive` / `autoLabelError`). Active state shows an animated `autoDot` (ping + dot) before the `自动 S{n}` text.

### Removed components / pages
- `/image/settings` (page + module).
- `<SettingsDialog />` modal mount (file kept for `loadSettings` + `SETTINGS_STORAGE_KEY` exports).
- `<ApiSettingsToolbarButton />` (file deleted; no importer).
- `/project/new` UI page (replaced by a server-side redirect stub).
- Tailwind `bg-indigo-600` primary buttons (replaced by `buttonPrimary` / `navLinkPrimary` everywhere).
- Onboarding `briefOpen` / `briefDraft` modal + `step` 1/2 state machine + ready-bar duplicate "手填圣经 / LLM 生成" entry (folded into the 立项确认 tab).
- `ArtifactPanel` toolbar buttons `分集体检` and `导出 ZIP` (lifted into the studio top bar).
- `StageGroup` stage-number block, `重新记录` chip, `开始本阶段` button, and inline `PipelineProgressBar` (lifted into `ArtifactPanel`).
- Tailwind-defined headers on `/` `/login` `/projects` `/project/new` `/project/[id]/onboarding` `/studio/[id]` `/wattpad`.

### Studio internals (canvas + side-by-side glass cards)
- **Studio shell** is `shellStyles.canvasStage` → renders two non-overlapping flex siblings: a left 380px **`sideCard`** holding the `ChatWindow`, and a flex-1 **`canvasCard`** holding the `ArtifactPanel`. The 24px gap between them shows the dark canvas. No vertical divider lines on the main area.
- **`ChatWindow`** runs inside `sideCard` (no self-painted background): consumes `shellStyles.bubbleRow*`/`bubbleUser`/`bubbleAssistant` plus `shellStyles.input` + `buttonPrimary` for the composer, with `chat-window.module.css` providing only structural padding and an inner round send key.
- **`ArtifactPanel`** runs inside `canvasCard` (no self-painted background): two-row header (stage label + 重新记录 chip; then `开始本阶段 / 连续大纲 / 连续分集`); body uses normal 22px gutter (no overlap padding needed). `pipelineStrip*` shows up at the top of the body for stage 6/7 auto pipelines. `分集体检` modal uses shared `modalScrim` + `modalCard`, hoisted to the studio page.
- **`StudioStageStrip`** lives inside `shellStyles.topbar` and renders 7 inline **`stageStripTile`** entries (编号 + 短名 + `n/m` Gate count + 状态 dot). Active stage = `stageStripTileActive` (white inversion); inferred current stage (推断自最后一条 assistant 消息) = `stageStripTileInferred`. Click a tile → it sets `viewStage` and toggles a `stagePopover` directly under the tile (long stage label, full Gate items, `未达标仍标` button only when popover stage matches `currentStage`, `查看产物` button). Replaces the retired `StudioProcessRail`.
- **`StudioBibleDrawer`** uses `shellStyles.drawerScrim` + `shellStyles.drawerCard` + `shellStyles.drawerHead` / `drawerBody` and `shellStyles.segmented` for **思路书 / 系列圣经 / 英语简报** tabs (`BibleDrawerTab`: `brief` | `bible` | `locale`).
- **`PlanningChatPanel`** + **`MessageBubble`** + **`StageGroup`** + **`StageFlatManual`** + **`EpisodeTreeEditor`** + **`ArtifactSlotEditor`** all consume the shared `card` / `field` / `input` / `textarea` / `button` / `bubble*` tokens.

### Skill form mode (`/chat`, `components/skill-form/`)
- **`SkillFormPanel`**: centred column (`max-width: 760px`) with a quiet header (eyebrow + Skill title + one-line meta) and two **`shellStyles.card`** sections stacked vertically — **填写需求** (RJSF input) then **生成结果** (output viewers). Loading uses `shellStyles.spinner` in the result card head; errors use `bannerError`.
- **`DynamicSkillForm`**: RJSF renderer; field chrome is styled in `skill-form.module.css` to mirror `shell.field` / `input` / `textarea` / `select` (12px radius, zinc labels 11px, 14px field gap). Primary CTA is full-width `buttonPrimary` (`生成分镜`).
- **`AssetUploaderWidget`**: custom RJSF widget; each uploaded asset is a glass row (80px thumb + `field`/`select`/`input` + `buttonDanger` 移除). Empty state uses dashed `assetDropHint`; add via `button`.
- **`DynamicSkillOutput`** + **`MarkdownOutputViewer`**: output blocks use nested dark slabs (`outputBlock`); markdown fields get `segmented` 预览/源码 toggle + `button` 复制 Markdown; images get rounded link + `dockTextLink` 下载.
- **Layout rule**: form mode replaces the message stream — no side-by-side input/output columns; user reads top-to-bottom: fill → submit → scroll to results. Token ownership: structural + RJSF overrides in `skill-form.module.css`; primitives from `shell.module.css`.

### Variants and states
- Empty canvas, generating overlay, model-not-configured warning, empty history, selected model, bannerInfo / bannerWarn / bannerError, masonry empty, login error, projects empty, onboarding ready / pending, studio auto-pipeline running / errored / disabled, AI+实拍 upload empty / uploaded / busy / output empty.

## Accessibility
- Target standard: practical WCAG AA contrast for text and controls.
- Keyboard/focus behavior: every `navLink`, `button`, `tile`, and `segmentedItem` has a visible `:focus-visible` ring (1px `rgba(250,250,250,0.4)` outline at +2 offset). The chat window's clear-history button + send button + onboarding step pills + project cards remain Tab-reachable.
- Contrast/readability: primary CTAs invert to dark text on `#fafafa`. Disabled states use opacity 0.40–0.45, never gray-on-gray.
- Screen-reader semantics: form controls keep labels through `field` + `fieldLabel` pairs; the auto-pipeline toggle uses `role="switch"` + `aria-checked`.
- Reduced motion and sensory considerations: no large animation; the only motion budget is the canvas spinner and the auto-pipeline `autoDot` ping.

## Responsive behavior
- Supported breakpoints/devices: desktop-first; min ~960px width assumed for studio + wattpad split panes.
- Layout adaptations: shell `body` reduces horizontal padding to 16px below 1100px; gallery masonry collapses 4 → 3 → 2 → 1 columns at 1400 / 1100 / 760px; wattpad split collapses to single column ≤1100px; gallery lightbox stacks at ≤900px.
- Touch/hover differences: every hover affordance (project remove button, history meta overlay, tile meta) is decorative; click/tap remains sufficient.

## Interaction states
- Loading: full-canvas muted overlay (`statusLabel`) on `/image`, `spinner` ambient row on `/project/new`, `/studio/[id]` initial load, and `/project/[id]/onboarding`.
- Empty: `shellStyles.empty` for catastrophic empty (no project) or post-create flush states. List pages use a small centered helper text.
- Error: `bannerError` for inline form errors and login failures; `studio.banner` strip with amber chrome for soft warnings.
- Success: white-bg `navLinkPrimary` / `buttonPrimary` press; `savedHint` for the settings save confirmation.
- Disabled: 0.40–0.45 opacity, `cursor: not-allowed`, no color shift.
- Offline / slow network: surface API error text in the composer area or the relevant card's `bannerError`.

## Content voice
- Tone: short, direct, production-tool language.
- Terminology: `项目`, `编剧室`, `画廊`, `模式`, `参考图`, `模型`, `比例`, `清晰度`, `生成`, `保存`, `清空`.
- Microcopy rules: avoid explaining obvious interactions; keep helper text out of the canvas unless needed for empty state. Banner text always opens with the verdict ("立项未完成…", "暂无生图记录"), then offers the action.

## Implementation constraints
- Framework/styling system: Next.js App Router, React client pages, **CSS Modules** for all shell + page primitives. Tailwind utility classes are still allowed inside legacy components (chat / artifact / process rail / bible drawer / planning chat) so long as they consume the shared color/border tokens documented above.
- Design-token constraints: no new dependency or design-system layer; all new primitives go into `app/shared/shell.module.css`. If a page needs a one-off rule, prefer a page-local `*.module.css` that composes shared classes.
- Performance constraints: gallery still stores URLs only in localStorage; reference uploads are in-memory data URLs for the active run; no large hero animations.
- Compatibility constraints: existing password gate and root-level `npm run dev` workflow stay unchanged.
- Test/screenshot expectations: run `npx tsc --noEmit` and `npx eslint app components` after UI changes; visually smoke `/`, `/login`, `/projects`, `/project/new`, `/project/[id]/onboarding`, `/studio/[id]`, `/wattpad`, `/image`, `/image/gallery`, `/settings` end-to-end.

## Open questions
- [ ] Mobile layout for the studio + wattpad split panes (currently desktop-only). Owner: product / impact: usable narrow-screen creation.
- [ ] Whether image generation records should move from localStorage to IndexedDB or server files. Owner: product / impact: persistence reliability.
- [ ] Whether the topbar `stageStrip` should auto-shrink labels (or hide `n/m` count) below ~1100px instead of horizontal scroll. Owner: design / impact: narrow-screen ergonomics on stage 6/7 with many tiles.
- [ ] Whether the `sideCard` chat width should be user-resizable (drag right edge) instead of fixed 380px. Owner: design / impact: density vs preview comfort on ultrawide displays.
