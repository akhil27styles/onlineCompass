export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'oc:theme';

export function getInitialTheme(): Theme {
	if (typeof window === 'undefined') return 'dark';
	
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') return stored;
	} catch {
		// localStorage not available
	}
	
	// Default to dark theme
	return 'dark';
}

export function saveTheme(theme: Theme): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Ignore quota/private mode errors
	}
}

export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	
	document.documentElement.setAttribute('data-theme', theme);
	saveTheme(theme);
}

export function toggleTheme(): Theme {
	const current = getInitialTheme();
	const next = current === 'light' ? 'dark' : 'light';
	applyTheme(next);
	return next;
}
