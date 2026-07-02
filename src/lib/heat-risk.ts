export type HeatRiskInput = {
	temperatureC: number;
	humidity: number;
	windSpeedKmh: number;
	solarAltitude: number;
	uvIndex?: number;
};

export type HeatRisk = {
	level: 'Low' | 'Moderate' | 'High' | 'Extreme';
	score: number;
	color: string;
	heatIndexC: number;
	solarLoad: 'Night' | 'Low' | 'Moderate' | 'Strong';
	recommendation: string;
};

function celsiusToFahrenheit(value: number): number {
	return (value * 9) / 5 + 32;
}

function fahrenheitToCelsius(value: number): number {
	return ((value - 32) * 5) / 9;
}

function getHeatIndexC(temperatureC: number, humidity: number): number {
	const temperatureF = celsiusToFahrenheit(temperatureC);

	if (temperatureF < 80 || humidity < 40) {
		return temperatureC;
	}

	const heatIndexF =
		-42.379 +
		2.04901523 * temperatureF +
		10.14333127 * humidity -
		0.22475541 * temperatureF * humidity -
		0.00683783 * temperatureF * temperatureF -
		0.05481717 * humidity * humidity +
		0.00122874 * temperatureF * temperatureF * humidity +
		0.00085282 * temperatureF * humidity * humidity -
		0.00000199 * temperatureF * temperatureF * humidity * humidity;

	return fahrenheitToCelsius(heatIndexF);
}

function getSolarLoad(solarAltitude: number): HeatRisk['solarLoad'] {
	if (solarAltitude <= 0) return 'Night';
	if (solarAltitude < 20) return 'Low';
	if (solarAltitude < 45) return 'Moderate';
	return 'Strong';
}

export function getHeatRisk({
	temperatureC,
	humidity,
	windSpeedKmh,
	solarAltitude,
	uvIndex,
}: HeatRiskInput): HeatRisk {
	const heatIndexC = getHeatIndexC(temperatureC, humidity);
	const solarLoad = getSolarLoad(solarAltitude);

	let score = 0;
	if (heatIndexC >= 27) score += 1;
	if (heatIndexC >= 32) score += 1;
	if (heatIndexC >= 39) score += 2;
	if (humidity >= 65) score += 1;
	if (solarLoad === 'Moderate') score += 1;
	if (solarLoad === 'Strong') score += 2;
	if (typeof uvIndex === 'number' && uvIndex >= 6) score += 1;
	if (typeof uvIndex === 'number' && uvIndex >= 8) score += 1;
	if (windSpeedKmh < 8 && solarLoad !== 'Night') score += 1;

	if (score >= 6) {
		return {
			level: 'Extreme',
			score,
			color: '#ef4444',
			heatIndexC,
			solarLoad,
			recommendation: 'Avoid peak sun if possible. Hydrate often, seek shade, and postpone intense outdoor activity.',
		};
	}

	if (score >= 4) {
		return {
			level: 'High',
			score,
			color: '#f97316',
			heatIndexC,
			solarLoad,
			recommendation: 'Limit midday exposure. Use shade, water breaks, SPF, and lighter clothing.',
		};
	}

	if (score >= 2) {
		return {
			level: 'Moderate',
			score,
			color: '#f5a623',
			heatIndexC,
			solarLoad,
			recommendation: 'Heat is manageable, but direct sun can add stress. Carry water and watch UV.',
		};
	}

	return {
		level: 'Low',
		score,
		color: '#50e3c2',
		heatIndexC,
		solarLoad,
		recommendation: 'Low heat stress right now. Normal sun protection is enough for most people.',
	};
}
