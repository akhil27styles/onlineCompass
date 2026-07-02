import { getMoonSnapshot, getSunSnapshot } from './astronomy';

export type SkyConditions = {
	cloudCover: number;
	precipitation: number;
	humidity: number;
	windSpeed: number;
	weatherCode: number;
};

export type StargazingScore = {
	score: number;
	level: 'Poor' | 'Fair' | 'Good' | 'Excellent';
	color: string;
	advice: string;
};

export async function fetchSkyConditions(lat: number, lon: number): Promise<SkyConditions | null> {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=cloud_cover,precipitation,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (!response.ok) return null;

		const current = (await response.json()).current;
		if (!current) return null;

		return {
			cloudCover: Math.round(current.cloud_cover ?? 0),
			precipitation: Number(current.precipitation ?? 0),
			humidity: Math.round(current.relative_humidity_2m ?? 0),
			windSpeed: Math.round(current.wind_speed_10m ?? 0),
			weatherCode: Number(current.weather_code ?? 0),
		};
	} catch {
		return null;
	}
}

export function getStargazingScore(
	date: Date,
	coords: { lat: number; lng: number },
	conditions: SkyConditions | null,
): StargazingScore {
	const sun = getSunSnapshot(date, coords);
	const moon = getMoonSnapshot(date, coords);
	let score = 100;

	if (sun.altitude > 0) score -= 60;
	else if (sun.altitude > -6) score -= 40;
	else if (sun.altitude > -12) score -= 20;
	else if (sun.altitude > -18) score -= 10;

	if (moon.isUp) {
		score -= Math.round(moon.illumination.percent * 0.35);
	}

	if (conditions) {
		score -= Math.round(conditions.cloudCover * 0.55);
		if (conditions.precipitation > 0) score -= 20;
		if (conditions.humidity >= 85) score -= 10;
		if (conditions.windSpeed >= 30) score -= 8;
	} else {
		score -= 15;
	}

	score = Math.max(0, Math.min(100, score));

	if (score >= 80) {
		return {
			score,
			level: 'Excellent',
			color: '#50e3c2',
			advice: 'Excellent sky conditions. Look for planets, constellations, and faint stars away from city lights.',
		};
	}
	if (score >= 60) {
		return {
			score,
			level: 'Good',
			color: '#8dd66b',
			advice: 'Good viewing conditions. Bright constellations and the Moon should be easy to observe.',
		};
	}
	if (score >= 35) {
		return {
			score,
			level: 'Fair',
			color: '#f5a623',
			advice: 'Fair conditions. Clouds, twilight, moonlight, or humidity may reduce faint-star visibility.',
		};
	}
	return {
		score,
		level: 'Poor',
		color: '#ef4444',
		advice: 'Poor stargazing right now. Try after moonset, after twilight, or on a clearer night.',
	};
}
