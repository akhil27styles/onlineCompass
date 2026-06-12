import { getDeviceProfile } from '../lib/device';

const directions16 = [
	'N', 'NNE', 'NE', 'ENE',
	'E', 'ESE', 'SE', 'SSE',
	'S', 'SSW', 'SW', 'WSW',
	'W', 'WNW', 'NW', 'NNW'
];

function normalizeHeading(value: number) {
	return ((value % 360) + 360) % 360;
}

function getCardinal16(heading: number) {
	return directions16[Math.round(heading / 22.5) % 16];
}

function setText(element: Element | null, value: string) {
	if (element) element.textContent = value;
}

export function mountWindCompass() {
	const rose = document.querySelector('#compassRose');
	const enableButton = document.querySelector('#enableCompass');
	const demoButton = document.querySelector('#demoMode');
	const headingOutput = document.querySelector('#headingDegrees');
	const cardinalOutput = document.querySelector('#cardinalDirection');
	const statusMessage = document.querySelector('#statusMessage');
	const sensorSupport = document.querySelector('#sensorSupport');
	const windNeedle = document.querySelector('#windNeedle');
	
	const windSpeedVal = document.querySelector('#windSpeedVal');
	const windDirVal = document.querySelector('#windDirVal');
	const alignmentHelp = document.querySelector('#alignmentHelp');

	let currentHeading = 0;
	let windDirection: number | null = null;
	let demoTimer: number | undefined;
	let sensorTimeout: number | undefined;
	let hasLiveHeading = false;

	// Simple caching variables
	let lastFetchTime = 0;
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	function updateHeading(heading: number, source = 'Live') {
		currentHeading = normalizeHeading(heading);
		if (rose instanceof HTMLElement) {
			rose.style.setProperty('--heading', currentHeading.toFixed(1));
		}
		setText(headingOutput, Math.round(currentHeading).toString());
		setText(cardinalOutput, getCardinal16(currentHeading));
		updateWindAlignment();
		
		if (source === 'Demo') {
			setText(statusMessage, 'Demo mode is active. Rotate device or try on a phone for live sensor data.');
			setText(sensorSupport, 'Demo');
		}
	}

	function updateWindAlignment() {
		if (windDirection === null) {
			setText(alignmentHelp, 'Waiting for local wind speed and direction data…');
			return;
		}

		// Calculate relative wind angle (where wind is coming from relative to phone top)
		// e.g. if wind is from 90° (East) and phone is facing 0° (North), wind comes from 90° (Right)
		const delta = ((windDirection - currentHeading + 540) % 360) - 180;
		const absDelta = Math.abs(delta);
		
		let message = '';
		if (absDelta < 20) {
			message = '💨 You are facing directly into the wind.';
			if (alignmentHelp) {
				alignmentHelp.classList.add('text-sky-500', 'font-bold');
				alignmentHelp.classList.remove('text-body');
			}
		} else if (absDelta > 160) {
			message = '💨 The wind is blowing directly from behind you.';
			if (alignmentHelp) {
				alignmentHelp.classList.add('text-sky-500', 'font-bold');
				alignmentHelp.classList.remove('text-body');
			}
		} else {
			const side = delta > 0 ? 'right' : 'left';
			message = `Wind is blowing from your ${side} (${Math.round(absDelta)}° offset).`;
			if (alignmentHelp) {
				alignmentHelp.classList.remove('text-sky-500', 'font-bold');
				alignmentHelp.classList.add('text-body');
			}
		}

		setText(alignmentHelp, message);
	}

	async function fetchWindData(lat: number, lng: number) {
		const now = Date.now();
		if (now - lastFetchTime < CACHE_TTL && windDirection !== null) {
			return; // Use existing cached data
		}

		try {
			const res = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m`
			);
			if (!res.ok) throw new Error(`HTTP error ${res.status}`);
			const data = await res.json();

			if (data.current) {
				const speedKmh = data.current.wind_speed_10m;
				const directionDeg = data.current.wind_direction_10m;

				windDirection = directionDeg;
				lastFetchTime = now;

				// Show wind needle and update values
				if (windNeedle instanceof HTMLElement) {
					windNeedle.style.display = 'block';
					windNeedle.style.setProperty('--wind-angle', `${windDirection.toFixed(1)}deg`);
				}

				const speedMph = speedKmh * 0.621371;
				const speedKnots = speedKmh * 0.539957;

				setText(
					windSpeedVal,
					`${Math.round(speedKmh)} km/h (${Math.round(speedMph)} mph / ${Math.round(speedKnots)} kts)`
				);
				setText(
					windDirVal,
					`${Math.round(windDirection)}° (${getCardinal16(windDirection)})`
				);

				updateWindAlignment();
			}
		} catch (error) {
			console.error('Failed to fetch wind data:', error);
			setText(
				alignmentHelp,
				'Could not fetch live wind data. Please check your internet connection.'
			);
		}
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
			setText(statusMessage, 'Sensor active, but heading reading is unavailable.');
			return;
		}
		hasLiveHeading = true;
		window.clearTimeout(sensorTimeout);
		window.clearInterval(demoTimer);
		updateHeading(heading);
		setText(sensorSupport, 'Live');
		setText(statusMessage, 'Wind compass is live. Hold device flat away from magnetic objects.');
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

	// Register location updates
	document.addEventListener('oc:location-ready', (event) => {
		const detail = (event as CustomEvent<{ coords: { latitude: number; longitude: number } }>).detail;
		void fetchWindData(detail.coords.latitude, detail.coords.longitude);
	});

	document.addEventListener('oc:location-updated', (event) => {
		const detail = (event as CustomEvent<{ coords: { latitude: number; longitude: number } }>).detail;
		void fetchWindData(detail.coords.latitude, detail.coords.longitude);
	});

	return { refreshSensorLabel, fetchWindData };
}
