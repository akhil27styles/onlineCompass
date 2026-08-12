export type LocationState = {
	coords: { latitude: number; longitude: number } | null;
	city: string | null;
	source: 'browser' | 'ip' | 'manual' | null;
	status: 'loading' | 'ready' | 'denied' | 'error' | 'unsupported' | 'insecure';
};

type Listener = (state: LocationState) => void;

const MANUAL_LOCATION_KEY = 'oc:manual-location';
const SELECTED_CITY_KEY = 'oc:selected-city';

function loadPersisted(): LocationState | null {
	try {
		const raw = localStorage.getItem(MANUAL_LOCATION_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as LocationState;
	} catch {
		return null;
	}
}

function persist(state: LocationState): void {
	if (state.source === 'manual') {
		localStorage.setItem(MANUAL_LOCATION_KEY, JSON.stringify(state));
	} else {
		localStorage.removeItem(MANUAL_LOCATION_KEY);
	}
}

function createStore() {
	const persisted = loadPersisted();
	let state: LocationState = persisted ?? {
		coords: null,
		city: null,
		source: null,
		status: 'loading',
	};
	const listeners = new Set<Listener>();

	return {
		get: () => state,

		set(partial: Partial<LocationState>) {
			state = { ...state, ...partial };
			persist(state);
			listeners.forEach((l) => l(state));
		},

		setLocation(coords: { latitude: number; longitude: number }, source: 'browser' | 'ip' | 'manual', city?: string) {
			state = { coords, city: city ?? null, source, status: 'ready' };
			persist(state);
			listeners.forEach((l) => l(state));
			document.dispatchEvent(new CustomEvent('oc:location-ready', { detail: { coords, source } }));
			if (city) {
				document.dispatchEvent(new CustomEvent('oc:location-city-ready', { detail: { city, coords } }));
			}
		},

		clearManual() {
			localStorage.removeItem(MANUAL_LOCATION_KEY);
			if (state.source === 'manual') {
				state = { coords: null, city: null, source: null, status: 'loading' };
				listeners.forEach((l) => l(state));
			}
		},

		getSelectedCity(): string | null {
			try {
				return localStorage.getItem(SELECTED_CITY_KEY);
			} catch {
				return null;
			}
		},

		setSelectedCity(city: string) {
			try {
				localStorage.setItem(SELECTED_CITY_KEY, city);
			} catch {}
		},

		subscribe(listener: Listener) {
			listeners.add(listener);
			listener(state);
			return () => listeners.delete(listener);
		},
	};
}

export const locationStore = createStore();
