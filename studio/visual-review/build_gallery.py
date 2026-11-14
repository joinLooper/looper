#!/usr/bin/env python3
"""Looper Studio visual-first review: real checked-in PNGs only.

Builds a standalone gallery ZIP via GitHub Actions. No AI art or placeholder PNG
generation. Missing files fail the build. New approved assets must be registered
explicitly and backed by visual proof & human review.
"""
import argparse
import datetime
import hashlib
import html
import json
from pathlib import Path
from shutil import copy2
from urllib.parse import quote


def esc(value):
    return html.escape(str(value), quote=True)


def render_tile(item, source, sha):
    source_rel = "assets/" + item["file"]
    return (
        '<article class="tile" data-kind="' + esc(item["kind"]) + '" data-search="' +
        esc(item["name"] + " " + item["note"]) + '">' +
        '<button class="view" type="button" data-full="' + esc(source_rel) +
        '" aria-label="' + esc("放大檢視 " + item["name"]) + '">' +
        '<img loading="lazy" src="' + esc(source_rel) + '" alt="' + esc(item["name"]) + '">' +
        '</button><div class="inner"><strong>' + esc(item["name"]) + '</strong>' +
        '<p class="status">工程來源已存在 · 不等於新宇宙美術核准</p><p>' + esc(item["stage"]) +
        '</p><p class="small">' + esc(item["note"]) + '</p>' +
        '<code>' + esc(item["file"]) + '</code><p class="digest">SHA-256 ' +
        esc(sha[:16]) + '…</p></div></article>'
    )


def render_missing(item):
    return ('<article class="tile missing" data-kind="' + esc(item["kind"]) +
            '" data-search="' + esc(item["name"]) +
            '"><div class="pending-art">尚無可展示的正式原生母件</div><div class="inner"><strong>' +
            esc(item["name"]) + '</strong><p class="status">待補正式來源與創辦人美術驗收</p><p>' +
            esc(item["reason"]) + '</p></div></article>')


def build(root: Path, output: Path, manifest: Path):
    root, output = root.resolve(), output.resolve()
    data = json.loads(manifest.read_text(encoding="utf-8"))
    if output.is_relative_to(root / "apps/mobile/assets"):
        raise ValueError("輸出不能覆寫原素材")
    files = []
    tiles = []
    seen = set()
    for item in data["items"]:
        name = item["file"]
        if not isinstance(name, str) or Path(name).is_absolute() or ".." in Path(name).parts or not name.endswith(".png"):
            raise ValueError("Unsafe asset path: " + str(name))
        if name in seen:
            raise ValueError("Duplicate asset: " + name)
        seen.add(name)
        source = (root / "apps/mobile/assets" / name).resolve()
        if not source.is_relative_to((root / "apps/mobile/assets").resolve()) or not source.is_file():
            raise FileNotFoundError("Missing real repo asset: " + name)
        target = output / "assets" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        copy2(source, target)
        sha = hashlib.sha256(source.read_bytes()).hexdigest()
        files.append({"key": item["key"], "relativePath": name, "sha256": sha, "stage": item["stage"]})
        tiles.append(render_tile(item, source, sha))
    # New PNGs can never disappear silently from the founder's visual gallery.
    # Every runtime artwork file must be registered; this is a *visual evidence*
    # gate, not an automatic creative approval.
    source_folder = (root / "apps/mobile/assets").resolve()
    actual = {p.relative_to(source_folder).as_posix() for p in source_folder.rglob("*.png")}
    missing_from_review = sorted(actual - seen)
    if missing_from_review:
        raise ValueError("New runtime images need a visible gallery entry: " +
                         ", ".join(missing_from_review))
    tiles.extend(render_missing(p) for p in data["pending"])
    output.mkdir(parents=True, exist_ok=True)
    written = {"manifestVersion": data["version"],
               "createdUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "items": files,
               "pending": data["pending"],
               "newArtApprovalGranted": False}
    (output / "asset-proof.json").write_text(json.dumps(written, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    body = "".join(tiles)
    title = esc(data["title"])
    # Entirely self-contained CSS/JS; files remain local and no remote resources are loaded.
    template = r'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>
:root{color-scheme:light;--ink:#334a36;--leaf:#557b5b;--line:#d9ded1;--paper:#fbfaf6}
*{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:system-ui,"Noto Sans TC",sans-serif;background:#f2f5ee}
header{padding:36px max(20px,calc((100vw - 1250px)/2));background:linear-gradient(125deg,#eaf1df,#fef9e8)}
h1{font-size:clamp(23px,3vw,36px);margin:0 0 8px}h2{font-size:20px}p{line-height:1.55}
.lead{max-width:900px;color:#5d6b5e;margin:4px 0 12px}.notice{border-left:4px solid #aa873f;background:#fff5da;padding:11px 14px;border-radius:8px;margin:18px 0}
main{max-width:1250px;margin:0 auto;padding:18px}.controls{position:sticky;top:0;padding:12px 0;display:flex;gap:8px;flex-wrap:wrap;background:#f2f5ee;z-index:2}
.controls button{background:white;border:1px solid #c7d4c7;border-radius:30px;padding:11px 16px;color:#395442;cursor:pointer}
.controls button.active{background:#355d43;color:white}input{min-width:155px;flex:1;padding:11px;border:1px solid #c7d4c7;border-radius:12px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.tile{overflow:hidden;background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 5px 16px #284a3010}
.tile .view{width:100%;height:250px;background:#e8ebdc;border:0;padding:8px;cursor:zoom-in}
.tile img{width:100%;height:100%;object-fit:contain}
.inner{padding:13px 15px}strong{display:block;font-size:15px}.inner p{margin:5px 0;font-size:13px}
.inner .status{color:#835b12;font-weight:650}.small{color:#607264}code{display:block;overflow-wrap:anywhere;font-size:11px;color:#6a766d}
.digest{color:#939c90!important;font-size:11px!important}.pending-art{height:250px;display:grid;place-items:center;padding:30px;text-align:center;background:repeating-linear-gradient(-45deg,#f0f1e8,#f0f1e8 10px,#e8ece1 10px,#e8ece1 20px);color:#7d7d6f}
footer{padding:40px 20px;text-align:center;font-size:13px;color:#647666}
dialog{max-width:95vw;max-height:95vh;border:0;border-radius:18px;padding:12px;background:#fff;box-shadow:0 20px 90px #0d281c66}
dialog img{display:block;max-width:min(1200px,90vw);max-height:80vh;object-fit:contain}dialog button{float:right;margin:0 0 10px;padding:8px 14px;border:1px solid #9dac9b;background:#f6f8f3;border-radius:8px;cursor:pointer}
[hidden]{display:none!important}
</style></head><body><header><h1>__TITLE__</h1>
<p class="lead">真正的素材縮圖、原圖放大與來源狀態，集中在同一頁。你可以逐件檢視森林、物件和不同任務畫面，不需要讀工程報告。</p>
<p class="notice">這是<strong style="display:inline">內部製作驗收台</strong>，不是正式 App 畫面，也不是 Looper 宇宙藝術核准。某些素材屬舊版工程預覽；角色原生母件尚缺時，直接標示待製作，絕不用假角色取代。</p>
</header><main><div class="controls">
<button type="button" class="active" data-filter="all">全部</button>
<button type="button" data-filter="scene">場景</button>
<button type="button" data-filter="object">物件</button>
<button type="button" data-filter="ui-state">任務狀態</button>
<button type="button" data-filter="character">人物</button>
<button type="button" data-filter="interface">介面缺件</button>
<input id="search" type="search" placeholder="搜尋素材名稱..." aria-label="搜尋素材">
</div><p id="count" aria-live="polite"></p><section class="gallery">__ITEMS__</section>
<p class="notice">互動請開啟現有 Expo App 的森林場景，驗收「點擊小書 → 背景變暗 → 答題 → 返回森林」。此靜態素材圖庫不取代 iPhone 實機驗收。</p>
</main><footer>Looper Studio｜可視成果優先｜正式規格以宇宙工程書與 Visual Asset Register 為準。</footer>
<dialog id="viewer"><button type="button" id="close">關閉放大圖 ✕</button><img id="detail" alt="放大檢視"></dialog>
<script>
const controls=[...document.querySelectorAll('[data-filter]')],tiles=[...document.querySelectorAll('.tile')];
let filter='all';const search=document.getElementById('search'),count=document.getElementById('count');
function update(){const q=search.value.trim().toLocaleLowerCase();let visible=0;tiles.forEach(t=>{let ok=(filter==='all'||t.dataset.kind===filter)&&t.dataset.search.toLocaleLowerCase().includes(q);t.hidden=!ok;if(ok)visible++});count.textContent='目前顯示 '+visible+' 項（含正式母件待補項目）';}
controls.forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;controls.forEach(x=>x.classList.toggle('active',x===b));update()}));
search.addEventListener('input',update);update();
const dlg=document.getElementById('viewer'),img=document.getElementById('detail');
document.querySelectorAll('.view').forEach(b=>b.addEventListener('click',()=>{img.src=b.dataset.full;img.alt=b.getAttribute('aria-label');dlg.showModal()}));
document.getElementById('close').addEventListener('click',()=>dlg.close());
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
</script></body></html>'''
    (output / "index.html").write_text(template.replace("__TITLE__", title).replace("__ITEMS__", body), encoding="utf-8")
    return len(files), len(data["pending"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--manifest", default="studio/visual-review/manifest.json")
    parser.add_argument("--output", default="output/studio-visual-review")
    args = parser.parse_args()
    total, pending = build(Path(args.root), Path(args.output), Path(args.manifest))
    print(json.dumps({"realImages": total, "declaredMissing": pending,
                      "output": args.output, "artApproved": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
