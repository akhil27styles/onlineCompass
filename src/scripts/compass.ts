import { getDeviceProfile } from '../lib/device';

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

export function mountCompass() {
	const rose = document.querySelector('#compassRose');
	const enableButton = document.querySelector('#enableCompass');
	const demoButton = document.querySelector('#demoMode');
	const headingOutput = document.querySelector('#headingDegrees');
	const cardinalOutput = document.querySelector('#cardinalDirection');
	const statusMessage = document.querySelector('#statusMessage');
	const sensorSupport = document.querySelector('#sensorSupport');
	const targetBearing = document.querySelector('#targetBearing');
	const targetBearingValue = document.querySelector('#targetBearingValue');
	const bearingHelp = document.querySelector('#bearingHelp');

	let currentHeading = 0;
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
		updateBearingHelp();
		if (source === 'Demo') {
			setText(statusMessage, 'Demo mode is running because this device may not expose compass sensors.');
			setText(sensorSupport, 'Demo');
		}
	}

	function updateBearingHelp() {
		if (!(targetBearing instanceof HTMLInputElement)) return;
		const target = Number(targetBearing.value);
		const delta = ((target - currentHeading + 540) % 360) - 180;
		const turn =
			Math.abs(delta) < 2
				? 'You are aligned with the target bearing.'
				: `Turn ${delta > 0 ? 'right' : 'left'} ${Math.round(Math.abs(delta))}° to align.`;
		setText(targetBearingValue, target.toString());
		setText(bearingHelp, turn);
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
			setText(statusMessage, 'Sensor is active, but heading data is not available on this device.');
			return;
		}
		hasLiveHeading = true;
		window.clearTimeout(sensorTimeout);
		window.clearInterval(demoTimer);
		updateHeading(heading);
		setText(sensorSupport, 'Live');
		setText(statusMessage, 'Compass is live. For best accuracy, keep the phone flat and away from metal.');
	}

	async function enableCompass() {
		if (!('DeviceOrientationEvent' in window)) {
			setText(statusMessage, 'This browser does not expose compass sensors. Demo mode is available.');
			return;
		}

		const orientationEvent = window.DeviceOrientationEvent;
		const permissionRequester = orientationEvent?.requestPermission;

		try {
			if (typeof permissionRequester === 'function') {
				const permission = await permissionRequester.call(orientationEvent);
				if (permission !== 'granted') {
					setText(statusMessage, 'Sensor permission was not granted. Check browser settings and try again.');
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
				'Listening for real compass data. On desktop, use demo mode because most computers do not have a magnetometer.',
			);
			sensorTimeout = window.setTimeout(() => {
				if (!hasLiveHeading) {
					setText(sensorSupport, 'No Reading');
					setText(
						statusMessage,
						'No live compass reading arrived. Open this page on a phone with motion permission enabled, or use Try Demo Heading.',
					);
				}
			}, 3000);
		} catch {
			setText(statusMessage, 'Compass permission failed. Try reloading the page and enabling motion access.');
		}
	}

	function startDemoMode() {
		window.clearInterval(demoTimer);
		window.clearTimeout(sensorTimeout);
		let demoHeading = currentHeading;
		demoTimer = window.setInterval(() => {
			demoHeading = normalizeHeading(demoHeading + 1.4);
			updateHeading(demoHeading, 'Demo');
		}, 80);
	}

	function refreshSensorLabel() {
		const profile = getDeviceProfile();
		setText(
			sensorSupport,
			profile.hasOrientationApi ? (profile.likelySensorDevice ? 'Ready' : 'Needs Mobile') : 'No Sensor',
		);
	}

	enableButton?.addEventListener('click', enableCompass);
	demoButton?.addEventListener('click', startDemoMode);
	targetBearing?.addEventListener('input', updateBearingHelp);
	refreshSensorLabel();
	updateHeading(0);

	return { refreshSensorLabel };
}
