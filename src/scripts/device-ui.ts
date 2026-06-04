import { formatDeviceSummary, formatDiagonal, getDeviceProfile } from '../lib/device';
import { mountLocationManager } from './location-manager';

function setText(element: Element | null, value: string) {
	if (element) element.textContent = value;
}

export function mountDeviceUi(options?: { onLocation?: (coords: { latitude: number; longitude: number }) => void }) {
	const deviceBadge = document.querySelector('#deviceBadge');
	const mobileDeviceSummary = document.querySelector('#mobileDeviceSummary');
	const screenDiagonal = document.querySelector('#screenDiagonal');
	const pixelRatio = document.querySelector('#pixelRatio');

	function refreshDevice() {
		const profile = getDeviceProfile();
		setText(deviceBadge, profile.fitLabel);
		setText(mobileDeviceSummary, formatDeviceSummary(profile));
		setText(screenDiagonal, formatDiagonal(profile));
		setText(pixelRatio, `${profile.dpr.toFixed(2)}x`);
		return profile;
	}

	refreshDevice();
	window.addEventListener('resize', refreshDevice);
	window.visualViewport?.addEventListener('resize', refreshDevice);

	const locationManager = mountLocationManager({
		onLocation: options?.onLocation,
		coordsEl: document.querySelector('#locationCoords'),
		messageEl:
			document.querySelector('#locationResult') ??
			document.querySelector('#sunLocationNote') ??
			document.querySelector('#moonLocationNote'),
		allowButtonEl:
			document.querySelector<HTMLButtonElement>('#allowLocation') ??
			document.querySelector<HTMLButtonElement>('#allowLocationGlobal'),
		retryButtonEl: document.querySelector<HTMLButtonElement>('#retryLocation'),
	});

	return { refreshDevice, ...locationManager };
}
