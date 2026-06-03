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

	let state: UiState = 'checking';
	let inFlight = false;

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
	}

	function onSuccess(coords: GeoCoords, source: 'auto' | 'user') {
		const label = formatCoords(coords);
		applyUi(
			'ready',
			`${label}. Used for sun, moon, and context — never uploaded to a server.`,
			label,
		);
		onLocation?.(coords);
		dispatch('oc:location-ready', { coords, source });
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
					'Location needs a secure connection (HTTPS). Compass still works; sun and moon need HTTPS.',
				),
			);
			return;
		}

		const cached = readCachedCoords();
		if (cached) {
			setText(coordsEl, formatCoords(cached));
		}

		const permission = await queryGeolocationPermission();

		if (permission === 'granted') {
			await fetchLocation(false);
			return;
		}

		if (permission === 'denied') {
			applyUi(
				'denied',
				'Location is blocked for this site. In browser settings, set Location to Allow for this site, then tap Try Allow Location Again.',
				'Blocked',
			);
			dispatch('oc:location-denied', {
				message: 'Location permission is blocked in browser settings.',
				code: 'denied',
			});
			setButtonVisible(allowButtonEl, true);
			return;
		}

		// prompt or unknown: try silent read (works when permission was granted before or on some desktops)
		const coords = await fetchLocation(false);
		if (!coords) {
			// fetchLocation already set needs-permission UI when appropriate
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

	function bindButton(button: HTMLButtonElement | null | undefined, handler: () => void) {
		button?.addEventListener('click', handler);
	}

	bindButton(allowButtonEl, () => {
		void fetchLocation(true);
	});

	bindButton(retryButtonEl, () => {
		void fetchLocation(true);
	});

	watchPermissionChanges((next: GeoPermission) => {
		if (next === 'granted' && state !== 'ready') {
			void fetchLocation(false);
		}
		if (next === 'denied' && state !== 'denied') {
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
