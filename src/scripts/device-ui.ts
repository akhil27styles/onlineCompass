import { formatDeviceSummary, formatDiagonal, getDeviceProfile } from '../lib/device';
import { formatCoords, requestLocation } from '../lib/geo';

function setText(element: Element | null, value: string) {
	if (element) element.textContent = value;
}

export function mountDeviceUi(options?: { onLocation?: (coords: { latitude: number; longitude: number }) => void }) {
	const deviceBadge = document.querySelector('#deviceBadge');
	const mobileDeviceSummary = document.querySelector('#mobileDeviceSummary');
	const screenDiagonal = document.querySelector('#screenDiagonal');
	const pixelRatio = document.querySelector('#pixelRatio');
	const locationCoords = document.querySelector('#locationCoords');

	function refreshDevice() {
		const profile = getDeviceProfile();
		setText(deviceBadge, profile.fitLabel);
		setText(mobileDeviceSummary, formatDeviceSummary(profile));
		setText(screenDiagonal, formatDiagonal(profile));
		setText(pixelRatio, `${profile.dpr.toFixed(2)}x`);
		return profile;
	}

	async function detectLocation() {
		setText(locationCoords, 'Detecting…');
		try {
			const coords = await requestLocation();
			const label = formatCoords(coords);
			setText(locationCoords, label);
			options?.onLocation?.(coords);
			return coords;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Location unavailable';
			setText(locationCoords, 'Not available');
			document.dispatchEvent(
				new CustomEvent('oc:location-denied', { detail: { message } }),
			);
			return null;
		}
	}

	refreshDevice();
	window.addEventListener('resize', refreshDevice);
	window.visualViewport?.addEventListener('resize', refreshDevice);

	void detectLocation();

	return { refreshDevice, detectLocation };
}
