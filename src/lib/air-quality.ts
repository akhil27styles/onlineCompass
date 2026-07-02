export type AirQualityData = {
	aqi: number;
	pm25: number | null;
	pm10: number | null;
	ozone: number | null;
	nitrogenDioxide: number | null;
	level: AirQualityLevel;
	timestamp: string;
};

export type AirQualityLevel = {
	label: 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor' | 'Extremely Poor';
	color: string;
	advice: string;
};

export function getEuropeanAqiLevel(aqi: number): AirQualityLevel {
	if (aqi <= 20) {
		return {
			label: 'Good',
			color: '#50e3c2',
			advice: 'Air quality is good. Outdoor activity is suitable for most people.',
		};
	}
	if (aqi <= 40) {
		return {
			label: 'Fair',
			color: '#8dd66b',
			advice: 'Air quality is acceptable. Sensitive people can monitor symptoms during long exposure.',
		};
	}
	if (aqi <= 60) {
		return {
			label: 'Moderate',
			color: '#f5a623',
			advice: 'Sensitive groups should reduce prolonged outdoor activity, especially near traffic.',
		};
	}
	if (aqi <= 80) {
		return {
			label: 'Poor',
			color: '#f97316',
			advice: 'Reduce heavy outdoor exercise. Children, older adults, and sensitive groups should take care.',
		};
	}
	if (aqi <= 100) {
		return {
			label: 'Very Poor',
			color: '#ef4444',
			advice: 'Avoid prolonged outdoor exertion. Keep windows closed if indoor air is cleaner.',
		};
	}
	return {
		label: 'Extremely Poor',
		color: '#7928ca',
		advice: 'Stay indoors when possible and avoid strenuous outdoor activity.',
	};
}

export async function fetchAirQuality(lat: number, lon: number): Promise<AirQualityData | null> {
	try {
		const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide&timezone=auto`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (!response.ok) return null;

		const data = await response.json();
		const current = data.current;
		if (!current || typeof current.european_aqi !== 'number') return null;

		const aqi = Math.round(current.european_aqi);
		return {
			aqi,
			pm25: typeof current.pm2_5 === 'number' ? current.pm2_5 : null,
			pm10: typeof current.pm10 === 'number' ? current.pm10 : null,
			ozone: typeof current.ozone === 'number' ? current.ozone : null,
			nitrogenDioxide: typeof current.nitrogen_dioxide === 'number' ? current.nitrogen_dioxide : null,
			level: getEuropeanAqiLevel(aqi),
			timestamp: current.time ?? '',
		};
	} catch {
		return null;
	}
}
