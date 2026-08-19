# Gut Check

Photograph a food or grocery item. The Bureau of Consumable Goods Integrity
(this app) identifies it with Claude vision, checks the item against all
**active** FDA and USDA recall notices, and stamps a verdict.

The UI is themed as 1980s government material: a propaganda-poster landing
page, a manila case file, a CRT recall-wire terminal, and a rubber-stamp
verdict.

## How it works

1. The browser downscales your photo and sends it to `POST /api/investigate`.
2. The route streams the investigation as Server-Sent Events:
   - **Identify** — Claude Opus 5 (`claude-opus-5`, with a server-side
     fallback to Opus 4.8) reads the label and returns structured data:
     brand, product, category, search terms.
   - **Search** — the server queries the
     [openFDA food enforcement API](https://open.fda.gov/apis/food/enforcement/)
     (status `Ongoing`) and the
     [USDA FSIS recall API](https://www.fsis.usda.gov/science-data/developer-resources/recall-api)
     (active notices) in parallel.
   - **Adjudicate** — Claude reads the candidate records and returns a
     structured verdict: `CLEAR`, `RECALLED`, `POSSIBLE_MATCH`, or
     `INCONCLUSIVE`, with reasoning, guidance, and matched notices.
3. The case file shows the live feed, then the stamp. You can download the
   verdict as a "press release" PNG.

## Run it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. If you are logged in with `ant auth login`, the
API key variable is not necessary.

## Honest limits

- Recalls are usually limited to specific lots and dates. A photo cannot
  prove your unit is affected, so `RECALLED` and `POSSIBLE_MATCH` verdicts
  tell you what to check on the package.
- The verdict is AI-assisted and can be wrong or incomplete. Always verify at
  [fda.gov/safety/recalls](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts)
  and [fsis.usda.gov/recalls](https://www.fsis.usda.gov/recalls).
- Photos are processed in memory and are not stored.
