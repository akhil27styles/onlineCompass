export type WeatherData = {
	temperature: number;
	humidity: number;
	windSpeed: number;
	condition: string;
	icon: string;
};

// WMO Weather code mapping (simplified)
function getWeatherCondition(code: number): { condition: string; icon: string } {
	// Clear sky
	if (code === 0) return { condition: 'Clear sky', icon: '☀️' };
	// Mainly clear, partly cloudy
	if (code === 1) return { condition: 'Mainly clear', icon: '🌤️' };
	if (code === 2) return { condition: 'Partly cloudy', icon: '⛅' };
	if (code === 3) return { condition: 'Overcast', icon: '☁️' };
	// Fog and depositing rime fog
	if (code === 45) return { condition: 'Foggy', icon: '🌫️' };
	if (code === 48) return { condition: 'Rime fog', icon: '🌫️' };
	// Drizzle: Light, moderate, and dense intensity
	if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: '🌧️' };
	// Rain: Slight, moderate and heavy intensity
	if (code >= 61 && code <= 67) return { condition: 'Rain', icon: '🌧️' };
	// Snow: Slight, moderate, and heavy intensity
	if (code >= 71 && code <= 77) return { condition: 'Snow', icon: '❄️' };
	// Rain showers: Slight, moderate, and violent
	if (code >= 80 && code <= 82) return { condition: 'Rain showers', icon: '🌦️' };
	// Snow showers: Slight and heavy
	if (code >= 85 && code <= 86) return { condition: 'Snow showers', icon: '🌨️' };
	// Thunderstorm: Slight or moderate
	if (code >= 95 && code <= 99) return { condition: 'Thunderstorm', icon: '⛈️' };
	// Catch-all for unknown codes
	return { condition: 'Unknown', icon: '🌡️' };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const data = await response.json();
		const current = data.current;

		if (!current) throw new Error('No current weather data');

		const { condition, icon } = getWeatherCondition(current.weather_code);

		return {
			temperature: Math.round(current.temperature_2m),
			humidity: Math.round(current.relative_humidity_2m),
			windSpeed: Math.round(current.wind_speed_10m),
			condition,
			icon,
		};
	} catch {
		return null;
	}
}