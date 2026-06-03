# /ai-live-action QA Report

## Summary

- Scope: `/ai-live-action` page, visible controls, validation behavior, route protection, lint/build checks.
- Result: Page shell is usable and production build succeeds. Core external AI flow was not executed because it would call configured LLM/image services and may incur external cost.
- Issues found: 0 blocking functional issues in the tested surface.

## Evidence

- Screenshot: `dogfood-output/screenshots/ai-live-action-top.png`
- Validation screenshot: `dogfood-output/screenshots/ai-live-action-validation.png`

## Checks Performed

- Opened `http://localhost:4000/ai-live-action` in the in-app browser with existing login cookies.
- Confirmed page renders the input asset section, model/size/aspect controls, action buttons, and output panel.
- Confirmed no browser console errors or warnings after page load and tested interactions.
- Clicked `只分析首帧` with empty required images and confirmed the required-assets error appears.
- Clicked `一键生成首帧` with empty required images and confirmed the same required-assets error appears.
- Added extra role and prop rows; confirmed duplicated input rows render.
- Filled role, prop, and intent inputs; confirmed state updates in the UI.
- Confirmed unauthenticated direct POST to `/api/ai-live-action/reconstruct` returns `401 {"error":"请先登录"}`.
- Confirmed unauthenticated direct POST to `/api/ai-live-action/run` returns `401 {"error":"请先登录"}`.
- Ran `npm run lint`: 0 errors, 6 warnings. Two warnings are in `app/ai-live-action/page.tsx` for raw `<img>` usage.
- Ran `npm run build`: passed, including `/ai-live-action` and both `ai-live-action` API routes.

## Not Tested

- Real image file selection through the browser file picker.
- Successful `只分析首帧` LLM call.
- Successful `一键生成首帧` LLM + image generation + gallery save.
- Supabase site settings contents, because local `SUPABASE_SERVICE_ROLE_KEY` is empty.

## Notes

The tested page surface is complete enough to use once a user is logged in and required AI settings are valid. The remaining unverified path is the actual external AI execution path.
