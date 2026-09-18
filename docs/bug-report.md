# SkyboxTime is ignored on Decentraland Worlds

**Status:** open, reproducible
**Severity:** blocks any scene needing a runtime-controlled sky on Worlds
**Environment:**

| Field | Value |
|---|---|
| SDK | `@dcl/sdk@7.26.1-32860802198.commit-dae48fb` (pinned exact) |
| Deploy target | Decentraland World (`baskervill.dcl.eth`) |
| Content server | `https://worlds-content-server.decentraland.org` |
| Local preview | Creator Hub bundled preview |
| Reproduced on | 2026-09-18 |
| Repro repo | https://github.com/iillee/dcl-daynighttest |

---

## Summary

On Decentraland **Worlds**, the `SkyboxTime` component on `engine.RootEntity` is silently non-functional in two distinct ways. The **identical code** works correctly in local Creator Hub preview.

1. **Bug A — `fixedTime` value is discarded.** Every `SkyboxTime.createOrReplace(...)` call is accepted at the ECS level (`SkyboxTime.has(RootEntity)` returns `true`), but the World runtime clock and the visible sky both ignore the value entirely and continue to run on DCL's default ~2 h per 24 h skybox cycle.
2. **Bug B — presence does not defeat the client-side NIGHT/DAY UI.** Per SDK docs and preview behaviour, the mere presence of `SkyboxTime` on RootEntity should disable the player's client-side day/night slider. On Worlds the panel remains fully interactive in both **Auto** and **Manual** modes.

Net effect: on Worlds today it is impossible to implement a runtime day/night cycle, seasonal drift, solstice event, or any other scene-controlled sky effect through the documented `SkyboxTime` API. `scene.json > skyboxConfig.fixedTime` (the static, deploy-time equivalent) still works but is not runtime-controllable.

---

## Reproduction

Full repro scene: https://github.com/iillee/dcl-daynighttest

Minimal code (`src/index.ts`, cycle mode):

```ts
import { engine, SkyboxTime, TransitionMode, executeTask } from '@dcl/sdk/ecs'
import { getWorldTime } from '~system/Runtime'

const CYCLE_REAL_SECONDS = 60  // one 24 h sweep every real minute

export function main() {
	// Drive a continuous 24 h sweep, writing at 10 Hz.
	let prev = 0
	engine.addSystem(() => {
		const cycleMs = CYCLE_REAL_SECONDS * 1000
		const anchor  = Date.UTC(2026, 0, 1)
		const phase   = (((Date.now() - anchor) % cycleMs) + cycleMs) % cycleMs / cycleMs
		const t       = phase * 86400

		// Shortest modular path so the midnight wrap doesn't race forward.
		const fwd = ((t - prev) % 86400 + 86400) % 86400
		const mode = fwd <= 86400 - fwd ? TransitionMode.TM_FORWARD : TransitionMode.TM_BACKWARD

		SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: t, transitionMode: mode })
		prev = t
	})

	// Log runtime state every second for observability.
	let acc = 0
	engine.addSystem((dt: number) => {
		acc += dt; if (acc < 1) return; acc = 0
		executeTask(async () => {
			const rt = await getWorldTime({})
			console.log(`RUNTIME=${rt.seconds.toFixed(1)} LOCKED=${SkyboxTime.has(engine.RootEntity)}`)
		})
	})
}
```

Ensure `scene.json > skyboxConfig` is empty (`"skyboxConfig": {}`) so the component is the only mechanism under test.

### Local preview (Creator Hub)

- Sun visibly sweeps a full 24 h cycle every real minute. ✅
- Client-side NIGHT/DAY panel is disabled (grayed out). ✅
- `RUNTIME` value tracks `WRITTEN` with a small (~seconds) engine-interp lag. ✅

### Worlds deploy (`baskervill.dcl.eth`)

- Sun does **not** move — it renders whatever the client-side NIGHT/DAY panel is showing. ❌
- Client-side NIGHT/DAY panel is **fully interactive** in both Auto and Manual mode. ❌
- Console shows `LOCKED=true` (component present) and `WRITES/s ≈ 10`, but `RUNTIME` drifts on DCL's default 2 h cycle rate, completely unrelated to `WRITTEN`. ❌
- In Auto mode, moving the client slider temporarily changes the sky, then it snaps back to the runtime clock value — so our 10 Hz writes are being rendered momentarily on Worlds too, but immediately overridden. Visible as flicker on the client UI.

---

## Evidence

`assets/images/screenshot01.png` — Worlds, ~10 minutes after scene load:

- HUD: `WRITTEN=14:26:29`, `RUNTIME=09:58:36`, `LOCKED=yes`, `WRITES/s=9.69`, `TOTAL W=781`.
- Client NIGHT/DAY panel: **openable and interactive**, `Auto=OFF`, `Custom=09:58` (matches RUNTIME, not WRITTEN).
- Sun visibly at ~10 AM position (matches RUNTIME).

`assets/images/screenshot02.png` — Worlds, ~10 minutes later:

- HUD: `WRITTEN=20:59:34`, `RUNTIME=12:10:26`, `LOCKED=yes`, `WRITES/s=9.64`, `TOTAL W=3082`.
- Client NIGHT/DAY panel: **still openable and interactive**, `Auto=ON`.
- `RUNTIME` advanced 09:58 → 12:10 across ~10 real minutes = ~2 h skybox per 10 min real = DCL default 2 h per 24 h cycle. Confirms the World runtime is running its own default clock and completely ignoring the scene's writes.

---

## Additional verification

We also tested:

1. **Single write at scene start** (`SkyboxTime.createOrReplace` once, no tick loop) — value ignored on Worlds. `SkyboxTime.has(RootEntity)` still returns `true`, client UI stays interactive, sky does not lock. See `assets/images/screenshot03.png`.
2. **Continuous 10 Hz writes of a constant `fixedTime`** — same result on Worlds (ignored) as continuous cycling writes.
3. **`scene.json > skyboxConfig.fixedTime` alone (no component)** — works on both preview and Worlds. Sky locks to the JSON value, client UI defeated.
4. **JSON `fixedTime` present AND component writes at 10 Hz — the definitive test.** We deployed with `scene.json > skyboxConfig.fixedTime = 0` (midnight) and simultaneously wrote `SkyboxTime.createOrReplace(fixedTime: 21600)` (06:00 dawn) once at scene load. If the component were doing anything on Worlds, the sky would render dawn. Instead, sky renders **midnight** and the client UI is locked to `00:00`. `SkyboxTime.has(RootEntity)` still returns `true`. See `assets/images/screenshot04.png`. **The JSON value overrides the component value in a way that proves the component's `fixedTime` is being fully discarded, not merged.**

So the failure is specifically the runtime `SkyboxTime` component being non-functional in the Worlds runtime. The static JSON path still works.

---

## Impact

Blocks any Worlds scene that wants:

- A runtime day/night cycle at a cadence different from DCL's default 2 h.
- Independently tunable day / night durations.
- Seasonal skybox drift (e.g. autumn → winter solstice → spring lighting).
- Story-pacing sky changes (dawn as game climax, forced night for a puzzle, etc.).
- Sky reactivity to gameplay events.

More broadly, any scene that uses `SkyboxTime` for atmosphere or gameplay lighting is silently broken when deployed to Worlds. The failure is silent because the component write reports success, `LOCKED` reads true, and there is no error surface anywhere.

---

## Empirical characterisations (bonus)

While isolating this bug we also noted the following, in case any are actual bugs vs. intentional-but-undocumented behaviour:

1. **`transitionMode` default `TM_FORWARD` interprets any decrease in `fixedTime` as "advance forward N hours"** and races through the whole clock. Callers must set `TM_BACKWARD` when writing a smaller value than the current, and pick shortest-modular-path around the midnight seam. A `TM_AUTO_SHORTEST` mode or auto-detection would remove a common footgun.
2. **`SkyboxTime.has(RootEntity)` is `false` when the sky is locked via `scene.json > skyboxConfig.fixedTime`.** The two lock mechanisms are not equivalent in observability. Consider surfacing the JSON lock as a phantom component so scene code can uniformly ask "is the sky currently locked?".
3. **`getWorldTime()` has a smooth-transition lag of several seconds** behind the last-written `fixedTime` value in preview. `getWorldTime()` is not a reliable readback for "what fixedTime is currently applied" — the visible sky is the source of truth. Documenting this expected lag would prevent future scenes from misusing it as a diagnostic.
4. **On Worlds, momentary sky flicker during our 10 Hz writes** suggests writes ARE reaching the renderer briefly before being overridden by the World runtime clock. Whatever component is winning the "who owns the sky?" arbitration on Worlds does not exist in preview.

---

## What we'd like

1. Confirmation that Bugs A and B are Worlds runtime bugs and a target fix version.
2. Guidance on any workaround short of a Foundation-side fix. We currently plan to fall back to a static `scene.json > skyboxConfig.fixedTime` and defer any runtime sky work.
3. Long-shot: any preview of upcoming custom-skybox APIs (cubemap texture upload, tint control, sun/moon direction override).

---

## Contact

- Repro repo: https://github.com/iillee/dcl-daynighttest
- Live World: https://play.decentraland.org/?NETWORK=mainnet&position=0,0&realm=baskervill.dcl.eth
- Deploy wallet: `0x1e93e534c5e26b01ed242410b43ae23dd0faa52b`
