import { searchCities, getCityFromCoords, type SearchResult } from '../lib/geo';
import { locationStore } from '../lib/location-store';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentResults: SearchResult[] = [];
let selectedIndex = -1;

export function mountLocationSearch() {
	const input = document.querySelector<HTMLInputElement>('#locationSearchInput');
	const dropdown = document.querySelector<HTMLDivElement>('#locationSearchDropdown');
	const useGeoBtn = document.querySelector<HTMLButtonElement>('#useGeolocationBtn');
	const searchContainer = document.querySelector<HTMLDivElement>('#locationSearchWrapper');

	if (!input || !dropdown || !searchContainer) return;

	function showDropdown() {
		dropdown.classList.remove('hidden');
	}

	function hideDropdown() {
		dropdown.classList.add('hidden');
		currentResults = [];
		selectedIndex = -1;
	}

	function renderResults(results: SearchResult[]) {
		dropdown.innerHTML = '';

		if (results.length === 0) {
			if (input.value.trim().length >= 2) {
				const empty = document.createElement('div');
				empty.className = 'px-4 py-3 text-xs text-body font-mono';
				empty.textContent = 'No locations found. Try a different search.';
				dropdown.appendChild(empty);
			}
			return;
		}

		results.forEach((result, i) => {
			const item = document.createElement('button');
			item.type = 'button';
			item.className = `w-full text-left px-4 py-2.5 text-xs font-mono transition-colors hover:bg-canvas-soft-2 ${
				i === selectedIndex ? 'bg-canvas-soft-2' : ''
			}`;
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', String(i === selectedIndex));

			const nameSpan = document.createElement('span');
			nameSpan.className = 'block text-ink font-medium truncate';
			nameSpan.textContent = result.displayName.split(',')[0];

			const detailSpan = document.createElement('span');
			detailSpan.className = 'block text-body truncate mt-0.5';
			const parts = result.displayName.split(',').slice(1).join(',').trim();
			detailSpan.textContent = parts || result.displayName;

			item.appendChild(nameSpan);
			item.appendChild(detailSpan);

			item.addEventListener('click', () => selectResult(result));
			item.addEventListener('mousedown', (e) => e.preventDefault());
			dropdown.appendChild(item);
		});
	}

	async function selectResult(result: SearchResult) {
		hideDropdown();
		input.value = result.displayName.split(',')[0];
		searchContainer.dataset.locationSet = 'true';

		let cityName = result.displayName.split(',')[0];
		try {
			const city = await getCityFromCoords(result.latitude, result.longitude);
			if (city) cityName = city;
		} catch {}

		locationStore.setLocation(
			{ latitude: result.latitude, longitude: result.longitude },
			'manual',
			cityName,
		);
		locationStore.setSelectedCity(cityName);

		// Update global bar
		const globalText = document.querySelector('#globalLocationText');
		if (globalText) globalText.textContent = `📍 ${cityName}`;

		// Hide the global Allow Location button since we have a location now
		const allowGlobal = document.querySelector<HTMLButtonElement>('#allowLocationGlobal');
		if (allowGlobal) allowGlobal.hidden = true;

		// Update per-page city display
		const cityEl = document.querySelector('#locationCity');
		if (cityEl) cityEl.textContent = cityName;

		// Update per-page coordinates & message
		const coordLabel = `${result.latitude.toFixed(4)}°, ${result.longitude.toFixed(4)}°`;
		const coordsEl = document.querySelector('#locationCoords');
		if (coordsEl) coordsEl.textContent = coordLabel;

		const messageEl =
			document.querySelector('#locationResult') ??
			document.querySelector('#sunLocationNote') ??
			document.querySelector('#moonLocationNote');
		if (messageEl) messageEl.textContent = `Location: ${cityName} (${coordLabel})`;

		// Hide per-page allow/retry buttons
		const allowBtn = document.querySelector<HTMLButtonElement>('#allowLocation');
		if (allowBtn) allowBtn.hidden = true;
		const retryBtn = document.querySelector<HTMLButtonElement>('#retryLocation');
		if (retryBtn) retryBtn.hidden = true;

		// Hide alert banner
		const alertBanner = document.querySelector('#locationAlertBanner');
		if (alertBanner) alertBanner.classList.add('hidden');
	}

	function doSearch(query: string) {
		if (query.trim().length < 2) {
			hideDropdown();
			return;
		}
		searchCities(query).then((results) => {
			currentResults = results;
			selectedIndex = -1;
			if (results.length > 0) {
				renderResults(results);
				showDropdown();
			} else {
				renderResults([]);
				showDropdown();
			}
		});
	}

	input.addEventListener('input', () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		searchContainer.dataset.locationSet = 'false';
		debounceTimer = setTimeout(() => doSearch(input.value), 300);
	});

	input.addEventListener('focus', () => {
		if (currentResults.length > 0) showDropdown();
	});

	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
			renderResults(currentResults);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
			renderResults(currentResults);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
				selectResult(currentResults[selectedIndex]);
			} else if (currentResults.length > 0) {
				selectResult(currentResults[0]);
			}
		} else if (e.key === 'Escape') {
			hideDropdown();
		}
	});

	document.addEventListener('click', (e) => {
		if (!searchContainer.contains(e.target as Node)) {
			hideDropdown();
		}
	});

	useGeoBtn?.addEventListener('click', () => {
		locationStore.clearManual();
		input.value = '';
		hideDropdown();
		document.dispatchEvent(new CustomEvent('oc:request-geolocation'));
	});

	// Restore persisted city if available
	const savedCity = locationStore.getSelectedCity();
	if (savedCity) {
		input.value = savedCity;
		searchContainer.dataset.locationSet = 'true';
	}

	// Listen for geo success to update input
	document.addEventListener('oc:location-city-ready', ((e: CustomEvent) => {
		const { city } = e.detail;
		if (city && locationStore.get().source !== 'manual') {
			input.value = city;
			searchContainer.dataset.locationSet = 'false';
		}
	}) as EventListener);

	return {
		search: doSearch,
	};
}
