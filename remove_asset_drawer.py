import re
import sys

with open('app/canvas/[id]/page.tsx', 'r') as f:
    content = f.read()

# 1. Remove types
content = re.sub(
    r'type AssetKind = "text" \| "image" \| "video" \| "audio";\n\ntype MenuState =',
    r'type MenuState =',
    content
)
content = re.sub(
    r'type AssetDrawerState = { open: boolean; insertAt: CanvasPosition \| null };\n\ntype TextAsset = \{[\s\S]*?\n\};\n\ntype AssetItem = \{[\s\S]*?\n\};\n',
    r'',
    content
)

# 2. Remove states
content = re.sub(
    r'  const \[assetDrawer, setAssetDrawer\] = useState<AssetDrawerState>\(\{ open: false, insertAt: null \}\);\n  const \[assetQuery, setAssetQuery\] = useState\(""\);\n  const \[imageAssets, setImageAssets\] = useState<ImageGalleryRecord\[\]>\(\[\]\);\n  const \[videoAssets, setVideoAssets\] = useState<VideoGalleryRecord\[\]>\(\[\]\);\n  const \[textAssets, setTextAssets\] = useState<TextAsset\[\]>\(\[\]\);\n',
    r'',
    content
)
content = re.sub(
    r'  const \[assetLoading, setAssetLoading\] = useState\(false\);\n  const \[assetError, setAssetError\] = useState\(""\);\n  const \[assetNotice, setAssetNotice\] = useState\(""\);\n',
    r'',
    content
)

# 3. Remove callbacks
content = re.sub(
    r'  const loadTextAssets = useCallback\(\(\) => \{[\s\S]*?  \}, \[\]\);\n\n  const saveTextAssets = useCallback\(\(items: TextAsset\[\]\) => \{[\s\S]*?  \}, \[\]\);\n\n  const openAssetDrawer = useCallback\(\(insertAt: CanvasPosition \| null = null\) => \{[\s\S]*?  \}, \[\]\);\n\n  const closeAssetDrawer = useCallback\(\(\) => \{[\s\S]*?  \}, \[\]\);\n\n  const handleCanvasWheel',
    r'  const handleCanvasWheel',
    content
)

# 4. Remove useEffects
content = re.sub(
    r'  useEffect\(\(\) => \{\n    loadTextAssets\(\);\n  \}, \[loadTextAssets\]\);\n\n',
    r'',
    content
)
content = re.sub(
    r'  useEffect\(\(\) => \{\n    if \(!assetDrawer\.open\) return;\n    let cancelled = false;\n    setAssetLoading\(true\);\n    setAssetError\(""\);\n    Promise\.all\(\[\n      fetchGalleryRecords\(\)\.catch\(\(\) => \[\] as ImageGalleryRecord\[\]\),\n      fetchVideoGalleryRecords\(\)\.catch\(\(\) => \[\] as VideoGalleryRecord\[\]\),\n    \]\)\.then\(\(\[images, videos\]\) => \{\n      if \(cancelled\) return;\n      setImageAssets\(images\);\n      setVideoAssets\(videos\);\n    \}\)\.catch\(\(e\) => \{\n      if \(!cancelled\) setAssetError\(e instanceof Error \? e\.message : "素材库加载失败"\);\n    \}\)\.finally\(\(\) => \{\n      if \(!cancelled\) setAssetLoading\(false\);\n    \}\);\n    return \(\) => \{ cancelled = true; \};\n  \}, \[assetDrawer\.open\]\);\n',
    r'',
    content
)

# 5. Remove insertAsset and saveNodeToAssets
content = re.sub(
    r'  const insertAsset = useCallback\(\(asset: AssetItem\) => \{[\s\S]*?  \}, \[saveTextAssets, textAssets\]\);\n\n  const runImageGenNode',
    r'  const runImageGenNode',
    content
)

# 6. Remove assetItems useMemo
content = re.sub(
    r'  const assetItems = useMemo<AssetItem\[\]>\(\(\) => \{[\s\S]*?  \}, \[assetQuery, imageAssets, nodes, textAssets, videoAssets\]\);\n\n  const minimap',
    r'  const minimap',
    content
)

# 7. Remove openAssetDrawer from nav
content = re.sub(
    r'          <button type="button" className=\{shellStyles\.navLink\} onClick=\{\(\) => openAssetDrawer\(null\)\}>素材库</button>\n        </nav>',
    r'        </nav>',
    content
)

# 8. Remove from context menus
content = re.sub(
    r'              <button type="button" onClick=\{\(\) => \{ openAssetDrawer\(menu\.world\); setMenu\(null\); \}\}>打开素材库</button>\n',
    r'',
    content
)

# 9. Remove saveNodeToAssets from node context
content = re.sub(
    r'                          <button type="button" title="加入素材库" onClick=\{\(\) => void saveNodeToAssets\(node\.id\)\}>入库</button>\n',
    r'',
    content
)

# 10. Remove the entire JSX Drawer block
content = re.sub(
    r'        \{/\* Asset Drawer \*/\}[\s\S]*?        \{/\* Keyboard Shortcuts Drawer \*/\}',
    r'        {/* Keyboard Shortcuts Drawer */}',
    content
)

# 11. Remove AssetDrawerNotice (assetNotice)
content = re.sub(
    r'        \{assetNotice && \( <div className=\{styles\.assetNoticeOverlay\}><div className=\{styles\.assetNotice\}>\{assetNotice\}</div></div> \)\}\n',
    r'',
    content
)

with open('app/canvas/[id]/page.tsx', 'w') as f:
    f.write(content)
