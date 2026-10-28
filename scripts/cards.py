"""The two cards a link or a gallery shows before anyone opens the site: the Open Graph image (1200x630) and the
Devpost thumbnail (3:2, legible at 250 px wide). One composition at both sizes, built on the site's own first view:
the Luxy shades hanging from the steel rail light to dark, and the latest seed consult's first pick tagged on the
customer it was rendered on.

    python scripts/cards.py
"""
import base64
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CONSULT = ROOT / "seed" / "consults" / "2026-10-27-def4946d"
OUT = {
    ROOT / "src" / "app" / "opengraph-image.png": (1200, 630),
    ROOT / "docs" / "gallery" / "thumbnail.png": (1500, 1000),
}


def data_uri(path: Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()


# The strands, in the order fringe.tsx hangs them: lightest first, by measured swatch lightness.
catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf8"))["products"]
levels = [s["shade"] for s in json.loads((ROOT / "data" / "luxy-levels.json").read_text(encoding="utf8"))["shades"]]
swatch = {}
for p in catalog:
    if p["store"] == "luxy" and p["references"] and p["shade"] not in swatch:
        swatch[p["shade"]] = next((q["swatch"] for q in catalog if q["store"] == "luxy" and q["swatch"] and q["shade"].lower() == p["shade"].lower()), None)
strands = sorted([(s, u) for s, u in swatch.items() if u], key=lambda x: -(levels.index(x[0]) if x[0] in levels else len(levels)))

consult = json.loads((CONSULT / "consult.json").read_text(encoding="utf8"))
rec = consult["events"][-1]["result"]["recommendations"][0]
render = CONSULT / consult["render_files"][0]
# the same product line the shade tags carry (ring.tsx productLine)
line = re.sub(r"\s*\(\d+g\)\s*$", "", rec["title"]).replace(rec["shade"], "")
line = re.sub(r"\s+", " ", line).strip()
pinned = next(i for i, (s, _) in enumerate(strands) if s.lower() == rec["shade"].lower())

items = "".join(
    f'<li class="strand{" pinned" if i == pinned else ""}"><img src="{u}{"&" if "?" in u else "?"}width=120"></li>' for i, (s, u) in enumerate(strands)
)

HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500&family=Azeret+Mono:wght@400&family=Libre+Caslon+Display&display=block" rel="stylesheet">
<style>
:root {{ --canvas:#284d5f; --ink:#edf5f8; --muted:#adc2ca; --card:#faf6ef; --card-ink:#182429; --steel:#bdc6ca;
  --rail: 9vh; --strand: 20vh; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 100vw; height: 100vh; overflow: hidden; background: var(--canvas); color: var(--ink); }}
.mast {{ position: absolute; left: 5vw; top: 0; height: var(--rail); display: flex; align-items: center; gap: 1.1vh; }}
.mast span {{ font: 4.2vh/1 'Libre Caslon Display', Georgia, serif; }}
.rail {{ position: absolute; left: 0; right: 0; top: var(--rail); border-top: .3vh solid var(--steel); }}
ul {{ position: absolute; left: 0; right: 0; top: var(--rail); display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: .35vw; list-style: none; }}
.strand::before {{ content: ""; display: block; height: .7vh; background: var(--card); box-shadow: 0 1px 0 rgba(0,0,0,.25); }}
.strand img {{ display: block; width: 100%; height: var(--strand); object-fit: cover;
  -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); }}
.strand:nth-child(3n+1) img {{ height: calc(var(--strand) * .93); }}
.strand:nth-child(3n+2) img {{ height: calc(var(--strand) * .97); }}
.strand.pinned img {{ height: var(--strand); -webkit-mask-image: none; }}
.copy {{ position: absolute; left: 5vw; width: 50vw; top: calc(var(--rail) + var(--strand) + 6vh); bottom: 6vh;
  display: flex; flex-direction: column; justify-content: space-between; }}
h1 {{ font: 400 9.4vh/1.04 'Libre Caslon Display', Georgia, serif; letter-spacing: -.01em; text-wrap: balance; }}
p {{ font: 400 2.9vh/1.4 'Albert Sans', sans-serif; color: var(--muted); max-width: 30em; }}
figure {{ position: absolute; right: 0; bottom: 0; width: 40vw; top: calc(var(--rail) + var(--strand) + 2.4vh); overflow: hidden; }}
.render {{ width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; display: block; }}
.sent {{ position: absolute; left: 1.6vw; bottom: 2.4vh; width: 11vw; aspect-ratio: 1; object-fit: cover; border: .4vh solid var(--card); }}
.label {{ position: absolute; right: 1.6vw; bottom: 2.4vh; background: var(--card); color: var(--card-ink); font: 400 2.1vh/1 'Albert Sans', sans-serif; padding: 1vh 1.2vh; }}
.hang {{ position: absolute; right: {(len(strands) - pinned - 0.5) / len(strands) * 100:.2f}vw; top: calc(var(--rail) + .7vh + var(--strand)); display: flex; flex-direction: column; align-items: flex-end; z-index: 3; }}
.hang i {{ display: block; width: 2px; height: 4.4vh; background: var(--steel); }}
.tag {{ margin-right: -1px; transform-origin: 100% 0; transform: rotate(3deg); background: var(--card); color: var(--card-ink); padding: 1.4vh 2.4vh 1.6vh 1.8vh;
  clip-path: polygon(0 0, calc(100% - 2vh) 0, 100% 2vh, 100% 100%, 0 100%); box-shadow: 0 2vh 4vh -2vh rgba(0,0,0,.75); white-space: nowrap; }}
.tag b {{ display: block; font: 400 5.6vh/1 'Libre Caslon Display', Georgia, serif; }}
.tag small {{ display: block; margin-top: .6vh; font: 400 2.2vh/1.2 'Albert Sans', sans-serif; color: rgba(24,36,41,.72); }}
</style></head><body>
<div class="mast"><svg height="38%" viewBox="0 0 32 32" style="color:var(--steel)"><circle cx="13" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M18.2 18.6 21 22" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19.4 21.4h7.2l2.4 2.4v6.2h-9.6z" fill="#faf6ef" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg><span>Swatchless</span></div>
<div class="rail"></div>
<ul>{items}</ul>
<div class="copy">
  <h1>Answer &ldquo;which shade?&rdquo; with the customer wearing it</h1>
  <p>A colour-match desk for hair retailers, built on YouCam&rsquo;s hair analysis and try-on APIs.</p>
</div>
<figure><img class="render" src="{data_uri(render)}"><img class="sent" src="{data_uri(CONSULT / 'selfie.jpg')}"><span class="label">AI-generated composite customer</span></figure>
<div class="hang"><i></i><div class="tag"><b>{rec['shade']}</b><small>{line} &middot; {rec['store']} &middot; US${rec['price']:.0f}</small></div></div>
</body></html>"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for path, (w, h) in OUT.items():
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.set_content(HTML, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(path))
        print(f"  {path.relative_to(ROOT)}  {w}x{h}  {path.stat().st_size // 1024} KB")
    b.close()
