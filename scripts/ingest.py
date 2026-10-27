"""Build data/catalog.json from three hair retailers' public Shopify feeds.

Keeps only products for thinning hair (fill-ins, toppers, hairpieces, headcovers) and classifies
every product photo once, so the agent is only ever offered references the try-on can use:
YouCam's hair transfer rejects a reference with no face (error_no_face).

Run: python -I scripts/ingest.py   (needs SWATCHLESS_ANTHROPIC_API_KEY in .env.local; re-runs reuse cached classifications)
"""
import base64, io, json, os, re, sys, time, urllib.request, concurrent.futures as cf
from PIL import Image, ImageDraw
import anthropic

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tmp", "ingest")
OUT = os.path.join(ROOT, "data", "catalog.json")
os.makedirs(CACHE, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "application/json"}

STORES = [
    {"id": "luxy", "name": "Luxy Hair", "domain": "luxyhair.com",
     "keep": r"Thinning Hair Fill-Ins|Scalp Hair Fill-Ins|Fourth Trimester Fill-Ins"},
    {"id": "halo", "name": "Halo Couture", "domain": "www.halocouture.com",
     "keep": r"Topper|Bangs|Halo Bangs"},
    {"id": "ellenwille", "name": "Ellen Wille", "domain": "www.ellenwille.com",
     "keep": r"Topper|Hairpiece|Power Pieces|Top Power", "types": ["Hair Toppers", "Hairpieces", "Hats/Headcovers"]},
]
KINDS = ["swatch", "front", "back", "side", "product", "composite", "other"]


def fetch_json(url):
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40))
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"could not fetch {url}")


def products(store):
    # Shopify rate-limits a busy client with 429s; a feed cached earlier the same day is used as-is.
    cached = os.path.join(CACHE, f"feed_{store['id']}.json")
    if os.path.exists(cached):
        return json.load(open(cached, encoding="utf-8"))
    out, page = [], 1
    while True:
        batch = fetch_json(f"https://{store['domain']}/products.json?limit=250&page={page}").get("products", [])
        if not batch:
            return out
        out += batch
        page += 1
        time.sleep(1.5)


def keep(store, p):
    if store.get("types") and p.get("product_type") in store["types"]:
        return True
    return re.search(store["keep"], p["title"], re.I) is not None


def thumb(src):
    name = re.sub(r"[^A-Za-z0-9._-]", "_", src.split("?")[0].split("/")[-1])
    path = os.path.join(CACHE, name if name.endswith(".jpg") else name + ".jpg")
    if not os.path.exists(path):
        url = src + ("&" if "?" in src else "?") + "width=240"
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        Image.open(io.BytesIO(data)).convert("RGB").save(path, quality=85)
    return path


def app_api_key():
    """The project's own key from .env.local, never an inherited ANTHROPIC_API_KEY (which may be a tool's session credential)."""
    env = {}
    path = os.path.join(ROOT, ".env.local")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    key = env.get("SWATCHLESS_ANTHROPIC_API_KEY", "")
    if not key.startswith("sk-ant-"):
        sys.exit("Set SWATCHLESS_ANTHROPIC_API_KEY in .env.local to an Anthropic API key created for this project.")
    return key


client = anthropic.Anthropic(api_key=app_api_key())
PROMPT = (
    "Each numbered tile is a photo from a hair product listing. Classify every tile as one of: "
    "swatch (close-up of hair texture only, no person), front (a person facing the camera, whole face visible), "
    "side (a person in profile or three-quarter, face partly visible), back (back of a head, no face), "
    "product (the hairpiece on a mannequin or flat, packaging, no person), composite (several photos or "
    "a before/after split in one tile, or text-heavy graphics), other. "
    'Return JSON only: {"tiles": [{"i": <n>, "kind": "<kind>"}]} with one entry per tile.'
)


def classify(paths):
    W, H, cols = 160, 213, 8
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (W * cols, H * rows), "white")
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB")
        im.thumbnail((W - 4, H - 18))
        x, y = (i % cols) * W, (i // cols) * H
        sheet.paste(im, (x + 2, y + 16))
        d.text((x + 3, y + 2), str(i), fill="red")
    buf = io.BytesIO()
    sheet.save(buf, "JPEG", quality=88)
    for attempt in range(3):
        try:
            msg = client.messages.create(
                model="claude-haiku-5-5", max_tokens=3000,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                 "data": base64.b64encode(buf.getvalue()).decode()}},
                    {"type": "text", "text": PROMPT}]}])
            text = "".join(b.text for b in msg.content if b.type == "text")
            tiles = json.loads(text[text.find("{"): text.rfind("}") + 1])["tiles"]
            return {t["i"]: t["kind"] if t["kind"] in KINDS else "other" for t in tiles}
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError,
                json.JSONDecodeError, KeyError, TypeError):
            continue
    return {}


def shade_of(store, title, variant_title):
    if store["id"] == "luxy":
        t = re.sub(r"^\s*\d+\S*\s*", "", title)
        return re.split(r"\s+(Thinning|Scalp|Fourth|Topper)\b", t)[0].replace("Hair", "").strip()
    if store["id"] == "halo":
        m = re.search(r"-\s*([A-Z0-9/]+R?)\s*$", title)
        return m.group(1) if m else title
    return variant_title if variant_title and variant_title != "Default Title" else title


labels_path = os.path.join(CACHE, "labels.json")
labels = json.load(open(labels_path)) if os.path.exists(labels_path) else {}
catalog = {"generated": time.strftime("%Y-%m-%d"), "stores": [], "products": []}


def label_all(srcs):
    """Thumbnail and classify every image not yet in the label cache."""
    with cf.ThreadPoolExecutor(16) as ex:
        paths = dict(zip(srcs, ex.map(thumb, srcs)))
    todo = [s for s in srcs if s.split("?")[0] not in labels]
    chunks = [todo[i:i + 40] for i in range(0, len(todo), 40)]
    with cf.ThreadPoolExecutor(6) as ex:
        for chunk, res in zip(chunks, ex.map(lambda c: classify([paths[s] for s in c]), chunks)):
            for i, s in enumerate(chunk):
                if i in res:
                    labels[s.split("?")[0]] = res[i]
    json.dump(labels, open(labels_path, "w"))

for store in STORES:
    ps = [p for p in products(store) if keep(store, p)]
    catalog["stores"].append({"id": store["id"], "name": store["name"], "domain": store["domain"],
                              "products_kept": len(ps)})
    print(store["id"], "kept", len(ps), flush=True)
    label_all([im["src"] for p in ps for im in p["images"]])
    for p in ps:
        for v in p["variants"]:
            imgs = [{"src": im["src"].split("?")[0], "kind": labels.get(im["src"].split("?")[0], "other"),
                     "variant_ids": im.get("variant_ids", [])} for im in p["images"]]
            # Ellen Wille lists colours as variants with their own images; others are one shade per product.
            own = [im for im in imgs if v["id"] in im["variant_ids"]] or [im for im in imgs if not im["variant_ids"]] or imgs
            catalog["products"].append({
                "store": store["id"], "product_id": p["id"], "variant_id": v["id"], "handle": p["handle"],
                "title": p["title"], "type": p.get("product_type") or "", "shade": shade_of(store, p["title"], v.get("title")),
                "price": float(v["price"]), "available": bool(v.get("available", True)),
                "url": f"https://{store['domain']}/products/{p['handle']}",
                "cart_url": f"https://{store['domain']}/cart/{v['id']}:1",
                "swatch": next((im["src"] for im in own if im["kind"] == "swatch"), None),
                # When this colour has no on-model photo of its own (Ellen Wille lists colours as variants and
                # shoots the style once), the product's on-model photos show the style in another colour.
                "references": ([im["src"] for im in own if im["kind"] == "front"]
                               or [im["src"] for im in imgs if im["kind"] == "front"])[:4],
                "reference_in_this_shade": any(im["kind"] == "front" for im in own),
                "images": len(own),
            })

# Luxy photographs every shade on several people across its lines (Seamless, Classic, Halo, tape-ins).
# A shade's references include all of them, so a fill-in can be shown through any photo of a person
# wearing that exact shade, not only the few photos on the fill-in's own page.
LINES = r"\s+(Clip-Ins|Clip-In|Halo|Effortless|Thinning|Scalp|Fourth|Seamless|Classic|Ponytail|Ponytails|Tape|Sample|Fill-Ins|Hidden|Volume|Bundle|Set|Hair|Curtain|Bangs)\b"


def luxy_shade(title):
    t = re.sub(r"^\s*\d+\S*\s*", "", title)
    t = re.sub(r"^(Classic|Seamless)\s+", "", t)
    return re.split(LINES, t)[0].replace("Hair", "").strip().lower()


def dhash(src, size=16):
    im = Image.open(thumb(src)).convert("L").resize((size + 1, size))
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    return sum(1 << i for i in range(size * size) if px[(i // size) * (size + 1) + i % size] > px[(i // size) * (size + 1) + i % size + 1])


luxy_all = products(next(s for s in STORES if s["id"] == "luxy"))
label_all([im["src"] for p in luxy_all for im in p["images"]])
# Luxy reuses lifestyle photos across shades, so a photo filed under a shade may show someone wearing another.
# Only a person photo that appears (by perceptual hash) under exactly one shade is trusted as that shade.
fronts = [(luxy_shade(p["title"]), im["src"]) for p in luxy_all for im in p["images"] if labels.get(im["src"].split("?")[0]) == "front"]
groups = []  # [hash, set of shades, [srcs]]
for shade, src in fronts:
    h = dhash(src)
    for g in groups:
        if bin(g[0] ^ h).count("1") <= 6:
            g[1].add(shade)
            g[2].append(src)
            break
    else:
        groups.append([h, {shade}, [src]])
pool = {}
for h, shades, srcs in groups:
    if len(shades) == 1:
        shade = next(iter(shades))
        pool.setdefault(shade, [])
        for src in srcs:
            u = src.split("?")[0]
            if u not in pool[shade]:
                pool[shade].append(u)
print("luxy person photos", len(fronts), "trusted as one shade", sum(len(v) for v in pool.values()), flush=True)
for c in catalog["products"]:
    if c["store"] == "luxy":
        # A product's own page shares the same reused lifestyle photos, so only trusted photos are kept.
        c["references"] = pool.get(c["shade"].lower(), [])[:8]
        c["reference_in_this_shade"] = bool(c["references"])

json.dump(catalog, open(OUT, "w", encoding="utf-8"), indent=1)
ps = catalog["products"]
print("variants", len(ps), "with a usable reference", sum(1 for p in ps if p["references"]),
      "with a swatch", sum(1 for p in ps if p["swatch"]), flush=True)
