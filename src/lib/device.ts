export type DeviceProfile = {
	shortSide: number;
	longSide: number;
	diagonalPx: number;
	diagonalInches: number | null;
	dpr: number;
	fitLabel: 'Mobile Fit' | 'Tablet Fit' | 'Desktop Fit';
	hasOrientationApi: boolean;
	likelySensorDevice: boolean;
};

/** Estimate physical screen diagonal from viewport + DPR (browser heuristic). */
export function getDeviceProfile(): DeviceProfile {
	const width = window.screen?.width ?? window.innerWidth;
	const height = window.screen?.height ?? window.innerHeight;
	const dpr = window.devicePixelRatio || 1;
	const shortSide = Math.min(width, height);
	const longSide = Math.max(width, height);
	const diagonalPx = Math.round(Math.hypot(width * dpr, height * dpr));

	// CSS reference pixel density is ~96dpi; multiply by DPR for a rough physical estimate.
	const estimatedPpi = 96 * dpr;
	const diagonalInches =
		estimatedPpi > 0 ? Math.round((diagonalPx / estimatedPpi) * 10) / 10 : null;

	const fitLabel =
		shortSide < 600 ? 'Mobile Fit' : shortSide < 960 ? 'Tablet Fit' : 'Desktop Fit';

	const hasOrientationApi = 'DeviceOrientationEvent' in window;
	const likelySensorDevice =
		/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || shortSide < 760;

	return {
		shortSide,
		longSide,
		diagonalPx,
		diagonalInches,
		dpr,
		fitLabel,
		hasOrientationApi,
		likelySensorDevice,
	};
}

export function formatDiagonal(profile: DeviceProfile): string {
	if (profile.diagonalInches != null) {
		return `${profile.diagonalInches}" (~${profile.diagonalPx}px)`;
	}
	return `${profile.diagonalPx}px`;
}

export function formatDeviceSummary(profile: DeviceProfile): string {
	return `${profile.fitLabel} · ${formatDiagonal(profile)} · ${profile.dpr.toFixed(2)}x DPR`;
}
