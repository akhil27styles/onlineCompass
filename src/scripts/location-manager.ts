import {
	type GeoCoords,
	type GeoPermission,
	GeoError,
	formatCoords,
	getCachedIPCity,
	isGeolocationSupported,
	isSecureContextForGeo,
	queryGeolocationPermission,
	readCachedCoords,
	requestLocation,
	requestLocationWithFallback,
	watchPermissionChanges,
	getCityFromCoords,
	cacheCoords,
	fetchLocationFromIP,
} from '../lib/geo';
import { locationStore } from '../lib/location-store';

export type LocationManagerOptions = {
	onLocation?: (coords: GeoCoords) => void;
	coordsEl?: Element | null;
	messageEl?: Element | null;
	allowButtonEl?: HTMLButtonElement | null;
	retryButtonEl?: HTMLButtonElement | null;
};

type UiState = 'checking' | 'ready' | 'needs-permission' | 'denied' | 'error' | 'unsupported' | 'insecure';

function setText(element: Element | null | undefined, value: string) {
	if (element) element.textContent = value;
}

function setButtonVisible(button: HTMLButtonElement | null | undefined, visible: boolean) {
	if (!button) return;
	button.hidden = !visible;
	button.disabled = false;
}

function dispatch(name: string, detail?: unknown) {
	document.dispatchEvent(new CustomEvent(name, { detail }));
}

export function mountLocationManager(options: LocationManagerOptions = {}) {
	const {
		onLocation,
		coordsEl = document.querySelector('#locationCoords'),
		messageEl = document.querySelector('#locationResult') ?? document.querySelector('#sunLocationNote') ?? document.querySelector('#moonLocationNote'),
		allowButtonEl = document.querySelector<HTMLButtonElement>('#allowLocation'),
		retryButtonEl = document.querySelector<HTMLButtonElement>('#retryLocation'),
	} = options;

	const globalLocationText = document.querySelector('#globalLocationText');
	const allowLocationGlobal = document.querySelector<HTMLButtonElement>('#allowLocationGlobal');
	const cityEl = document.querySelector('#locationCity');

	// Alert banner elements
	const alertBanner = document.querySelector('#locationAlertBanner');
	const allowLocationAlert = document.querySelector<HTMLButtonElement>('#allowLocationAlert');
	const dismissLocationAlert = document.querySelector<HTMLButtonElement>('#dismissLocationAlert');

	let state: UiState = 'checking';
	let inFlight = false;

	function syncGlobalBar(next: UiState, shortText: string) {
		setText(globalLocationText, shortText);
		const showGlobalAllow = next === 'needs-permission' || next === 'denied';
		setButtonVisible(allowLocationGlobal, showGlobalAllow);
		if (allowLocationGlobal) {
			allowLocationGlobal.textContent =
				next === 'denied' ? 'Allow in Settings' : 'Allow Location';
		}

		// Show/hide alert banner based on state
		if (alertBanner) {
			if (next === 'needs-permission' || next === 'denied' || next === 'checking') {
				alertBanner.classList.remove('hidden');
			} else if (next === 'ready') {
				alertBanner.classList.add('hidden');
			}
		}
	}

	function applyUi(next: UiState, message: string, coordsLabel?: string) {
		state = next;
		if (coordsLabel !== undefined) setText(coordsEl, coordsLabel);
		setText(messageEl, message);

		const showAllow = next === 'needs-permission' || next === 'denied';
		const showRetry = next === 'error';

		setButtonVisible(allowButtonEl, showAllow);
		setButtonVisible(retryButtonEl, showRetry);

		if (allowButtonEl) {
			allowButtonEl.textContent =
				next === 'denied' ? 'Try Allow Location Again' : 'Allow Location Access';
		}

		const globalShort =
			next === 'checking'
				? 'Auto-detecting your location…'
				: next === 'ready'
					? coordsLabel ?? 'Location detected'
					: next === 'needs-permission'
						? 'Location needed — tap Allow'
						: next === 'denied'
							? 'Location blocked — tap Allow'
							: next === 'insecure'
								? 'HTTPS required for location'
								: next === 'unsupported'
									? 'Location not supported'
									: 'Could not detect location';
		syncGlobalBar(next, globalShort);
	}

	async function updateCity(coords: GeoCoords) {
		// Show coordinates immediately — no "Looking up city…" delay
		const coordLabel = `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`;
		if (cityEl) cityEl.textContent = coordLabel;

		// Check IP city cache for instant city name
		const ipCity = getCachedIPCity();
		if (ipCity) {
			if (cityEl) cityEl.textContent = ipCity;
			setText(messageEl, `Location: ${ipCity} (${coordLabel})`);
			setText(globalLocationText, `📍 ${ipCity}`);
			dispatch('oc:location-city-ready', { city: ipCity, coords });
			return;
		}

		// Fallback: geocode in background (fast timeout)
		try {
			const city = await getCityFromCoords(coords.latitude, coords.longitude);
			if (city) {
				if (cityEl) cityEl.textContent = city;
				setText(messageEl, `Location: ${city} (${coordLabel})`);
				setText(globalLocationText, `📍 ${city}`);
				dispatch('oc:location-city-ready', { city, coords });
			}
		} catch {
			// Silently keep showing coordinates
		}
	}

	function onSuccess(coords: GeoCoords, source: 'auto' | 'user') {
		const label = formatCoords(coords);

		// Don't override manual location from store
		if (locationStore.get().source === 'manual') return;

		applyUi(
			'ready',
			`Lat ${coords.latitude.toFixed(4)}°, Lon ${coords.longitude.toFixed(4)}°`,
			label,
		);
		onLocation?.(coords);
		locationStore.setLocation(coords, coords.source ?? 'browser');
		void updateCity(coords);
	}

	function onFailure(error: unknown, preferPrompt = false) {
		if (locationStore.get().source === 'manual') return;

		if (error instanceof GeoError) {
			if (error.code === 'denied') {
				applyUi('denied', error.message, 'Blocked');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
				locationStore.set({ coords: null, status: 'denied' });
				return;
			}
			if (error.code === 'insecure') {
				applyUi('insecure', error.message, 'HTTPS required');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
				locationStore.set({ coords: null, status: 'insecure' });
				return;
			}
			if (error.code === 'unsupported') {
				applyUi('unsupported', error.message, 'Unavailable');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
				locationStore.set({ coords: null, status: 'unsupported' });
				return;
			}

			if (preferPrompt) {
				applyUi(
					'needs-permission',
					'Tap Allow Location Access so your browser can share coordinates for sun and moon tools.',
					'Permission needed',
				);
				dispatch('oc:location-needs-permission', { message: error.message });
				return;
			}

			applyUi('error', error.message, 'Not available');
			dispatch('oc:location-denied', { message: error.message, code: error.code });
			locationStore.set({ coords: null, status: 'error' });
			return;
		}

		const message = error instanceof Error ? error.message : 'Location unavailable.';
		if (preferPrompt) {
			applyUi('needs-permission', 'Tap Allow Location Access to enable location for this site.', 'Permission needed');
			dispatch('oc:location-needs-permission', { message });
			return;
		}
		applyUi('error', message, 'Not available');
		dispatch('oc:location-denied', { message });
		locationStore.set({ coords: null, status: 'error' });
	}

	async function fetchLocation(userInitiated: boolean): Promise<GeoCoords | null> {
		if (inFlight) return null;
		inFlight = true;

		if (allowButtonEl) allowButtonEl.disabled = true;
		if (allowLocationGlobal) allowLocationGlobal.disabled = true;
		if (retryButtonEl) retryButtonEl.disabled = true;

		applyUi('checking', userInitiated ? 'Waiting for location permission…' : 'Detecting your location…', 'Detecting…');

		try {
			const coords = await requestLocation({ precise: userInitiated });
			onSuccess(coords, userInitiated ? 'user' : 'auto');
			return coords;
		} catch (error) {
			const permission = await queryGeolocationPermission();
			const shouldPrompt =
				userInitiated === false &&
				(permission === 'prompt' || permission === 'unknown') &&
				error instanceof GeoError &&
				(error.code === 'denied' || error.code === 'timeout' || error.code === 'unavailable');

			onFailure(error, shouldPrompt);
			return null;
		} finally {
			inFlight = false;
			if (allowButtonEl) allowButtonEl.disabled = false;
			if (allowLocationGlobal) allowLocationGlobal.disabled = false;
			if (retryButtonEl) retryButtonEl.disabled = false;
		}
	}

	async function init() {
		await Promise.resolve(); // Defer execution so that page event listeners can register first

		// If user manually set a location (from search bar, persisted across pages), skip geo entirely
		if (locationStore.get().source === 'manual') {
			const s = locationStore.get();
			if (s.coords) {
				applyUi('ready', formatCoords(s.coords as GeoCoords), formatCoords(s.coords as GeoCoords));
				if (s.city) {
					setText(globalLocationText, `📍 ${s.city}`);
					setText(messageEl, `Location: ${s.city}`);
					if (cityEl) cityEl.textContent = s.city;
				}
				onLocation?.(s.coords as GeoCoords);
				dispatch('oc:location-ready', { coords: s.coords, source: 'manual' });
				if (s.city) {
					dispatch('oc:location-city-ready', { city: s.city, coords: s.coords });
				}
			}
			return;
		}

		if (!isGeolocationSupported()) {
			onFailure(new GeoError('unsupported', 'Geolocation is not supported in this browser.'));
			return;
		}

		if (!isSecureContextForGeo()) {
			onFailure(
				new GeoError(
					'insecure',
					'Location needs HTTPS. Compass still works; sun and moon need HTTPS.',
				),
			);
			return;
		}

		const cached = readCachedCoords();
		if (cached) {
			// Immediately dispatch cached location so astronomers get immediate rendering
			onSuccess(cached, 'auto');
		}

		const permission = await queryGeolocationPermission();

		if (permission === 'granted') {
			await fetchLocation(false);
			return;
		}

		if (permission === 'denied') {
			if (!cached) {
				applyUi(
					'denied',
					'Location is blocked for this site. Search for a city above or in browser settings, set Location to Allow, then tap Try Allow Location Again.',
					'Blocked',
				);
				dispatch('oc:location-denied', {
					message: 'Location permission is blocked in browser settings.',
					code: 'denied',
				});
			}
			locationStore.set({ status: 'denied' });
			setButtonVisible(allowButtonEl, true);
			return;
		}

		// prompt or unknown: fetch IP location silently without triggering browser geolocation prompt
		if (!cached) {
			try {
				const ipCoords = await fetchLocationFromIP();
				onSuccess(ipCoords, 'auto');
			} catch (error) {
				// Fallback to default coords (New York) silently if IP fetch fails
				const DEFAULT_COORDS = { latitude: 40.7128, longitude: -74.006, accuracy: null };
				cacheCoords(DEFAULT_COORDS);
				onSuccess(DEFAULT_COORDS, 'auto');
			}
		}
	}

	function bindButton(button: HTMLButtonElement | null | undefined, handler: () => void) {
		button?.addEventListener('click', handler);
	}

	const requestFromUser = () => {
		void fetchLocation(true);
	};

	bindButton(allowButtonEl, requestFromUser);
	bindButton(allowLocationGlobal, requestFromUser);
	bindButton(retryButtonEl, requestFromUser);
	bindButton(allowLocationAlert, requestFromUser);

	// Listen for "Use My Location" request from the search bar
	document.addEventListener('oc:request-geolocation', () => {
		void fetchLocation(true);
	});

	// Dismiss alert banner
	dismissLocationAlert?.addEventListener('click', () => {
		if (alertBanner) {
			alertBanner.classList.add('hidden');
		}
	});

	watchPermissionChanges((next: GeoPermission) => {
		if (next === 'granted' && state !== 'ready') {
			void fetchLocation(false);
		}
		if (next === 'denied' && state !== 'denied' && !readCachedCoords()) {
			applyUi(
				'denied',
				'Location is blocked for this site. Enable it in browser settings, then tap Try Allow Location Again.',
				'Blocked',
			);
		}
	});

	void init();

	return {
		requestLocation: () => fetchLocation(true),
		refresh: () => fetchLocation(false),
	};
}
