export type GeoCoords = {
	latitude: number;
	longitude: number;
	accuracy: number | null;
};

export type GeoState =
	| { status: 'idle' }
	| { status: 'detecting' }
	| { status: 'ready'; coords: GeoCoords }
	| { status: 'denied' }
	| { status: 'unsupported' }
	| { status: 'error'; message: string };

const geoOptions: PositionOptions = {
	enableHighAccuracy: false,
	maximumAge: 300_000,
	timeout: 12_000,
};

export function formatCoords(coords: GeoCoords): string {
	return `Lat ${coords.latitude.toFixed(5)}, Lon ${coords.longitude.toFixed(5)}`;
}

export function requestLocation(): Promise<GeoCoords> {
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator)) {
			reject(new Error('Geolocation is not supported in this browser.'));
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy ?? null,
				});
			},
			(error) => {
				const message =
					error.code === error.PERMISSION_DENIED
						? 'Location permission was not granted.'
						: error.code === error.TIMEOUT
							? 'Location request timed out.'
							: 'Could not read your location.';
				reject(new Error(message));
			},
			geoOptions,
		);
	});
}

export function watchLocation(onUpdate: (coords: GeoCoords) => void): number | null {
	if (!('geolocation' in navigator)) return null;

	return navigator.geolocation.watchPosition(
		(position) => {
			onUpdate({
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
				accuracy: position.coords.accuracy ?? null,
			});
		},
		() => {},
		geoOptions,
	);
}
