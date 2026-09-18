# SkyboxTime Worlds Repro

Minimal Decentraland SDK7 scene demonstrating that the `SkyboxTime`
component is silently non-functional when deployed to a Decentraland
**World**, while the identical code works correctly in local Creator Hub
preview.

See [`docs/bug-report.md`](docs/bug-report.md) for the full write-up
with evidence screenshots.

## Headline finding

On Worlds:

1. `SkyboxTime.fixedTime` values are discarded. Every write is accepted
   (`SkyboxTime.has(RootEntity) === true`) but the sky and
   `getWorldTime()` ignore them entirely.
2. Presence of `SkyboxTime` on RootEntity **does not** disable the
   client-side NIGHT/DAY panel — the player's slider stays fully
   interactive, contrary to the SDK docs and preview behaviour.

In local preview both work exactly as documented.

## Live comparison

- **Worlds (broken):** https://play.decentraland.org/?NETWORK=mainnet&position=0,0&realm=baskervill.dcl.eth
- **Preview (working):** `npm install && npm start`

Load both side-by-side. In preview the sun sweeps a full 24 h cycle
every real minute; on Worlds it sits frozen while the on-screen HUD
shows 10 Hz writes landing.

## Run locally

```bash
npm install
npm start
```

## Modes

Toggle `MODE` at the top of `src/index.ts`:

| Mode | Description |
|---|---|
| `'cycle'` (default) | 10 Hz writes driving a full 24 h sweep every 60 s |
| `'single'` | One write of `fixedTime=21600` (06:00) at scene start |
| `'continuous'` | 10 Hz writes of a constant `fixedTime=21600` |

## On-screen HUD

Top-center panel shows live diagnostics:

- `RUNTIME` — `getWorldTime().seconds`
- `WRITTEN` — last `fixedTime` the scene wrote
- `DELTA` — RUNTIME − WRITTEN
- `LOCKED` — `SkyboxTime.has(RootEntity)`
- `WRITES/s`, `TOTAL W`, `TICK`, `TRANS` — diagnostics

Screenshot both HUD and the client NIGHT/DAY panel side by side for a
one-glance repro.

## SDK version

`@dcl/sdk@7.26.1-32860802198.commit-dae48fb` (pinned exact).
