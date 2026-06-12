import { readCachedCoords } from '../lib/geo';

export function setSkyAzimuth(beacon: HTMLElement | null, azimuth: number, isUp = true) {
	if (!beacon) return;
	beacon.style.setProperty('--azimuth', `${azimuth}deg`);
	beacon.classList.toggle('sky-beacon-below', !isUp);
}

export function bindSkyDialFromLocation(
	beaconSelector: string,
	onCoords: (coords: { latitude: number; longitude: number }) => void,
) {
	const beacon = document.querySelector<HTMLElement>(beaconSelector);

	const cached = readCachedCoords();
	if (cached) {
		setTimeout(() => onCoords(cached), 0);
	}

	document.addEventListener('oc:location-ready', (event) => {
		const detail = (event as CustomEvent<{ coords: { latitude: number; longitude: number } }>).detail;
		onCoords(detail.coords);
	});

	return beacon;
}
