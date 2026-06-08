# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-08
- Primary product surfaces: home (`/`), login (`/login`), account (`/me`), settings (`/settings`), standalone chat (`/chat`), Wattpad tools (`/wattpad`), projects (`/projects`), onboarding (`/project/[id]/onboarding`), studio (`/studio/[id]`), image workspace (`/image`, `/image/gallery`), video workspace (`/video`), infinite canvas (`/canvas`, `/canvas/[id]`), AI+实拍 (`/ai-live-action`).
- Evidence reviewed: reference sketch supplied by the user, existing `DESIGN.md`, `app/shared/shell.module.css`, shared split modules under `app/shared/`, route CSS modules under `app/**`, chat/settings/skill form component CSS, and current route/component imports that depend on shared shell class names.

## Brand
- Personality: precise, editorial, product-grade, direct, handmade enough to feel intentional but not rough.
- Trust signals: stable black outlines, clear control grouping, predictable page chrome, visible input boundaries, consistent action placement.
- Avoid: dark glass, radial glow backgrounds, translucent slabs, saturated purple/indigo primary buttons, marketing hero layouts, decorative gradients, hidden controls, low-fidelity unfinished wireframe styling.

## Product goals
- Goals: make the entire product read as one white-canvas creative operating system; preserve every existing workflow while changing the visual language; make navigation and tool groups easier to scan.
- Non-goals: domain/SEO rename, backend/API/schema changes, new design-system dependency, feature redesign, data-flow cleanup.
- Success signals: every route reads as white background + black outline + rounded pills; users can complete current workflows without relearning data entry, generation, upload, save, or navigation behavior.

## Personas and jobs
- Primary personas: creator/operator using oTATo to search material, plan projects, write scripts, chat with agents, generate images/videos, and arrange visual boards.
- User jobs: choose a workspace, configure APIs and presets, manage projects, generate creative assets, review history, keep long-running work organized.
- Key contexts of use: desktop-first production sessions; repeated switching between side rails, main work panels, galleries, and settings.

## Information architecture
- Primary navigation: sparse topbar with pill actions; homepage acts as the launcher; working pages expose local tools in a left rail or compact top control group.
- Core routes/screens: `/`, `/login`, `/me`, `/settings`, `/chat`, `/wattpad`, `/projects`, `/project/[id]/onboarding`, `/studio/[id]`, `/image`, `/image/gallery`, `/video`, `/canvas`, `/canvas/[id]`, `/ai-live-action`.
- Content hierarchy: page chrome first, left/top tool choices second, one dominant rounded main panel third, secondary history/status/forms around the main panel.

## Design principles
- Principle 1: **Production linework, not rough wireframe**. The reference sketch defines structure and visual vocabulary, but implementation must remain polished, readable, and durable.
- Principle 2: **White canvas, black controls**. Page backgrounds are white/off-white; important panels and controls are black-outlined rounded shapes.
- Principle 3: **Preserve behavior through class stability**. Prefer keeping existing React components, handlers, state, API calls, and class names while changing CSS and layout wrappers.
- Principle 4: **Rails over clutter**. Mode lists, preset lists, sessions, history, and tool categories should read as side/top rails made of pills instead of dense glass panels.
- Principle 5: **One dominant work area**. Each route should have one obvious main rounded panel or canvas; secondary controls orbit it.
- Principle 6: **One border owner per group**. Repeated controls such as reference slots, filter rows, and rail items should not sit inside another heavy outline unless the outer container is the actual work surface. Tool groups use spacing; individual controls own their borders.
- Tradeoffs: desktop clarity takes priority over mobile density; mobile collapses rails rather than inventing separate flows.

## Visual language
- Color: page `#ffffff`; soft page tint `#f7f7f4`; text `#050505`; muted text `#5f5f5a`; faint fill `#f3f3ef`; active fill `#050505` with white text; danger `#b42318`; success `#146c43`; warning `#8a5a00`.
- Typography: system sans; compact Chinese UI; section titles 13-16px / 700; body 12-14px; helper text 11-12px; no negative letter spacing.
- Spacing/layout rhythm: 24-32px page padding, 16-24px panel gaps, 8-12px internal control gaps, stable min-heights for rails and toolbars.
- Shape/radius/elevation: critical outer containers use 3-4px solid black borders and 28-32px radius; secondary cards use 2px borders and 18-24px radius; pills use 999px radius; shadows are absent or tiny.
- Border ownership: a visual cluster may have either one outer heavy frame or individually outlined children, not both. Reference strips and compact toolbars are borderless layout rows unless they are the main work panel.
- Motion: 120-160ms hover/focus transitions only; no decorative animation beyond existing spinners/progress indicators.
- Imagery/iconography: real generated/uploaded media is shown as content; UI icons stay simple stroke icons; image/video previews get black outlined frames.

## Components
- Existing components to reuse: shared shell primitives in `app/shared/shell.module.css`, page CSS modules, chat rails/composer, skill form widgets, settings panels, studio/canvas/image/video route components.
- New/changed components: no new business components required for this pass; optional CSS-only helper classes may be added for `outlineShell`, `rail`, `workspacePanel`, and `sketchPill`.
- Variants and states: active pills invert to black fill + white text; hover states must either keep a strong black outline or invert to black fill + white text; disabled controls reduce opacity but keep outlines; danger uses red outline/fill tint; loading states keep current behavior with linework styling.
- Token/component ownership: global visual tokens live in `app/globals.css`; shared class behavior lives in `app/shared/shell.module.css`; page-local unusual surfaces stay in their route/component CSS modules.

## Accessibility
- Target standard: practical WCAG AA contrast for text and controls.
- Keyboard/focus behavior: all buttons, links, tiles, segmented controls, upload targets, composer controls, and canvas controls keep visible focus rings.
- Contrast/readability: black-on-white is the default; active black pills use white text; helper and placeholder text must stay visible on white (`#5f5f5a` or darker for UI labels, never pale blue-gray on white); warning/error/success states keep readable foregrounds.
- Screen-reader semantics: preserve existing labels, button elements, form fields, `aria-pressed`, `role="switch"`, and modal/drawer semantics.
- Reduced motion and sensory considerations: no new decorative motion; existing loading indicators remain modest.

## Responsive behavior
- Supported breakpoints/devices: desktop-first with usable tablet/narrow fallback.
- Layout adaptations: side rails collapse to horizontal pill strips below available width; main content becomes single-column; buttons wrap rather than overflow.
- Touch/hover differences: hover is enhancement only; all actions remain clickable/tappable.

## Interaction states
- Loading: outlined empty panel or inline spinner; avoid full dark overlays.
- Empty: dashed or solid rounded outline with concise helper text.
- Error: red outlined banner with direct verdict and action.
- Success: black active pill or green outlined status chip.
- Disabled: outlined shape remains visible with 45% opacity.
- Offline/slow network: preserve existing inline error placement and copy; style as outlined banners.

## Content voice
- Tone: short, direct, production-tool language.
- Terminology: `项目`, `编剧室`, `画廊`, `模式`, `参考图`, `模型`, `比例`, `生成`, `保存`, `清空`, `设置`, `会话`.
- Microcopy rules: no explanatory decoration; labels name the action or state; errors start with the practical result.

## Implementation constraints
- Framework/styling system: Next.js App Router, React client/server components, CSS Modules, Tailwind import retained only because the app already uses it.
- Design-token constraints: no new dependency or design-system layer; keep existing class names wherever possible.
- Performance constraints: avoid extra rendering layers that affect canvas/image/video performance; no heavy shadows or filters.
- Compatibility constraints: do not modify API routes, Supabase calls, auth/session logic, generation runtimes, uploads, localStorage keys, or database schemas.
- Test/screenshot expectations: run lint, `npx tsc --noEmit`, build, and visual smoke on major routes after implementation.

## Open questions
- [ ] Whether future iterations should add hand-drawn imperfections to borders. Owner: design / impact: brand warmth vs production clarity.
- [ ] Whether studio/chat side rails should become user-resizable. Owner: product / impact: desktop ergonomics.
- [ ] Whether mobile should get a dedicated bottom navigation rather than wrapped top/side rails. Owner: product / impact: narrow-screen usability.
