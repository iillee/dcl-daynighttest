/**
 * SkyboxTime Worlds bug repro — minimal scene.
 *
 * Drives a continuous day/night cycle via SkyboxTime on engine.RootEntity
 * and exposes live diagnostics via both console logs and an on-screen HUD
 * (see src/ui.tsx) so the divergence between the value written and the
 * value the runtime reports is visible at a glance.
 *
 * Expected in local Creator Hub preview:
 *   Sun visibly sweeps a full 24 h cycle every CYCLE_REAL_SECONDS.
 *   HUD "WRITTEN" advances in step with the visible sun.
 *
 * Actual on Worlds (snowdrift.dcl.eth, tested 2026-09-17):
 *   Sun frozen at DCL default (mid-day blue), does not move.
 *   HUD LOCKED=yes (component IS present) but the sky ignores every write.
 *
 * Toggle MODE below to isolate single-write vs. continuous-write behaviour.
 */

import {
	engine,
	executeTask,
	SkyboxTime,
	TransitionMode,
	Transform,
	MeshRenderer,
	Material,
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { getWorldTime }    from '~system/Runtime'

import { setupUi }         from './ui'


// MARK: Config

/**
 * Which repro variant to run:
 *   'cycle'      — 10 Hz writes driving a full 24 h sweep every
 *                  CYCLE_REAL_SECONDS. Most visually convincing.
 *   'single'     — write fixedTime ONCE at scene start, never again.
 *                  Isolates whether a single write is honoured.
 *   'continuous' — 10 Hz writes of a CONSTANT fixedTime (dawn).
 *                  Isolates whether write cadence matters when the
 *                  value doesn't change.
 */
export const MODE: 'cycle' | 'single' | 'continuous' = 'cycle'

/** Real-world seconds for one full 24 h skybox sweep in 'cycle' mode. */
export const CYCLE_REAL_SECONDS = 60

/** Fixed target for 'single' and 'continuous' modes: 06:00 dawn. */
const FIXED_DAWN_S = 21600

/** Write cadence for 'cycle' and 'continuous' modes. */
const WRITE_INTERVAL_S = 0.1  // 10 Hz


// MARK: Diagnostic state
// Read by src/ui.tsx to render the HUD. Do not mutate from outside.

let lastWrittenS      : number | null        = null
let lastWrittenMode   : TransitionMode | null = null
let writeCount        : number                = 0
let lastRuntimeS      : number | null        = null
let lastSampleTick    : number                = 0
let lastWritesPerSec  : number                = 0

/** Latest fixedTime we wrote to SkyboxTime, or null before first write. */
export function getLastWritten(): number | null { return lastWrittenS }
/** Latest transitionMode we wrote, or null before first write. */
export function getLastMode(): TransitionMode | null { return lastWrittenMode }
/** Total SkyboxTime writes since scene load. */
export function getWriteCount(): number { return writeCount }
/** Last getWorldTime() sample in seconds, or null before first sample. */
export function getLastRuntime(): number | null { return lastRuntimeS }
/** Monotonic sample counter, increments once per second. */
export function getSampleTick(): number { return lastSampleTick }
/** Writes/sec averaged across the last 1s sample window. */
export function getWritesPerSec(): number { return lastWritesPerSec }
/** Whether SkyboxTime currently exists on RootEntity. */
export function getLocked(): boolean { return SkyboxTime.has(engine.RootEntity) }


// MARK: currentCycleSeconds

/**
 * Deterministic phase-based skybox time for 'cycle' mode. Anchored to
 * a fixed wall-clock so all viewers see the same phase.
 */
function currentCycleSeconds(): number {
	const cycleMs = CYCLE_REAL_SECONDS * 1000
	const anchor  = Date.UTC(2026, 0, 1, 0, 0, 0)
	const phase   = (((Date.now() - anchor) % cycleMs) + cycleMs) % cycleMs / cycleMs
	return phase * 86400
}


// MARK: writeSkybox

/**
 * Write SkyboxTime to RootEntity and update diagnostic state.
 */
function writeSkybox(
	fixedTime: number,
	mode     : TransitionMode,
): void {
	SkyboxTime.createOrReplace(engine.RootEntity, {
		fixedTime     : fixedTime,
		transitionMode: mode,
	})
	lastWrittenS    = fixedTime
	lastWrittenMode = mode
	writeCount     += 1
}


// MARK: main

export function main(): void {
	setupUi()

	// Visual anchor so testers know the scene loaded.
	const cube = engine.addEntity()
	Transform.create(cube, { position: Vector3.create(8, 1, 8) })
	MeshRenderer.setBox(cube)
	Material.setPbrMaterial(cube, { albedoColor: Color4.Red() })

	// MARK: single mode
	if (MODE === 'single') {
		writeSkybox(FIXED_DAWN_S, TransitionMode.TM_FORWARD)
		console.log(`skyboxRepro: MODE=single wrote fixedTime=${FIXED_DAWN_S} once`)
	}

	// MARK: continuous mode
	if (MODE === 'continuous') {
		let writeAcc = 0
		engine.addSystem((dt: number) => {
			writeAcc += dt
			if (writeAcc < WRITE_INTERVAL_S) return
			writeAcc = 0
			writeSkybox(FIXED_DAWN_S, TransitionMode.TM_FORWARD)
		})
		console.log(`skyboxRepro: MODE=continuous writing fixedTime=${FIXED_DAWN_S} @ 10 Hz`)
	}

	// MARK: cycle mode
	if (MODE === 'cycle') {
		let writeAcc = 0
		let prev     = currentCycleSeconds()
		engine.addSystem((dt: number) => {
			writeAcc += dt
			if (writeAcc < WRITE_INTERVAL_S) return
			writeAcc = 0

			const t = currentCycleSeconds()

			// Shortest modular path so the midnight wrap doesn't race
			// the sun forward through a whole day.
			const forwardDist  = ((t - prev) % 86400 + 86400) % 86400
			const backwardDist = 86400 - forwardDist
			const mode = forwardDist <= backwardDist
				? TransitionMode.TM_FORWARD
				: TransitionMode.TM_BACKWARD

			writeSkybox(t, mode)
			prev = t
		})
		console.log(
			`skyboxRepro: MODE=cycle sweeping full 24 h every ${CYCLE_REAL_SECONDS}s ` +
			`(writes @ 10 Hz, shortest-path transitionMode)`
		)
	}

	// MARK: 1 Hz sampler + logger
	let logAcc          = 0
	let prevWriteCount  = 0
	let prevSampleMs    = Date.now()

	engine.addSystem((dt: number) => {
		logAcc += dt
		if (logAcc < 1) return
		logAcc = 0

		const nowMs      = Date.now()
		const intervalMs = Math.max(1, nowMs - prevSampleMs)
		lastWritesPerSec = ((writeCount - prevWriteCount) * 1000) / intervalMs
		prevWriteCount   = writeCount
		prevSampleMs     = nowMs
		lastSampleTick  += 1

		executeTask(async () => {
			try {
				const t = await getWorldTime({})
				lastRuntimeS = t.seconds
			} catch (err) {
				console.log(`skyboxRepro: getWorldTime failed: ${err}`)
				lastRuntimeS = null
			}

			console.log(
				`skyboxRepro: MODE=${MODE} ` +
				`RUNTIME=${lastRuntimeS === null ? 'null' : lastRuntimeS.toFixed(1)} ` +
				`WRITTEN=${lastWrittenS === null ? 'null' : lastWrittenS.toFixed(1)} ` +
				`LOCKED=${getLocked()} ` +
				`WPS=${lastWritesPerSec.toFixed(2)}`
			)
		})
	})
}
