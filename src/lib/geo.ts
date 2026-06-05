// @ts-expect-error suncalc ships without bundled types
import SunCalc from 'suncalc';

const RAD = 180 / Math.PI;

export type GeoCoords = {
	latitude: number;
	longitude: number;
	accuracy: number | null;
	source?: 'browser' | 'ip' | 'manual';
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
const IP_COORDS_KEY = 'oc:ip-coords';
const IP_COORDS_TTL = 5 * 60 * 1000; // 5 minutes
const CITY_CACHE_KEY = 'oc:city-cache';

const geoOptionsFast: PositionOptions = {
	enableHighAccuracy: false,
	maximumAge: 120_000,
	timeout: 4_000, // Reduced from 8000 for faster fallback
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

/**
 * Returns cached IP-based coordinates if they were fetched within the last 5 minutes.
 */
function getCachedIPCoords(): GeoCoords | null {
	try {
		const raw = sessionStorage.getItem(IP_COORDS_KEY);
		if (!raw) return null;
		const { coords, timestamp } = JSON.parse(raw) as { coords: GeoCoords; timestamp: number };
		if (Date.now() - timestamp > IP_COORDS_TTL) {
			sessionStorage.removeItem(IP_COORDS_KEY);
			return null;
		}
		return coords;
	} catch {
		return null;
	}
}

function setCachedIPCoords(coords: GeoCoords): void {
	try {
		sessionStorage.setItem(IP_COORDS_KEY, JSON.stringify({ coords, timestamp: Date.now() }));
	} catch {
		// ignore quota / private mode
	}
}

/**
 * Fetches approximate location from IP geolocation APIs.
 * Tries ipapi.co first, then falls back to ipgeolocation.io.
 * Throws on failure. Result is cached for 5 minutes.
 */
export async function fetchLocationFromIP(): Promise<GeoCoords> {
	const cached = getCachedIPCoords();
	if (cached) return { ...cached, source: 'ip' };

	const controllers: AbortController[] = [];

	const tryFetch = async (url: string, timeoutMs = 4000): Promise<GeoCoords> => {
		const controller = new AbortController();
		controllers.push(controller);
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timer);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();

			// ipapi.co response
			if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
				const coords: GeoCoords = {
					latitude: data.latitude,
					longitude: data.longitude,
					accuracy: null,
					source: 'ip',
				};
				setCachedIPCoords(coords);
				return coords;
			}
			throw new Error('No latitude/longitude in response');
		} catch (err) {
			clearTimeout(timer);
			throw err;
		}
	};

	try {
		return await tryFetch('https://ipapi.co/json/');
	} catch {
		try {
			return await tryFetch('https://ipgeolocation.io/api/v1/ipgeo?apiKey=demo');
		} catch {
			throw new GeoError('unavailable', 'IP location unavailable. Check your connection.');
		}
	} finally {
		for (const c of controllers) {
			c.abort();
		}
	}
}

/**
 * Race between browser geolocation and IP geolocation.
 * Returns the first result; if IP wins and browser geo is still pending,
 * the browser result will dispatch an `oc:location-updated` event when ready.
 */
export async function requestLocationWithFallback(
	onFirstResult?: (coords: GeoCoords, source: 'browser' | 'ip') => void,
	onPreciseResult?: (coords: GeoCoords) => void,
): Promise<GeoCoords> {
	let browserResolve: ((coords: GeoCoords) => void) | null = null;
	let browserReject: ((err: unknown) => void) | null = null;
	let ipResolve: ((coords: GeoCoords) => void) | null = null;
	let ipReject: ((err: unknown) => void) | null = null;
	let browserDone = false;
	let ipDone = false;

	const browserPromise = new Promise<GeoCoords>((resolve, reject) => {
		browserResolve = resolve;
		browserReject = reject;
	});

	const ipPromise = new Promise<GeoCoords>((resolve, reject) => {
		ipResolve = resolve;
		ipReject = reject;
	});

	// Kick off both in parallel
	requestLocation({ precise: false })
		.then((coords) => {
			if (ipDone) return; // IP already won, ignore
			browserDone = true;
			const withSource: GeoCoords = { ...coords, source: 'browser' };
			if (browserResolve) browserResolve(withSource);
		})
		.catch((err) => {
			if (ipDone) return;
			browserDone = true;
			if (browserReject) browserReject(err);
		});

	fetchLocationFromIP()
		.then((coords) => {
			if (browserDone) return; // Browser already won, ignore
			ipDone = true;
			if (ipResolve) ipResolve(coords);
		})
		.catch((err) => {
			if (browserDone) return;
			ipDone = true;
			if (ipReject) ipReject(err);
		});

	// Promise.race returns whichever settles first
	const winner = await Promise.race([browserPromise, ipPromise]);

	onFirstResult?.(winner, winner.source ?? 'browser');

	// If IP won, wait for browser geo to complete and dispatch upgrade event
	if (winner.source !== 'browser') {
		browserPromise
			.then((preciseCoords) => {
				onPreciseResult?.(preciseCoords);
				document.dispatchEvent(
					new CustomEvent('oc:location-updated', { detail: { coords: preciseCoords } }),
				);
			})
			.catch(() => {
				// Browser failed — nothing to upgrade to
			});
	}

	return winner;
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

/**
 * Forward geocode: convert city name or coordinates to latitude/longitude
 * Supports formats:
 * - City name: "New York", "London, UK"
 * - Coordinates: "40.7128,-74.0060", "40.7128, -74.0060"
 * 
 * @param input City name or coordinate string
 * @returns Promise resolving to GeoCoords or throwing GeoError
 */
export async function forwardGeocode(input: string): Promise<GeoCoords> {
	if (!input || typeof input !== 'string') {
		throw new GeoError('unknown', 'Invalid input: expected a non-empty string');
	}

	const trimmed = input.trim();
	if (!trimmed) {
		throw new GeoError('unknown', 'Invalid input: empty string after trimming');
	}

	// Check if input looks like coordinates (contains comma and numbers)
	const coordMatch = trimmed.match(/^([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)$/);
	if (coordMatch) {
		const lat = parseFloat(coordMatch[1]);
		const lng = parseFloat(coordMatch[2]);
		
		if (isNaN(lat) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			throw new GeoError('unknown', 'Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180');
		}
		
		return {
			latitude: lat,
			longitude: lng,
			accuracy: null,
			source: 'manual'
		};
	}

	// Treat as city name - use geocoding APIs
	try {
		// Use the same geocoding APIs as reverse geocoding but in forward direction
		const geocodingApis = [
			{
				name: 'bigdatacloud',
				url: (city: string) => 
					`https://api.bigdatacloud.net/data/forward-geocode-client?locality=${encodeURIComponent(city)}&localityLanguage=en`,
				parser: (data: any) => {
					if (data.latitude && data.longitude) {
						return {
							latitude: data.latitude,
							longitude: data.longitude,
							accuracy: null,
							source: 'manual'
						};
					}
					return null;
				}
			},
			{
				name: 'nominatim',
				url: (city: string) => 
					`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`,
				parser: (data: any) => {
					if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
						return {
							latitude: parseFloat(data[0].lat),
							longitude: parseFloat(data[0].lon),
							accuracy: null,
							source: 'manual'
						};
					}
					return null;
				}
			},
			{
				name: 'geocode-maps',
				url: (city: string) => 
					`https://geocode.maps.co/search?q=${encodeURIComponent(city)}`,
				parser: (data: any) => {
					if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
						return {
							latitude: parseFloat(data[0].lat),
							longitude: parseFloat(data[0].lon),
							accuracy: null,
							source: 'manual'
						};
					}
					return null;
				}
			}
		];

		// Try each API endpoint in parallel for faster response
		const requests = geocodingApis.map(async (api) => {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);

				const response = await fetch(api.url(trimmed), {
					signal: controller.signal,
					headers: api.name === 'nominatim' ? { 'User-Agent': 'freeOnlinecompass.com' } : {}
				});
				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error(`API ${api.name} responded with ${response.status}`);
				}
				const jsonData = await response.json();
				const result = api.parser(jsonData);
				
				if (result) {
					return result;
				}
				throw new Error('No location data found');
			} catch (error) {
				console.debug(`Forward geocoding API ${api.name} failed:`, error);
				throw error;
			}
		});

		// Use Promise.any to return the first successful result
		try {
			const result = await Promise.any(requests);
			return result;
		} catch (error) {
			throw new GeoError('unavailable', `Could not geocode location "${trimmed}". Please check the spelling or try coordinates format.`);
		}
	} catch (error) {
		if (error instanceof GeoError) {
			throw error;
		}
		throw new GeoError('unknown', `Failed to geocode location "${trimmed}": ${error.message}`);
	}
}