"""Fail when the prose and the data disagree.

Recomputes every number Swatchless states in public from the committed data, then checks each document:
  - every "N of M customers" sentence matches the benchmark results for the arm it names
  - every catalogue count ("973 pieces", "230 shades") matches data/catalog.json
  - no retired claim reappears

Run: python -I scripts/check_claims.py            (exit 1 on any mismatch)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = ["README.md", "docs/SUBMISSION.md", "docs/gallery/captions.md", "src/app/hero.tsx", "src/app/benchmark/page.tsx", "scripts/preview.py"]
RETIRED = [
    r"perfect match",
    r"guarantee",
    r"YouCam picks? the shade",          # the shade call is Claude's; YouCam measures and renders
    r"beats? (?:Claude|the stylists)",
]


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


def facts():
    cat = load("data/catalog.json")
    usable = [p for p in cat["products"] if p["references"]]
    out = {
        "pieces": len(usable),
        "shades": len({(p["store"], p["shade"]) for p in usable}),
        "luxy_shades": len({p["shade"].strip().lower() for p in usable if p["store"] == "luxy"}),
    }
    path = os.path.join(ROOT, "data/benchmark/results.json")
    if os.path.exists(path):
        rows = load("data/benchmark/results.json")
        for arm in ("full", "no_youcam"):
            out[f"{arm}_ran"] = sum(1 for x in rows if x["arm"] == arm)
            out[f"{arm}_impossible"] = sum(1 for x in rows if x["arm"] == arm and not x.get("shade_offerable", True))
            r = [x for x in rows if x["arm"] == arm and x.get("shade_offerable", True)]
            out[f"{arm}_n"] = len(r)
            out[f"{arm}_top1"] = sum(1 for x in r if x["top1"])
            out[f"{arm}_shortlist"] = sum(1 for x in r if x["in_shortlist"])
            out[f"{arm}_abstained"] = sum(1 for x in r if x["status"] != "recommended")
            out[f"{arm}_rendered"] = sum(1 for x in r if x.get("tryons", 0) > 0)
    return out


def main():
    f = facts()
    problems = []
    for rel in DOCS:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        text = open(p, encoding="utf-8").read()
        for pat in RETIRED:
            for m in re.finditer(pat, text, re.I):
                problems.append(f"{rel}: retired claim '{m.group(0)}'")
        for m in re.finditer(r"([\d,]+) pieces", text):
            if int(m.group(1).replace(",", "")) != f["pieces"]:
                problems.append(f"{rel}: says {m.group(1)} pieces, catalogue has {f['pieces']}")
        for m in re.finditer(r"(\d+) shades", text):
            n = int(m.group(1))
            if n not in (f["shades"], f["luxy_shades"]):
                problems.append(f"{rel}: says {n} shades, catalogue has {f['shades']} (Luxy: {f['luxy_shades']})")
        # "N of 18" style claims next to the arm they describe
        for m in re.finditer(r"(\d+) of (\d+)", text):
            n, total = int(m.group(1)), int(m.group(2))
            if "full_n" not in f or total not in (f.get("full_n"), f.get("full_ran")):
                continue
            # The arm is named somewhere in the same sentence, before or after the figure.
            sentence = text[text.rfind(".", 0, m.start()) + 1 : text.find(".", m.end()) + 1].lower()
            arm = "no_youcam" if ("alone" in sentence or "without youcam" in sentence or "no youcam" in sentence) else "full"
            allowed = {f[f"{arm}_top1"], f[f"{arm}_shortlist"], f[f"{arm}_rendered"], f[f"{arm}_abstained"], f[f"{arm}_n"], f[f"{arm}_impossible"]}
            if n not in allowed:
                problems.append(f"{rel}: '{m.group(0).strip()}' does not match results ({arm}: {sorted(allowed)})")
    print(json.dumps(f, indent=1))
    if problems:
        print("\nMISMATCHES")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print("\nAll stated numbers match the data.")


if __name__ == "__main__":
    main()
