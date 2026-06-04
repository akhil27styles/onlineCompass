import {
	type GeoCoords,
	type GeoPermission,
	GeoError,
	formatCoords,
	isGeolocationSupported,
	isSecureContextForGeo,
	queryGeolocationPermission,
	readCachedCoords,
	requestLocation,
	watchPermissionChanges,
	getCityFromCoords,
	cacheCoords,
} from '../lib/geo';

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
	const toggleEditBtn = document.querySelector('#toggleEditLocation');
	const editForm = document.querySelector<HTMLFormElement>('#editLocationForm');
	const inputLat = document.querySelector<HTMLInputElement>('#inputLat');
	const inputLng = document.querySelector<HTMLInputElement>('#inputLng');
	const cancelEditBtn = document.querySelector('#cancelEditLocation');
	const cityEl = document.querySelector('#locationCity');

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
		if (cityEl) cityEl.textContent = 'Locating city…';
		setText(globalLocationText, 'Auto-detecting your location…');
		const city = await getCityFromCoords(coords.latitude, coords.longitude);
		if (city) {
			if (cityEl) cityEl.textContent = city;
			setText(messageEl, `Location: ${city} (${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°)`);
			setText(globalLocationText, `📍 ${city}`);
			syncGlobalBar('ready', `📍 ${city}`);
			dispatch('oc:location-city-ready', { city, coords });
		} else {
			if (cityEl) cityEl.textContent = 'City unknown';
			const coordsLine = formatCoords(coords);
			setText(messageEl, coordsLine);
			setText(globalLocationText, `📍 ${coordsLine}`);
			syncGlobalBar('ready', `📍 ${coordsLine}`);
		}
	}

	function onSuccess(coords: GeoCoords, source: 'auto' | 'user') {
		const label = formatCoords(coords);
		applyUi(
			'ready',
			`Lat ${coords.latitude.toFixed(4)}°, Lon ${coords.longitude.toFixed(4)}°`,
			label,
		);
		onLocation?.(coords);
		dispatch('oc:location-ready', { coords, source });
		void updateCity(coords);
	}

	function onFailure(error: unknown, preferPrompt = false) {
		if (error instanceof GeoError) {
			if (error.code === 'denied') {
				applyUi('denied', error.message, 'Blocked');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
				return;
			}
			if (error.code === 'insecure') {
				applyUi('insecure', error.message, 'HTTPS required');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
				return;
			}
			if (error.code === 'unsupported') {
				applyUi('unsupported', error.message, 'Unavailable');
				dispatch('oc:location-denied', { message: error.message, code: error.code });
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
					'Location is blocked for this site. In browser settings, set Location to Allow, then tap Try Allow Location Again.',
					'Blocked',
				);
				dispatch('oc:location-denied', {
					message: 'Location permission is blocked in browser settings.',
					code: 'denied',
				});
			}
			setButtonVisible(allowButtonEl, true);
			return;
		}

		// prompt or unknown: try silent read
		if (!cached) {
			const coords = await fetchLocation(false);
			if (!coords) {
				if (state === 'checking') {
					applyUi(
						'needs-permission',
						'Tap Allow Location Access. Your browser will ask for permission — needed for sun and moon position.',
						'Permission needed',
					);
					dispatch('oc:location-needs-permission', { message: 'User gesture required' });
				}
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

	// Collapsible Coordinate Editor Form Event Listeners
	toggleEditBtn?.addEventListener('click', () => {
		if (!editForm) return;
		editForm.classList.toggle('hidden');
		if (!editForm.classList.contains('hidden')) {
			const current = readCachedCoords();
			if (current) {
				if (inputLat) inputLat.value = current.latitude.toString();
				if (inputLng) inputLng.value = current.longitude.toString();
			}
		}
	});

	cancelEditBtn?.addEventListener('click', () => {
		editForm?.classList.add('hidden');
	});

	editForm?.addEventListener('submit', (e) => {
		e.preventDefault();
		if (!inputLat || !inputLng) return;
		const lat = parseFloat(inputLat.value);
		const lng = parseFloat(inputLng.value);
		if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			alert('Please enter valid coordinates (Latitude -90 to 90, Longitude -180 to 180).');
			return;
		}
		const newCoords: GeoCoords = {
			latitude: lat,
			longitude: lng,
			accuracy: null,
		};
		cacheCoords(newCoords);
		onSuccess(newCoords, 'user');
		editForm.classList.add('hidden');
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
