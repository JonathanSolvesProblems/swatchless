# Swatchless

A colour-match desk for hair retailers. The customer sends a selfie; the stylist sends back the customer wearing the
shade that matches, from the store's live catalogue, with a cart link.

Built for the [YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/) on
Perfect Corp's YouCam hair APIs.

## The desk at 9:40 on a Monday

Dana (a composite, not a real stylist) answers the "Text a Stylist" line at an online hair retailer. The message that
comes in most mornings reads about the same: a selfie, a photo of the top of the head, and "my part keeps getting
wider, which fill-ins match my colour?" The honest answer today is a $127.50 swatch ring in the post, a week of
waiting, and hair that cannot be returned once it has been worn.

Swatchless gives Dana a different answer in about two minutes. She drops both photos in. YouCam measures the
customer's hair density from the head-down photo and their hair length from the selfie. Claude reads the measurements,
looks at the selfie and the store's swatches, chooses the pieces worth trying, and has YouCam render each one on the
customer from the store's own product photo. It looks at every render, drops the ones that changed the face or missed
the shade, and hands Dana a shortlist with the customer wearing each pick, a cart link into the real store, and a
reply in her voice. Dana reads it, sends it from her own mail, and moves on to the next one.

## What the desk did for the demo customer

The customer on the home page is a composite: both photos are AI-generated, which the page says. Everything after
them is a live run. YouCam measured density at 2.28 (level 2, the part showing) and length at chest or longer.
Claude chose scalp fill-ins because of the density read, had YouCam render three Luxy Hair shades on the customer,
kept Off Black and Jet Black, and dropped Dark Brown. It added Ellen Wille's Espresso Mix topper without a preview,
and the page says why: every product photo the store lists for it shows a lighter shade, so a render would have shown
the wrong colour. Then it drafted the reply.

## Against Luxy's own stylists

Luxy Hair photographs real customers before they wear its hair and publishes the shade its stylists put on them. That
shade is the answer. The desk gets only Luxy's "before" photo, never sees that customer as a reference, and picks from
the 30 Luxy shades that have a trusted on-model photo.

All 18 customers ran. For 2 of them every trusted photo of their shade was a photo of them, so once those were
excluded the desk could not be offered it at all; those rows are reported as not offerable and counted on neither
side. Of the other 16, the right shade was on the desk's shortlist for 13 of 16, every one of the 16 customers was
shown wearing the desk's pick, and the first pick was the exact shade Luxy's stylists chose for 8 of 16. Picking at
random would land the first pick about one time in thirty. Most first-pick misses were the neighbouring shade:
Chestnut Brown for Neutral Brown, Dark Brown for Chocolate Brown.

The ablation ran the same 18 customers with YouCam switched off: the same model, photo and swatches, no YouCam tools.
Without YouCam, the right shade was on the shortlist for 12 of 16 and the desk showed 0 of 16 customers wearing
anything. The first pick matched 8 of 16 in both arms. Naming the shade is the model's job; YouCam is what puts that
shade on the customer before they buy hair they cannot return, measures the density that decides fill-ins versus
length, and gives the desk a render to reject when it changes the face.

The truth set, the exclusion rule and every run are committed in `data/benchmark/`. `scripts/check_claims.py` fails
the build if any number in this README or on the site disagrees with that data.

## Built on YouCam

Claude drives Perfect Corp's hosted YouCam MCP server directly, through the Anthropic MCP connector, with these tools
allowed:

| YouCam tool | What the desk uses it for |
|---|---|
| AI Hair Density Detection | four-level scalp-visibility read from the head-down photo; decides coverage pieces versus length |
| AI Hair Length Detection | length class from the selfie; decides 12" versus 20" |
| AI Hair Type Detection | texture, when the customer sends front, left and right photos |
| AI Hair Style Virtual Try-On (transfer) | renders a store product on the customer from the store's own on-model photo, in the product's colour or the customer's |
| AI Hair Color Virtual Try-On | re-colours a render to a store shade when the reference photo shows another colour |
| AI Hair Volume Virtual Try-On | volume pieces for customers at density 3 to 4 |

The demo run used density, length and three style try-ons. File upload and the unit balance go through the REST API
(`src/lib/youcam.ts`); every analysis and try-on is a tool call the model makes (`src/lib/agent.ts`).

## What the model decides, and where

- Which category fits the density read, which shades to try, and which of the store's photos to use as the reference:
  the tool loop in `src/lib/agent.ts`, with `show_palette`, `search_catalog` and `view_images` as its local tools.
- Whether a render is good enough, needs redoing in the customer's own colour, or is dropped: the model looks at every
  render through `view_images` before it may cite it.
- When to stop and ask for a better photo: `ask_for_photo`.

What the code decides, and the model cannot talk past (`src/lib/gate.ts`, nine tests):

- a cited render must be one YouCam returned in this consult
- a pick with no render must say why it is not shown
- the variant must exist in the store's feed and be in stock on the store's site right now
- at most three items

An out-of-stock pick is refused and goes on the watch list. A daily job (`/api/watch`) re-reads the store's live
stock and, when the piece is back, renders it on the customer again and drafts the follow-up (`src/lib/watch.ts`).

## The stores

Luxy Hair, Halo Couture and Ellen Wille, read from their public Shopify product feeds by `scripts/ingest.py`: 973
fill-ins, toppers, hairpieces and headcovers in 230 shades, with every product photo classified once so the agent is
only ever offered front-facing photos the try-on can use. Luxy reuses lifestyle photos across shades, so a photo
counts for a shade only when it appears under exactly one. Swatchless is not affiliated with any of the stores.

## Limits, stated where they apply

- A render shows the finished look, not how a piece clips in or how much of the part it hides. The site says this
  under every shortlist and the reply says it to the customer.
- Density needs a head-down photo and hair type needs three photos; without them the desk says what it could not
  measure rather than guessing.
- YouCam's render URLs expire after two hours, so each consult keeps its own copies.
- Eighteen customers is a small benchmark, and the answer is one stylist team's choice, not the only right shade. A
  one-customer difference between the two arms is within what a sample this size can move by chance.

## Running it

```
pnpm install
cp .env.example .env.local   # YouCam key, an Anthropic API key for the app, CONSULT_DIR
python -I scripts/ingest.py  # rebuilds data/catalog.json from the stores' feeds (needs the Anthropic key for photo classification)
pnpm dev
pnpm test && pnpm check      # gate and catalogue tests; every stated number against the data
```

`scripts/consult.ts` runs one consult from the command line; `scripts/benchmark.ts` runs the Luxy benchmark, both arms.

Built by Jonathan Andrei. More at [jonathansolvesproblems.com](https://jonathansolvesproblems.com).
