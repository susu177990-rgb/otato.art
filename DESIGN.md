# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-06-08
- Primary product surfaces: home (`/`), login (`/login`), account (`/me`), settings (`/settings`), chat (`/chat`), projects (`/projects`), onboarding (`/project/[id]/onboarding`), studio (`/studio/[id]`), image workspace (`/image`, `/image/gallery`), video workspace (`/video`), infinite canvas (`/canvas`, `/canvas/[id]`).
- Evidence reviewed: user-supplied reference image, current route structure under `app/`, shared shell styles under `app/shared/`, route-level CSS modules, chat components, settings panels, skill-form styles, and the current implementation state after the white-linework UI reset.

## Brand

- Personality: precise, composed, product-grade, editorial, direct.
- Trust signals: stable black outlines, consistent control geometry, predictable page chrome, readable labels, explicit boundaries between tool groups.
- Avoid: dark glass surfaces, translucent slabs, glow effects, soft gradient hero styling, decorative masks, speculative motion, low-contrast text, unfinished wireframe roughness.

## Product goals

- Goals: unify all user-facing routes under one coherent visual system; preserve existing product behavior while replacing the visual language; improve scanability of tools, modes, presets, history, and workspace actions.
- Non-goals: backend redesign, API changes, database/schema changes, auth/session changes, business-logic refactors, feature-scope expansion, design-system package adoption.
- Success signals: every route reads as one product family; controls remain recognizable across pages; users can continue generating, saving, uploading, navigating, and editing without relearning workflows.

## Personas and jobs

- Primary personas: creators and operators using oTATo to plan, generate, organize, review, and iterate on creative assets.
- User jobs: enter a workspace, configure tools, manage projects, generate media, review history, arrange assets, and continue work across related surfaces.
- Key contexts of use: desktop-first, long-session production work, frequent switching between rails, canvases, forms, history lists, and previews.

## Information architecture

- Primary navigation: a sparse top bar for global movement; each workspace exposes local actions in a left rail, right rail, or compact top/bottom operation strip.
- Core routes/screens: `/`, `/login`, `/me`, `/settings`, `/chat`, `/projects`, `/project/[id]/onboarding`, `/studio/[id]`, `/image`, `/image/gallery`, `/video`, `/canvas`, `/canvas/[id]`.
- Content hierarchy: global chrome first; local tool selection second; one dominant work surface third; secondary status, history, and support actions adjacent to the work surface.

## Design principles

- Principle 1: Production linework, not draft wireframe. The visual system borrows the structural clarity of a wireframe, but the final interface must feel deliberate and product-ready.
- Principle 2: White canvas, black controls. The UI defaults to white or warm-white surfaces with black outlines and dark text; color is used sparingly for semantic states.
- Principle 3: One border owner per group. A layout cluster may be framed by one outer work panel or by individually outlined children, but never both at the same visual weight.
- Principle 4: Rails over containers. Modes, presets, sessions, history, and categories should read as grouped rails of outlined items, not as stacked glass cards inside larger bordered trays.
- Principle 5: Stable behavior, replaced shell. Visual redesign must not change route behavior, API usage, generation logic, upload flows, save logic, or persistence contracts.
- Principle 6: Reuse before inventing. Shared shell primitives and established route patterns are extended first; new visual helpers are justified only when existing classes cannot express the required result.

## Visual language

- Color:
  Page background `#ffffff`
  Soft background `#f7f7f4`
  Fill hover `#f3f3ef`
  Primary ink `#050505`
  Muted ink `#5f5f5a`
  Danger `#b42318`
  Success `#146c43`
  Warning `#8a5a00`
- Typography: compact Chinese-first product typography; section titles generally `13-16px` with strong weight; body copy `12-14px`; helper text `11-12px`; no decorative letter spacing tricks.
- Spacing rhythm: page padding `24-32px`; panel gaps `16-24px`; control gaps `8-12px`; maintain stable heights and widths for repeated controls so labels and hover states do not shift layout.
- Shape and radius: primary work panels use `3-4px` black borders with `28-32px` radius; secondary cards and framed media use `2px` borders with `18-24px` radius; default controls use compact rounded rectangles, not pill capsules.
- Control geometry: operation-bar controls standardize on `34px` height with `15px` outer radius; segmented controls use derived inner radii and closed geometry so inner fills never leak into parent corners, including in Safari.
- Elevation: shadows are absent or extremely light; outlines and spacing define hierarchy.
- Imagery and iconography: media is literal content and should be shown clearly within outlined frames; interface icons stay as simple stroke-based SVG marks aligned with the linework system.

## Components

- Shared shell primitives: `app/shared/shell.module.css` is the primary compatibility layer and remains the canonical source for shared page, card, form, button, segmented, banner, modal, and rail primitives.
- Reuse targets: route CSS modules, chat rails/composer, settings panels, skill-form widgets, image/video workspaces, and canvas/studio surfaces should inherit shared control logic unless a route has a strong local reason to diverge.
- Control states: inactive controls default to white fill with black outline; active controls invert to black fill with white text; hover states may use light fill but must preserve strong legibility and geometry; disabled controls stay visible with reduced opacity.
- Text inputs and fields: fields keep their own border as the focus signal; do not add external gray focus rings, offset outlines, or browser-native gray halos around inputs, selects, textareas, or editable surfaces.
- Rails: left/right/top rails are layout structures; individual rail items own the visible outline unless the rail itself is the main work panel.
- Media frames: images, videos, and covers must clip cleanly to their parent radius; content and frame radii must align so no corner gaps appear.
- Canvas generation nodes: image, video, and text-generation nodes on the infinite canvas reuse the same operation-bar language as the standalone workspace pages.
- Canvas media nodes: custom linework controls are required for audio playback; native browser audio controls are not acceptable because they break the project visual system across browsers.
- Canvas grid: the infinite-canvas grid is a functional world-space reference; decorative page grids belong only to the homepage and must not appear on unrelated routes.
- Prompt preset card: all prompt preset cards must use the shared prompt-preset card component rather than route-local copies. The card uses a left 16:9 cover that displays the whole image, a right metadata column for kind, secondary tags, title, description, and model chips, plus a bottom action bar. On `/prompt` the action bar contains only `收藏 / 已收藏`; inside workspace preset dialogs it is split evenly between `查看提示词` and `收藏 / 已收藏`. Card body click applies/selects the preset; copying prompt text belongs only in the detail or preview dialog. Secondary tags, model chips, selected state, and favorite state must remain visually consistent across `/prompt`, image, video, chat, and canvas.

## Accessibility

- Target standard: practical WCAG AA contrast for text and controls.
- Keyboard/focus behavior: keyboard access remains required, but focused controls must express state through their own border and fill treatment rather than through a second external focus frame.
- Contrast/readability: black-on-white is the default; muted text still needs clear readability; placeholder and helper text must remain visible on white backgrounds.
- Screen-reader semantics: preserve existing semantics, labels, button roles, modal structure, and ARIA state wiring.
- Motion sensitivity: transitions remain short and restrained; decorative animation is not introduced as a primary communication device.

## Responsive behavior

- Supported breakpoints/devices: desktop-first with workable tablet and narrow-screen fallbacks.
- Layout adaptation: side rails can collapse into horizontal grouped strips; main content stacks into a single column; control rows wrap instead of overflowing.
- Touch and hover: hover is an enhancement, not a dependency; every core action remains tappable without hidden hover-only affordances.

## Interaction states

- Loading: use outlined placeholders, inline spinners, or existing progress treatments; avoid full-page dark overlays.
- Empty: use concise empty states with clear boundaries and restrained helper copy.
- Error: use readable warning or danger styles with immediate practical feedback.
- Success: use black active controls or green semantic treatments without changing geometry.
- Disabled: retain outline visibility with lower opacity instead of washing controls into the background.
- Slow/offline behavior: preserve current behavioral handling; present status using the same outlined visual language.

## Content voice

- Tone: short, direct, operational.
- Terminology: use product nouns consistently, including `项目`, `编剧室`, `画廊`, `模式`, `参考图`, `模型`, `比例`, `生成`, `保存`, `清空`, `设置`, `会话`.
- Microcopy rules: labels should name the action or state directly; helper text should clarify only what is necessary; avoid decorative explanation or marketing phrasing.

## Implementation constraints

- Framework/styling system: Next.js App Router, React, CSS Modules, existing Tailwind import retained only because the codebase already includes it.
- Design-token constraints: visual tokens live in `app/globals.css`; shared shell behavior lives in `app/shared/shell.module.css`; route-specific surfaces stay in local CSS modules.
- Compatibility constraints: do not change API routes, Supabase access, authentication/session behavior, generation runtimes, upload logic, persistence keys, or schema assumptions as part of visual work.
- Performance constraints: avoid heavy filters, layered shadows, redundant wrappers, or additional rendering surfaces that degrade workspace responsiveness.
- Maintenance rule: preserve shared class names where possible to minimize JSX churn and reduce regression risk during continued UI cleanup.
- Verification expectations: visual changes should be checked with lint, `npx tsc --noEmit`, and route-level smoke review on affected surfaces.

## Open questions

- [ ] Whether the brand should later introduce a controlled amount of hand-drawn irregularity without weakening the current production-grade linework.
- [ ] Whether side rails in chat and studio should eventually become user-resizable.
- [ ] Whether narrow-screen navigation should remain wrapped rails or evolve into a dedicated mobile navigation model.
