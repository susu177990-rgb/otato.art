# Wattpad「扒网文」集成 — 实现说明（待 Agent 模式落盘）

当前环境为 **Plan 模式**，无法写入非 Markdown 源码文件。请切换到 **Agent 模式** 后让助手按本文档创建/修改文件；或你自行复制各代码块。

## 架构

```mermaid
flowchart LR
  Browser[Browser]
  Next[Nextjs_BFF]
  Py[Wattpad_FastAPI]
  Browser -->|/api/wattpad/*| Next
  Next -->|WATTPAD_API_URL| Py
```

- Python 服务：`services/wattpad-api/`（已从 `网文爬虫` 复制 `wattpad_*.py`、`translate_*.py`、`docx_renderer.py`）。
- Next 仅暴露 `/api/wattpad/search`、`/api/wattpad/export-batch`，服务端转发，不把内网地址暴露给浏览器（可选再加内部 token）。

## 1. 已执行的 shell（若未执行需补）

```bash
mkdir -p services/wattpad-api
cp /path/to/网文爬虫/{wattpad_tool.py,wattpad_export.py,wattpad_cookies.py,translate_wattpad_html.py,docx_renderer.py} services/wattpad-api/
```

## 2. `services/wattpad-api/requirements.txt`

```
beautifulsoup4>=4.12,<5
python-docx>=1.1,<2
requests>=2.32,<3
fastapi>=0.115,<1
uvicorn[standard]>=0.32,<1
python-multipart>=0.0.9,<1
```

## 3. `services/wattpad-api/main.py`

见下节完整代码（FastAPI：`GET /health`、`POST /v1/search`、`POST /v1/export/batch` multipart：`payload` JSON + 可选 `cookies` 文件；返回 `application/zip`；进度摘要放在响应头 `X-Wattpad-Log` 前 8000 字符）。

## 4. Next 环境变量

`.env.local`：

```
WATTPAD_API_URL=http://127.0.0.1:8765
# 可选：WATTPAD_API_SECRET=... 与 Python 侧校验（公司内网加固时再写）
```

## 5. Next Route Handlers

- `app/api/wattpad/search/route.ts`：`POST` body JSON → 转发 `POST {WATTPAD_API_URL}/v1/search`
- `app/api/wattpad/export-batch/route.ts`：`POST` multipart（与 Python 一致）→ 转发并流式返回 zip

## 6. UI `app/wattpad/page.tsx`

复刻原 Tk 布局（单页）：

- 顶栏：深色 hero（与项目 `zinc-950` / `indigo` 一致），标题「扒网文」+ 副标题，链接「← 模式选择」`/`
- 搜索区：关键词、搜索按钮、最多、每页、成熟、付费、JSON/CSV（浏览器侧用上次结果生成 Blob 下载，不写服务器目录）、输出目录改为说明文案
- 左右分栏：左表格列 `# / 标题 / 作者 / 阅读 / 票 / 章 / 类`，多选；右「预览」同原字段块
- 表格下按钮：导出、复制链接、全选
- 导出弹窗：数量、列表、中文勾选、若有付费行则显示 Cookie 文件上传
- 底栏：状态条 + 日志区（等宽字体）+ 清空；「打开输出」在 Web 上改为 zip 下载完成后提示「已下载」

首页 `app/page.tsx`：「扒网文」卡片 `onClick` → `router.push('/wattpad')`，去掉 disabled。

## 7. 启动命令

终端 1：

```bash
cd services/wattpad-api && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8765
```

终端 2：在仓库根目录执行 `npm run dev`

---

## `main.py` 完整代码

```python
"""HTTP wrapper around the Wattpad crawler modules (same logic as wattpad_tool / wattpad_app)."""

from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from wattpad_tool import build_session, export_authorized_story, search_stories
from wattpad_export import slugify

app = FastAPI(title="Wattpad API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    keyword: str = Field(min_length=1)
    max_results: int = Field(default=20, ge=1, le=200)
    page_size: int = Field(default=50, ge=5, le=100)
    include_mature: bool = False
    include_paywalled: bool = False


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/search")
def v1_search(req: SearchRequest) -> dict[str, Any]:
    session = build_session()
    try:
        return search_stories(
            session=session,
            keyword=req.keyword.strip(),
            max_results=req.max_results,
            page_size=req.page_size,
            include_mature=req.include_mature,
            include_paywalled=req.include_paywalled,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        session.close()


@app.post("/v1/export/batch")
async def v1_export_batch(
    payload: str = Form(..., description="JSON: { stories, translateZh, keyword? }"),
    cookies: UploadFile | None = File(None),
) -> StreamingResponse:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from e

    stories = data.get("stories")
    if not isinstance(stories, list) or not stories:
        raise HTTPException(status_code=400, detail="stories must be a non-empty array")

    translate_zh = bool(data.get("translateZh", False))
    any_paywalled = any(bool(s.get("isPaywalled")) for s in stories if isinstance(s, dict))

    cookies_path: Path | None = None
    if cookies is not None and cookies.filename:
        suffix = Path(cookies.filename).suffix or ".txt"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(await cookies.read())
        tmp.flush()
        tmp.close()
        cookies_path = Path(tmp.name).resolve()

    if any_paywalled and (cookies_path is None or not cookies_path.is_file()):
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Paywalled selection requires cookies file")

    keyword = str(data.get("keyword") or "batch").strip()
    suggest_stem = f"{slugify(keyword) or 'batch'}-{len(stories)}部"

    tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_zip.close()
    archive_path = Path(tmp_zip.name).resolve()

    log_buf = io.StringIO()

    def log_line(msg: str) -> None:
        log_buf.write(msg + "\n")

    try:
        with tempfile.TemporaryDirectory(prefix="wattpad-batch-") as temp_root:
            staging = Path(temp_root) / suggest_stem
            staging.mkdir(parents=True, exist_ok=True)
            staging = staging.resolve()
            session = build_session()
            all_docx: list[Path] = []
            try:
                for idx, story in enumerate(stories, start=1):
                    if not isinstance(story, dict):
                        raise HTTPException(status_code=400, detail="Each story must be an object")
                    title = story.get("title", "")
                    log_line(f"[批量 {idx}/{len(stories)}] {title}")
                    url = story.get("url") or ""
                    if not url:
                        raise HTTPException(status_code=400, detail=f"缺少作品链接：{title!r}")
                    sid = story.get("id") or idx
                    folder_name = f"{slugify(story.get('title', '') or 'story')}-{sid}".strip()
                    per_dir = (staging / folder_name).resolve()
                    per_dir.mkdir(parents=True, exist_ok=True)
                    result = export_authorized_story(
                        session=session,
                        story_url=url,
                        output_dir=per_dir,
                        basename=None,
                        translate_to_chinese=translate_zh,
                        cookies_path=cookies_path,
                    )
                    all_docx.append(Path(result["english_docx"]).resolve())
                    if "chinese_docx" in result:
                        all_docx.append(Path(result["chinese_docx"]).resolve())
            finally:
                session.close()

            zip_root = staging.resolve()
            if archive_path.exists():
                archive_path.unlink()
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for docx in all_docx:
                    arcname = docx.resolve().relative_to(zip_root).as_posix()
                    archive.write(docx, arcname)

        log_line(f"ZIP: {archive_path}")

        def iter_file() -> Any:
            try:
                with archive_path.open("rb") as fh:
                    while True:
                        chunk = fh.read(65536)
                        if not chunk:
                            break
                        yield chunk
            finally:
                archive_path.unlink(missing_ok=True)
                if cookies_path and cookies_path.exists():
                    cookies_path.unlink(missing_ok=True)

        filename = f"{suggest_stem}.zip"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Wattpad-Log": log_buf.getvalue()[:8000],
        }
        return StreamingResponse(iter_file(), media_type="application/zip", headers=headers)
    except HTTPException:
        if archive_path.exists():
            archive_path.unlink(missing_ok=True)
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise
    except Exception as e:  # noqa: BLE001
        if archive_path.exists():
            archive_path.unlink(missing_ok=True)
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
```

---

切换到 **Agent 模式** 后回复「按 docs/wattpad-integration-implementation.md 落盘」，即可自动创建 `main.py`、Next API 与 `/wattpad` 页面并接通首页。
