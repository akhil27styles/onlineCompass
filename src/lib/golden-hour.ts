// @ts-expect-error suncalc ships without bundled types
import SunCalc from 'suncalc';

const RAD = 180 / Math.PI;

export type GoldenHourWindow = {
	morningStart: Date;
	morningEnd: Date;
	eveningStart: Date;
	eveningEnd: Date;
};

export type GoldenHourSnapshot = {
	now: Date;
	morningStart: Date;
	morningEnd: Date;
	eveningStart: Date;
	eveningEnd: Date;
	isCurrentlyGoldenHour: boolean;
	nextGoldenHourTime: Date | null;
	nextGoldenHourLabel: string;
	morningDuration: number;
	eveningDuration: number;
	goldenHourToday: boolean;
};

function radToDeg(rad: number): number {
	return rad * RAD;
}

function sunCalcAzimuthToCompass(azimuthRad: number): number {
	return ((radToDeg(azimuthRad) + 180) % 360 + 360) % 360;
}

export function getGoldenHourWindows(date: Date, lat: number, lng: number): GoldenHourWindow {
	const times = SunCalc.getTimes(date, lat, lng);

	return {
		morningStart: times.goldenHour,
		morningEnd: times.sunrise,
		eveningStart: times.goldenHourEnd,
		eveningEnd: times.sunset,
	};
}

export function getGoldenHourSnapshot(date: Date, lat: number, lng: number): GoldenHourSnapshot {
	const windows = getGoldenHourWindows(date, lat, lng);
	const now = new Date();

	const morningStart = windows.morningStart;
	const morningEnd = windows.morningEnd;
	const eveningStart = windows.eveningStart;
	const eveningEnd = windows.eveningEnd;

	const morningDuration = morningStart && morningEnd
		? morningEnd.getTime() - morningStart.getTime()
		: 0;
	const eveningDuration = eveningStart && eveningEnd
		? eveningEnd.getTime() - eveningStart.getTime()
		: 0;

	const inMorning = morningStart && morningEnd
		? now >= morningStart && now <= morningEnd
		: false;
	const inEvening = eveningStart && eveningEnd
		? now >= eveningStart && now <= eveningEnd
		: false;
	const isCurrentlyGoldenHour = inMorning || inEvening;

	let nextGoldenHourTime: Date | null = null;
	let nextGoldenHourLabel = '';

	if (inMorning) {
		nextGoldenHourTime = morningEnd;
		nextGoldenHourLabel = 'Morning golden hour ends';
	} else if (now < morningStart) {
		nextGoldenHourTime = morningStart;
		nextGoldenHourLabel = 'Morning golden hour starts';
	} else if (inEvening) {
		nextGoldenHourTime = eveningEnd;
		nextGoldenHourLabel = 'Evening golden hour ends';
	} else if (now < eveningStart) {
		nextGoldenHourTime = eveningStart;
		nextGoldenHourLabel = 'Evening golden hour starts';
	} else {
		const tomorrow = new Date(date);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const tomorrowWindows = getGoldenHourWindows(tomorrow, lat, lng);
		nextGoldenHourTime = tomorrowWindows.morningStart;
		nextGoldenHourLabel = 'Tomorrow morning';
	}

	const goldenHourToday = morningStart && morningEnd
		? morningStart.getTime() < now.getTime() || eveningStart.getTime() < now.getTime()
		: false;

	return {
		now,
		morningStart,
		morningEnd,
		eveningStart,
		eveningEnd,
		isCurrentlyGoldenHour,
		nextGoldenHourTime,
		nextGoldenHourLabel,
		morningDuration,
		eveningDuration,
		goldenHourToday,
	};
}

export function formatGoldenHourDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '—';
	const totalMinutes = Math.round(ms / 60_000);
	const minutes = totalMinutes % 60;
	return `${minutes}m`;
}

export function formatTime(date: Date | undefined): string {
	if (!date || Number.isNaN(date.getTime())) return '—';
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatCountdown(target: Date | null): string {
	if (!target || Number.isNaN(target.getTime())) return '—';
	const diff = target.getTime() - Date.now();
	if (diff <= 0) return 'Now';
	const totalMinutes = Math.round(diff / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function getQualityDescription(weatherCode: number | null): { label: string; emoji: string; color: string } {
	if (weatherCode === null) return { label: 'Unknown', emoji: '—', color: 'text-muted' };
	if (weatherCode === 0) return { label: 'Perfect — clear sky', emoji: '☀️', color: 'text-amber-accent' };
	if (weatherCode <= 2) return { label: 'Good — partly cloudy', emoji: '🌤️', color: 'text-amber-accent' };
	if (weatherCode === 3) return { label: 'Fair — overcast', emoji: '☁️', color: 'text-body' };
	if (weatherCode >= 45 && weatherCode <= 48) return { label: 'Poor — foggy', emoji: '🌫️', color: 'text-muted' };
	if (weatherCode >= 51 && weatherCode <= 67) return { label: 'Poor — rain', emoji: '🌧️', color: 'text-muted' };
	return { label: 'Condition uncertain', emoji: '🌡️', color: 'text-body' };
}

export async function fetchCloudCover(lat: number, lon: number): Promise<number | null> {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code&timezone=auto`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (!response.ok) return null;
		const data = await response.json();
		return data.current?.weather_code ?? null;
	} catch {
		return null;
	}
}

export function getSunPosition(date: Date, lat: number, lng: number) {
	const pos = SunCalc.getPosition(date, lat, lng);
	return {
		altitude: radToDeg(pos.altitude),
		azimuth: sunCalcAzimuthToCompass(pos.azimuth),
	};
}
