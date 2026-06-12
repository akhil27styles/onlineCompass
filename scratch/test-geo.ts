import { fetchLocationFromIP } from './src/lib/geo.ts';

async function test() {
	console.log('Testing fetchLocationFromIP...');
	try {
		const coords = await fetchLocationFromIP();
		console.log('Success!', coords);
	} catch (err) {
		console.error('Error occurred:', err);
	}
}

test();
