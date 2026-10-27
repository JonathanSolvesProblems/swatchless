"""Gallery previews for the Devpost form: eight images at 3:2, one caption each, 140 max.

Page shots are rendered at a 3:2 viewport from the running app (set URL to the deployed address before the
final run, so fonts and media are what a judge gets). The character count is asserted here and printed to the
terminal only; it never goes in captions.md and never next to a caption in chat.

    python scripts/preview.py
"""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------ CONFIG
OUT = ROOT / "docs" / "gallery"
URL = "https://swatchless.jonathansolvesproblems.com"
W, H = 1500, 1000
DEMO = "/consult/2026-10-27-def4946d"  # a live run on the deployed site: two renders and one pick shown without a render, with the reason

# story order = the demo video's order: name, path, selector scrolled to the top (None = top), selector to click first,
# viewport width (3:2 kept; a narrower viewport frames a short page tighter, and the image is scaled to W x H after)
SHOTS = [
    ("1-hero", "/", None, None, 1500),
    ("2-measured", DEMO, "#customer-h", None, 1140),
    ("3-reply", DEMO, ".reply", None, 1140),
    ("4-refused", DEMO, ".weft:has(.weft-tail-swatch)", None, 1140),
    ("5-decided", DEMO, ".steps", ".steps > summary", 1200),
    ("6-benchmark", "/benchmark", None, None, 1500),
    ("7-table", "/benchmark", "#rows-h", None, 1300),
    ("8-watch", "/watch", None, None, 1500),
]

CAPTIONS = {
    "1-hero": "A hair retailer's stylist answers \"which shade matches me?\" with the customer wearing it. The wall: 30 Luxy shades the desk can render.",
    "2-measured": "YouCam reads density at 2.3 of 4 and length as above chest or longer. Claude chooses fill-ins; YouCam renders the shades on the customer.",
    "3-reply": "The reply goes out from the stylist's own mail, with a cart link under each rendered pick. The customer is an AI-generated composite.",
    "4-refused": "What it cannot show, it says: this topper's store photos show a different shade, so the desk shows no render and says why under the swatch.",
    "5-decided": "Every decision is on the record: what YouCam measured, what it could not measure and why, and each step the desk took to the shortlist.",
    "6-benchmark": "Checked against Luxy's own stylists: their shade made the desk's shortlist for 13 of 16 people they styled, and YouCam rendered 15 of them.",
    "7-table": "Person by person, on Luxy Hair's own before photos, beside the same desk with YouCam off. An unofferable shade counts on neither side.",
    "8-watch": "After the reply the desk keeps working: an out-of-stock pick is refused, its stock re-read daily, and re-rendered when the store has it.",
}
# ------------------------------------------------------------------ END CONFIG

for k, c in CAPTIONS.items():
    assert len(c) <= 140, f"{k}: {len(c)} characters, limit is 140"
assert [s[0] for s in SHOTS] == list(CAPTIONS), "SHOTS and CAPTIONS must list the same names in the same order"
assert len(SHOTS) <= 8, "eight is the ceiling; a gallery is a story, not an archive"

OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
    pg = ctx.new_page()
    current = None
    for name, path, sel, click, vw in SHOTS:
        pg.set_viewport_size({"width": vw, "height": vw * 2 // 3})
        if path != current:
            pg.goto(URL + path, wait_until="networkidle", timeout=60_000)
            pg.evaluate("document.fonts.ready")
            pg.wait_for_timeout(1200)
            current = path
        if click:
            pg.click(click)
            pg.wait_for_timeout(300)
        if sel:
            pg.evaluate(f"window.scrollTo(0, document.querySelector('{sel}').getBoundingClientRect().top + window.scrollY - 28)")
        else:
            pg.evaluate("window.scrollTo(0, 0)")
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        if vw != W:
            Image.open(OUT / f"{name}.png").convert("RGB").resize((W, H), Image.LANCZOS).save(OUT / f"{name}.png")
    b.close()

lines = ["# Image gallery, upload in this order", "", "One caption per image. Copy the block contents only.", ""]
for name, *_ in SHOTS:
    lines += [f"## {name}.png", "", "```", CAPTIONS[name], "```", ""]
(OUT / "captions.md").write_text("\n".join(lines), encoding="utf-8")

for name, *_ in SHOTS:
    f = OUT / f"{name}.png"
    im = Image.open(f)
    ratio = im.width / im.height
    ok = "ok " if abs(ratio - 1.5) < 0.01 and f.stat().st_size < 5_000_000 else "BAD"
    print(f"  {ok} {f.name:<18} {im.width}x{im.height}  {f.stat().st_size // 1024:>4} KB   caption {len(CAPTIONS[name]):>3}/140")
print(f"\n{len(SHOTS)} images + captions.md in {OUT.relative_to(ROOT)}")
