// @ts-expect-error suncalc ships without bundled types
import SunCalc from 'suncalc';

const RAD = 180 / Math.PI;

export type LatLng = { lat: number; lng: number };

export function radToDeg(rad: number): number {
	return rad * RAD;
}

export function formatDegrees(value: number, decimals = 1): string {
	return `${value.toFixed(decimals)}°`;
}

export function formatTime(date: Date | undefined, locale = undefined): string {
	if (!date || Number.isNaN(date.getTime())) return '—';
	return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '—';
	const totalMinutes = Math.round(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
}

export function getSunSnapshot(date: Date, { lat, lng }: LatLng) {
	const position = SunCalc.getPosition(date, lat, lng);
	const times = SunCalc.getTimes(date, lat, lng);
	const altitude = radToDeg(position.altitude);
	const azimuth = sunCalcAzimuthToCompass(position.azimuth);

	const dayLength =
		times.sunset && times.sunrise
			? times.sunset.getTime() - times.sunrise.getTime()
			: Number.NaN;

	return {
		altitude,
		azimuth,
		times: {
			sunrise: times.sunrise,
			solarNoon: times.solarNoon,
			sunset: times.sunset,
			dawn: times.dawn,
			dusk: times.dusk,
			goldenHourEnd: times.goldenHourEnd,
			goldenHour: times.goldenHour,
		},
		dayLength,
		isUp: altitude > 0,
	};
}

export function getMoonSnapshot(date: Date, { lat, lng }: LatLng) {
	const position = SunCalc.getMoonPosition(date, lat, lng);
	const times = SunCalc.getMoonTimes(date, lat, lng);
	const illumination = SunCalc.getMoonIllumination(date);

	const altitude = radToDeg(position.altitude);
	const azimuth = sunCalcAzimuthToCompass(position.azimuth);
	const phaseName = moonPhaseName(illumination.phase);

	return {
		altitude,
		azimuth,
		distanceKm: Math.round(position.distance),
		illumination: {
			fraction: illumination.fraction,
			phase: illumination.phase,
			phaseName,
			percent: Math.round(illumination.fraction * 100),
		},
		times: {
			rise: times.rise,
			set: times.set,
			alwaysUp: times.alwaysUp,
			alwaysDown: times.alwaysDown,
		},
		isUp: altitude > 0,
	};
}

/** SunCalc azimuth is radians from south → west; convert to compass degrees from north. */
function sunCalcAzimuthToCompass(azimuthRad: number): number {
	return ((radToDeg(azimuthRad) + 180) % 360 + 360) % 360;
}

function moonPhaseName(phase: number): string {
	// phase: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter
	if (phase < 0.03 || phase > 0.97) return 'New Moon';
	if (phase < 0.22) return 'Waxing Crescent';
	if (phase < 0.28) return 'First Quarter';
	if (phase < 0.47) return 'Waxing Gibbous';
	if (phase < 0.53) return 'Full Moon';
	if (phase < 0.72) return 'Waning Gibbous';
	if (phase < 0.78) return 'Last Quarter';
	return 'Waning Crescent';
}

export function getDirectionText(azimuth: number): string {
	const points = [
		{ label: 'North', angle: 0 },
		{ label: 'Northeast', angle: 45 },
		{ label: 'East', angle: 90 },
		{ label: 'Southeast', angle: 135 },
		{ label: 'South', angle: 180 },
		{ label: 'Southwest', angle: 225 },
		{ label: 'West', angle: 270 },
		{ label: 'Northwest', angle: 315 }
	];
	
	const norm = ((azimuth % 360) + 360) % 360;
	
	let minDiff = 360;
	let closestIdx = 0;
	for (let i = 0; i < points.length; i++) {
		let diff = Math.abs(norm - points[i].angle);
		if (diff > 180) diff = 360 - diff;
		if (diff < minDiff) {
			minDiff = diff;
			closestIdx = i;
		}
	}
	
	const base = points[closestIdx];
	if (Math.round(minDiff) === 0) {
		return base.label;
	}
	
	let diffAngle = norm - base.angle;
	if (diffAngle > 180) diffAngle -= 360;
	if (diffAngle < -180) diffAngle += 360;
	
	const step = diffAngle > 0 ? 1 : -1;
	const targetIdx = (closestIdx + step + 8) % 8;
	const targetLabel = points[targetIdx].label;
	
	return `${base.label}, ${Math.round(minDiff)}° towards ${targetLabel}`;
}

export function getMoonPhaseSvg(phase: number): string {
	const r = 46;
	const cx = 50;
	const cy = 50;
	const isWaxing = phase < 0.5;
	const isGibbous = phase >= 0.25 && phase < 0.75;
	
	const outerSweep = isWaxing ? 1 : 0;
	const outerArc = `A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r}`;
	
	let rx = r;
	if (phase < 0.25) {
		rx = r * (1 - 4 * phase);
	} else if (phase < 0.5) {
		rx = r * (4 * phase - 1);
	} else if (phase < 0.75) {
		rx = r * (3 - 4 * phase);
	} else {
		rx = r * (4 * phase - 3);
	}
	
	const innerSweep = isGibbous ? (isWaxing ? 0 : 1) : (isWaxing ? 1 : 0);
	const innerArc = `A ${rx} ${r} 0 0 ${innerSweep} ${cx} ${cy - r}`;
	
	return `<svg viewBox="0 0 100 100" class="w-full h-full text-white">
		<circle cx="${cx}" cy="${cy}" r="${r}" fill="#111113" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.15" />
		<path d="M ${cx} ${cy - r} ${outerArc} ${innerArc} Z" fill="#fafafa" />
	</svg>`;
}
