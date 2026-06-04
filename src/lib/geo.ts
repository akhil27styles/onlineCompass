export type GeoCoords = {
	latitude: number;
	longitude: number;
	accuracy: number | null;
};

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export type GeoErrorCode = 'unsupported' | 'insecure' | 'denied' | 'timeout' | 'unavailable' | 'unknown';

export class GeoError extends Error {
	code: GeoErrorCode;

	constructor(code: GeoErrorCode, message: string) {
		super(message);
		this.name = 'GeoError';
		this.code = code;
	}
}

const STORAGE_KEY = 'oc:last-coords';
const CITY_CACHE_KEY = 'oc:city-cache';

const geoOptionsFast: PositionOptions = {
	enableHighAccuracy: false,
	maximumAge: 120_000,
	timeout: 8_000, // Faster timeout for better UX
};

const geoOptionsPrecise: PositionOptions = {
	enableHighAccuracy: true,
	maximumAge: 0,
	timeout: 20_000,
};

export function isGeolocationSupported(): boolean {
	return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureContextForGeo(): boolean {
	return typeof window !== 'undefined' && window.isSecureContext;
}

export function formatCoords(coords: GeoCoords): string {
	return `Lat ${coords.latitude.toFixed(5)}, Lon ${coords.longitude.toFixed(5)}`;
}

export function readCachedCoords(): GeoCoords | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as GeoCoords;
		if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return null;
		return parsed;
	} catch {
		return null;
	}
}

export function cacheCoords(coords: GeoCoords): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
	} catch {
		// ignore quota / private mode
	}
}

export async function queryGeolocationPermission(): Promise<GeoPermission> {
	if (!navigator.permissions?.query) return 'unknown';

	try {
		const result = await navigator.permissions.query({ name: 'geolocation' });
		if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
			return result.state;
		}
		return 'unknown';
	} catch {
		return 'unknown';
	}
}

export function watchPermissionChanges(onChange: (state: GeoPermission) => void): (() => void) | null {
	if (!navigator.permissions?.query) return null;

	let permissionStatus: PermissionStatus | null = null;

	navigator.permissions
		.query({ name: 'geolocation' })
		.then((status) => {
			permissionStatus = status;
			const handler = () => {
				const state = status.state;
				if (state === 'granted' || state === 'denied' || state === 'prompt') {
					onChange(state);
				}
			};
			status.addEventListener('change', handler);
		})
		.catch(() => {});

	return () => {
		// Permissions API does not always expose removeListener on cloned handlers; best-effort noop.
		void permissionStatus;
	};
}

export function requestLocation(options?: { precise?: boolean }): Promise<GeoCoords> {
	return new Promise((resolve, reject) => {
		if (!isGeolocationSupported()) {
			reject(new GeoError('unsupported', 'Geolocation is not supported in this browser.'));
			return;
		}

		if (!isSecureContextForGeo()) {
			reject(
				new GeoError(
					'insecure',
					'Location requires HTTPS. Open this site with https:// or use localhost while testing.',
				),
			);
			return;
		}

		const positionOptions = options?.precise ? geoOptionsPrecise : geoOptionsFast;

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coords: GeoCoords = {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy ?? null,
				};
				cacheCoords(coords);
				resolve(coords);
			},
			(error) => {
				if (error.code === error.PERMISSION_DENIED) {
					reject(
						new GeoError(
							'denied',
							'Location access was blocked. Allow location for this site in your browser settings, then tap Allow Location again.',
						),
					);
					return;
				}
				if (error.code === error.TIMEOUT) {
					reject(
						new GeoError(
							'timeout',
							'Location timed out. Move to an open area or tap Allow Location to try again with GPS.',
						),
					);
					return;
				}
				if (error.code === error.POSITION_UNAVAILABLE) {
					reject(
						new GeoError(
							'unavailable',
							'Your device could not determine a position right now. Try again in a moment.',
						),
					);
					return;
				}
				reject(new GeoError('unknown', 'Could not read your location.'));
			},
			positionOptions,
		);
	});
}

function getCityCache(): Record<string, string> {
	try {
		const raw = localStorage.getItem(CITY_CACHE_KEY);
		if (!raw) return {};
		return JSON.parse(raw) as Record<string, string>;
	} catch {
		return {};
	}
}

function setCityCache(cache: Record<string, string>): void {
	try {
		localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(cache));
	} catch {
		// ignore quota / private mode
	}
}

/**
 * Multiple free geocoding API endpoints with fallback.
 * Provides better reliability and higher combined rate limits (2000+ requests/day).
 */
const GEOCODING_APIS = [
	{
		name: 'bigdatacloud',
		url: (lat: number, lng: number) =>
			`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
		parser: (data: any) => {
			const city = data.city || data.locality || '';
			const region = data.principalSubdivision || '';
			const country = data.countryName || '';
			
			if (city && country) {
				return region && region !== city ? `${city}, ${region}, ${country}` : `${city}, ${country}`;
			}
			return city || region || country || '';
		}
	},
	{
		name: 'nominatim',
		url: (lat: number, lng: number) =>
			`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en`,
		parser: (data: any) => {
			const addr = data.address || {};
			const city = addr.city || addr.town || addr.village || addr.municipality || '';
			const region = addr.state || addr.province || '';
			const country = addr.country || '';
			
			if (city && country) {
				return region && region !== city ? `${city}, ${region}, ${country}` : `${city}, ${country}`;
			}
			return city || region || country || '';
		}
	},
	{
		name: 'geocode-maps',
		url: (lat: number, lng: number) =>
			`https://geocode.maps.co/reverse?lat=${lat}&lon=${lng}`,
		parser: (data: any) => {
			const addr = data.address || {};
			const city = addr.city || addr.town || addr.village || '';
			const region = addr.state || '';
			const country = addr.country || '';
			
			if (city && country) {
				return region && region !== city ? `${city}, ${region}, ${country}` : `${city}, ${country}`;
			}
			return city || region || country || '';
		}
	}
];

export async function getCityFromCoords(latitude: number, longitude: number): Promise<string> {
	const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
	const cache = getCityCache();

	if (cache[cacheKey]) {
		return cache[cacheKey];
	}

	// Try each API endpoint in parallel for faster response, use first successful result
	const requests = GEOCODING_APIS.map(async (api) => {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 4000);

			const response = await fetch(api.url(latitude, longitude), {
				signal: controller.signal,
				headers: api.name === 'nominatim' ? { 'User-Agent': 'freeOnlinecompass.com' } : {}
			});
			clearTimeout(timeoutId);

			if (!response.ok) throw new Error(`API ${api.name} responded with ${response.status}`);
			const data = await response.json();
			const result = api.parser(data);
			
			if (result) {
				cache[cacheKey] = result;
				setCityCache(cache);
				return result;
			}
			throw new Error('No location data');
		} catch (error) {
			console.debug(`Geocoding API ${api.name} failed:`, error);
			throw error;
		}
	});

	// Use Promise.any to return the first successful result
	try {
		const result = await Promise.any(requests);
		return result;
	} catch {
		// All APIs failed
		return '';
	}
}

/**
 * Silently prefetch location in the background (cache if not already cached).
 * Useful for fetching on compass page so sun/moon pages have instant data.
 * Does not show UI or throw errors - just caches coordinates quietly.
 */
export function prefetchLocationSilently(): void {
	if (typeof window === 'undefined') return;
	
	// Already cached? Don't fetch again.
	const cached = readCachedCoords();
	if (cached) return;

	// Not secure or not supported? Skip silently.
	if (!isSecureContextForGeo() || !isGeolocationSupported()) return;

	// Check permission first to avoid unnecessary prompts
	queryGeolocationPermission()
		.then((permission) => {
			// Only fetch if permission is already granted
			if (permission === 'granted') {
				requestLocation({ precise: false })
					.then(() => {
						// Success - coordinates are cached, city will prefetch automatically
						getCityFromCoords(readCachedCoords()!.latitude, readCachedCoords()!.longitude).catch(() => {});
					})
					.catch(() => {
						// Silent fail - no UI needed
					});
			}
		})
		.catch(() => {});
}
