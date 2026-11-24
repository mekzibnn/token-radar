# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mekzibnn/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mekzibnn/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks protocols that do not have a token yet by the implied value of a hypothetical launch, and tells a reader how to farm each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty.

## How the value model works

The model in lib/model.ts reads only the sealed snapshot at /input/snapshot.json (758 DefiLlama protocols). For every pre-token protocol (no market cap, no CoinGecko id, no symbol) it computes implied_value_usd from the snapshot's own figures:

1. **Base:** log-scaled TVL, the dominant driver.
2. **Growth:** change_7d applied as a damped multiplier (positive growth lifts, negative growth cuts, both bounded).
3. **Longevity:** how long the protocol has run with no token (listed_at), capped so old-but-flat protocols do not dominate.
4. **Category adjustment:** median TVL of the protocol's category, so a lending protocol is measured against lending peers, not against an exchange.
5. The final figure is rounded to whole dollars. Ranks are assigned by that figure, descending; live-token protocols are kept in a separate Live token view with their market values, never mixed into the board.

No protocol name is hardcoded anywhere: the board is derived from the snapshot alone.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22 or later. It writes out/board.json (the ranked board), out/data.js (the dashboard data), copies dashboard/ and screenshots/, and writes out/dossier.json with the vendored makefun buildDossier. Open out/dashboard/index.html from disk after a run to read the radar offline.

## Dashboard

Dark fintech design, no framework, no network. Sortable board with text search, category and chain filters and a filtered-view state; a detail view per protocol showing the model breakdown, a TVL bar and its farm plan with costs and durations.

## Limits

The board is a claim about the snapshot, not a prediction of launches. Values are the model's own estimates. The snapshot is one point in time; figures age.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1cytnb2s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
