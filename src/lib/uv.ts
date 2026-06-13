export type UVLevel = {
	level: string;
	range: [number, number];
	color: string;
	bgClass: string;
	textClass: string;
	recommendation: string;
};

export const UV_SCALE: UVLevel[] = [
	{
		level: 'Low',
		range: [0, 2],
		color: '#50e3c2',
		bgClass: 'bg-cyan-100 dark:bg-cyan-950/30',
		textClass: 'text-cyan-700 dark:text-cyan-300',
		recommendation: 'No protection needed. Enjoy being outside.',
	},
	{
		level: 'Moderate',
		range: [3, 5],
		color: '#f5a623',
		bgClass: 'bg-amber-100 dark:bg-amber-950/30',
		textClass: 'text-amber-700 dark:text-amber-300',
		recommendation: 'Wear sunscreen SPF 30+. Stay in shade near midday.',
	},
	{
		level: 'High',
		range: [6, 7],
		color: '#f9cb28',
		bgClass: 'bg-yellow-100 dark:bg-yellow-950/30',
		textClass: 'text-yellow-700 dark:text-yellow-300',
		recommendation: 'Sunscreen SPF 30+, hat, and sunglasses. Reduce time in sun 10am–4pm.',
	},
	{
		level: 'Very High',
		range: [8, 10],
		color: '#ee0000',
		bgClass: 'bg-red-100 dark:bg-red-950/30',
		textClass: 'text-red-700 dark:text-red-300',
		recommendation: 'Extra protection: SPF 50+, long sleeves, hat. Avoid sun 10am–4pm.',
	},
	{
		level: 'Extreme',
		range: [11, 20],
		color: '#7928ca',
		bgClass: 'bg-purple-100 dark:bg-purple-950/30',
		textClass: 'text-purple-700 dark:text-purple-300',
		recommendation: 'Stay indoors if possible. Maximum protection if outside.',
	},
];

export function getUVLevel(index: number): UVLevel {
	for (const level of UV_SCALE) {
		if (index >= level.range[0] && index <= level.range[1]) return level;
	}
	return UV_SCALE[UV_SCALE.length - 1];
}

export type UVData = {
	current: number;
	level: UVLevel;
	timestamp: string;
};

export async function fetchUVIndex(lat: number, lon: number): Promise<UVData | null> {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=uv_index&timezone=auto`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (!response.ok) return null;
		const data = await response.json();
		const current = data.current;
		if (!current || typeof current.uv_index !== 'number') return null;
		return {
			current: current.uv_index,
			level: getUVLevel(current.uv_index),
			timestamp: current.time,
		};
	} catch {
		return null;
	}
}
