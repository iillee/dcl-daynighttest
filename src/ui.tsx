/**
 * ui.tsx — on-screen HUD for the SkyboxTime bug repro.
 *
 * Shows the live divergence between the fixedTime we WROTE and the
 * value getWorldTime() reports, plus the LOCKED flag and write rate.
 *
 * Positioned top-left as a compact panel. Zero external UI dependencies
 * so the repro scene stays minimal for the Foundation devs to read.
 */

import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { TransitionMode }                       from '@dcl/sdk/ecs'

import {
	CYCLE_REAL_SECONDS,
	getLastMode,
	getLastRuntime,
	getLastWritten,
	getLocked,
	getSampleTick,
	getWriteCount,
	getWritesPerSec,
	MODE,
} from './index'


// MARK: Layout constants
const ROW_HEIGHT  = 18
const LABEL_WIDTH = 90
const VALUE_WIDTH = 210
const PANEL_WIDTH = LABEL_WIDTH + VALUE_WIDTH + 16

const COL_LABEL   = { r: 0.65, g: 0.65, b: 0.70, a: 1 }
const COL_VALUE   = { r: 0.95, g: 0.95, b: 0.95, a: 1 }
const COL_OK      = { r: 0.55, g: 0.95, b: 0.55, a: 1 }
const COL_WARN    = { r: 1.00, g: 0.80, b: 0.35, a: 1 }
const COL_BAD     = { r: 1.00, g: 0.45, b: 0.45, a: 1 }
const COL_FWD     = { r: 0.55, g: 0.85, b: 0.95, a: 1 }
const COL_BWD     = { r: 0.95, g: 0.65, b: 0.95, a: 1 }
const COL_MUTED   = { r: 0.65, g: 0.65, b: 0.70, a: 1 }
const COL_BG      = { r: 0.05, g: 0.06, b: 0.08, a: 0.85 }


// MARK: formatSeconds

/**
 * Format a 0..86400 skybox-seconds value as HH:MM:SS. Returns
 * "--:--:--" for null / non-finite.
 */
function formatSeconds(sec: number | null): string {
	if (sec === null || !isFinite(sec)) return '--:--:--'
	const s   = ((sec % 86400) + 86400) % 86400
	const h   = Math.floor(s / 3600)
	const m   = Math.floor((s % 3600) / 60)
	const ss  = Math.floor(s % 60)
	const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
	return `${pad(h)}:${pad(m)}:${pad(ss)}`
}


// MARK: HUD

const HUD = () => {
	const runtime = getLastRuntime()
	const written = getLastWritten()
	const mode    = getLastMode()
	const locked  = getLocked()
	const wps     = getWritesPerSec()
	const tick    = getSampleTick()
	const writes  = getWriteCount()

	// Delta between what we wrote and what the runtime reports.
	const delta =
		runtime !== null && written !== null
			? runtime - written
			: null

	const deltaStr =
		delta === null
			? '\u2014'
			: (delta >= 0 ? '+' : '') + delta.toFixed(1) + 's'

	const deltaAbs   = delta === null ? 0 : Math.abs(delta)
	const deltaColor =
		delta    === null ? COL_MUTED :
		deltaAbs <  2     ? COL_OK    :
		deltaAbs <  30    ? COL_WARN  :
		                    COL_BAD

	const lockedColor = locked ? COL_OK : COL_BAD

	const modeStr =
		mode === null                      ? '\u2014' :
		mode === TransitionMode.TM_FORWARD ? 'FWD'    :
		                                     'BWD'
	const modeColor =
		mode === null                      ? COL_MUTED :
		mode === TransitionMode.TM_FORWARD ? COL_FWD   :
		                                     COL_BWD

	const cycleStr = MODE === 'cycle'
		? `${(CYCLE_REAL_SECONDS / 60).toFixed(1)}m sweep`
		: MODE

	return (
		<UiEntity
			uiTransform = {{
				width        : '100%',
				positionType : 'absolute',
				position     : { top: 8, left: 0 },
				flexDirection: 'row',
				justifyContent: 'center',
				pointerFilter: 'none',
			}}
		>
		<UiEntity
			uiTransform = {{
				width        : PANEL_WIDTH,
				padding      : 8,
				flexDirection: 'column',
			}}
			uiBackground = {{ color: COL_BG }}
		>
			<Row label = "MODE"     value = {cycleStr} />
			<Row label = "RUNTIME"  value = {formatSeconds(runtime)} />
			<Row label = "WRITTEN"  value = {formatSeconds(written)} />
			<Row label = "DELTA"    value = {deltaStr}          valueColor = {deltaColor} />
			<Row label = "TRANS"    value = {modeStr}           valueColor = {modeColor} />
			<Row label = "WRITES/s" value = {wps.toFixed(2)} />
			<Row label = "TOTAL W"  value = {`${writes}`} />
			<Row label = "LOCKED"   value = {locked ? 'yes' : 'NO'}  valueColor = {lockedColor} />
			<Row label = "TICK"     value = {`${tick}`} />
		</UiEntity>
		</UiEntity>
	)
}


// MARK: Row

interface RowProps {
	label      : string
	value      : string
	valueColor?: { r: number, g: number, b: number, a: number }
}

const Row = ({ label, value, valueColor }: RowProps) => (
	<UiEntity
		uiTransform = {{
			width        : '100%',
			height       : ROW_HEIGHT,
			flexDirection: 'row',
			alignItems   : 'center',
		}}
	>
		<UiEntity
			uiTransform = {{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
			uiText      = {{
				value    : label,
				fontSize : 12,
				color    : COL_LABEL,
				textAlign: 'middle-left',
			}}
		/>
		<UiEntity
			uiTransform = {{ width: VALUE_WIDTH, height: ROW_HEIGHT }}
			uiText      = {{
				value    : value,
				fontSize : 12,
				color    : valueColor ?? COL_VALUE,
				textAlign: 'middle-right',
			}}
		/>
	</UiEntity>
)


// MARK: setupUi

/**
 * Register the HUD renderer with the React-ECS runtime. Call once
 * from main().
 */
export function setupUi(): void {
	ReactEcsRenderer.setUiRenderer(HUD)
	console.log('skyboxRepro: setupUi: HUD registered')
}
