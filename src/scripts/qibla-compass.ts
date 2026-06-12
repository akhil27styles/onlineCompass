import { getDeviceProfile } from '../lib/device';
import { calculateQibla } from '../lib/geo';

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function normalizeHeading(value: number) {
	return ((value % 360) + 360) % 360;
}

function getCardinalDirection(heading: number) {
	return directions[Math.round(heading / 45) % 8];
}

function setText(element: Element | null, value: string) {
	if (element) element.textContent = value;
}

export function mountQiblaCompass() {
	const rose = document.querySelector('#compassRose');
	const enableButton = document.querySelector('#enableCompass');
	const demoButton = document.querySelector('#demoMode');
	const headingOutput = document.querySelector('#headingDegrees');
	const cardinalOutput = document.querySelector('#cardinalDirection');
	const statusMessage = document.querySelector('#statusMessage');
	const sensorSupport = document.querySelector('#sensorSupport');
	const qiblaNeedle = document.querySelector('#qiblaNeedle');
	
	const qiblaBearingVal = document.querySelector('#qiblaBearingVal');
	const qiblaDistanceVal = document.querySelector('#qiblaDistanceVal');
	const alignmentHelp = document.querySelector('#alignmentHelp');

	let currentHeading = 0;
	let qiblaBearing: number | null = null;
	let demoTimer: number | undefined;
	let sensorTimeout: number | undefined;
	let hasLiveHeading = false;

	function updateHeading(heading: number, source = 'Live') {
		currentHeading = normalizeHeading(heading);
		if (rose instanceof HTMLElement) {
			rose.style.setProperty('--heading', currentHeading.toFixed(1));
		}
		setText(headingOutput, Math.round(currentHeading).toString());
		setText(cardinalOutput, getCardinalDirection(currentHeading));
		updateQiblaAlignment();
		
		if (source === 'Demo') {
			setText(statusMessage, 'Demo mode running. Rotate your device or try on a phone for live sensor data.');
			setText(sensorSupport, 'Demo');
		}
	}

	function updateQiblaAlignment() {
		if (qiblaBearing === null) {
			setText(alignmentHelp, 'Waiting for your location to calculate Qibla direction…');
			return;
		}

		// Calculate relative rotation to Mecca
		const delta = ((qiblaBearing - currentHeading + 540) % 360) - 180;
		
		let message = '';
		if (Math.abs(delta) < 4) {
			message = '🕋 You are aligned with the Qibla!';
			if (alignmentHelp) {
				alignmentHelp.classList.add('text-emerald-500', 'font-bold');
				alignmentHelp.classList.remove('text-body');
			}
		} else {
			const turnDirection = delta > 0 ? 'right' : 'left';
			message = `Turn ${turnDirection} ${Math.round(Math.abs(delta))}° to face Mecca.`;
			if (alignmentHelp) {
				alignmentHelp.classList.remove('text-emerald-500', 'font-bold');
				alignmentHelp.classList.add('text-body');
			}
		}

		setText(alignmentHelp, message);
	}

	function handleLocation(lat: number, lng: number) {
		const qibla = calculateQibla(lat, lng);
		qiblaBearing = qibla.bearing;

		// Show Qibla needle and update static values
		if (qiblaNeedle instanceof HTMLElement) {
			qiblaNeedle.style.display = 'block';
			qiblaNeedle.style.setProperty('--qibla-angle', `${qiblaBearing.toFixed(1)}deg`);
		}

		setText(qiblaBearingVal, `${Math.round(qiblaBearing)}°`);
		setText(
			qiblaDistanceVal,
			`${Math.round(qibla.distanceKm).toLocaleString()} km / ${Math.round(qibla.distanceMiles).toLocaleString()} mi`
		);

		updateQiblaAlignment();
	}

	function headingFromEvent(event: DeviceOrientationEvent) {
		if (typeof event.webkitCompassHeading === 'number') {
			return event.webkitCompassHeading;
		}
		if (typeof event.alpha === 'number') {
			return 360 - event.alpha;
		}
		return null;
	}

	function handleOrientation(event: DeviceOrientationEvent) {
		const heading = headingFromEvent(event);
		if (heading === null) {
			setText(statusMessage, 'Sensor active, but heading reading is unavailable on this device.');
			return;
		}
		hasLiveHeading = true;
		window.clearTimeout(sensorTimeout);
		window.clearInterval(demoTimer);
		updateHeading(heading);
		setText(sensorSupport, 'Live');
		setText(statusMessage, 'Qibla compass is live. Hold device flat away from magnetic objects.');
	}

	async function enableCompass() {
		if (!('DeviceOrientationEvent' in window)) {
			setText(statusMessage, 'Compass sensors not supported in this browser. Try on a mobile device.');
			return;
		}

		const orientationEvent = window.DeviceOrientationEvent;
		const permissionRequester = orientationEvent?.requestPermission;

		try {
			if (typeof permissionRequester === 'function') {
				const permission = await permissionRequester.call(orientationEvent);
				if (permission !== 'granted') {
					setText(statusMessage, 'Sensor permission denied. Please allow motion access in browser settings.');
					return;
				}
			}
			hasLiveHeading = false;
			window.clearInterval(demoTimer);
			window.clearTimeout(sensorTimeout);
			window.addEventListener('deviceorientationabsolute', handleOrientation, true);
			window.addEventListener('deviceorientation', handleOrientation, true);
			setText(sensorSupport, 'Listening');
			setText(
				statusMessage,
				'Connecting to magnetometer… (Use Try Demo Heading if testing on a laptop/desktop).'
			);
			sensorTimeout = window.setTimeout(() => {
				if (!hasLiveHeading) {
					setText(sensorSupport, 'No Reading');
					setText(
						statusMessage,
						'No active heading data detected. Open this on a smartphone or click Try Demo Heading.'
					);
				}
			}, 3000);
		} catch {
			setText(statusMessage, 'Motion permission request failed. Reload the page and retry.');
		}
	}

	function startDemoMode() {
		window.clearInterval(demoTimer);
		window.clearTimeout(sensorTimeout);
		let demoHeading = currentHeading;
		demoTimer = window.setInterval(() => {
			demoHeading = normalizeHeading(demoHeading + 1.2);
			updateHeading(demoHeading, 'Demo');
		}, 80);
	}

	function refreshSensorLabel() {
		const profile = getDeviceProfile();
		setText(
			sensorSupport,
			profile.hasOrientationApi ? (profile.likelySensorDevice ? 'Ready' : 'Needs Mobile') : 'No Sensor'
		);
	}

	enableButton?.addEventListener('click', enableCompass);
	demoButton?.addEventListener('click', startDemoMode);
	refreshSensorLabel();
	updateHeading(0);

	// Register page location updates
	document.addEventListener('oc:location-ready', (event) => {
		const detail = (event as CustomEvent<{ coords: { latitude: number; longitude: number } }>).detail;
		handleLocation(detail.coords.latitude, detail.coords.longitude);
	});

	document.addEventListener('oc:location-updated', (event) => {
		const detail = (event as CustomEvent<{ coords: { latitude: number; longitude: number } }>).detail;
		handleLocation(detail.coords.latitude, detail.coords.longitude);
	});

	return { refreshSensorLabel, handleLocation };
}
