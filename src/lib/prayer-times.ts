// @ts-expect-error suncalc ships without bundled types
import SunCalc from 'suncalc';

const POSSIBLE_ANGLES = [15, 17, 17.5, 18, 18.2, 18.5, 19.5];
POSSIBLE_ANGLES.forEach(angle => {
    SunCalc.addTime(-angle, `fajr${angle}`, `isha${angle}`);
});

function radToDeg(rad: number): number {
    return rad * 180 / Math.PI;
}

function degToRad(deg: number): number {
    return deg * Math.PI / 180;
}

export type CalculationMethod = {
    id: string;
    name: string;
    fajrAngle: number;
    ishaAngle: number;
    ishaMinutes: number | null;
};

export const CALCULATION_METHODS: CalculationMethod[] = [
    { id: 'mwl', name: 'Muslim World League', fajrAngle: 18, ishaAngle: 17, ishaMinutes: null },
    { id: 'isna', name: 'ISNA', fajrAngle: 15, ishaAngle: 15, ishaMinutes: null },
    { id: 'egypt', name: 'Egyptian General Authority', fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutes: null },
    { id: 'karachi', name: 'Karachi (UI Sindh)', fajrAngle: 18, ishaAngle: 18, ishaMinutes: null },
    { id: 'umm-al-qura', name: 'Umm al-Qura, Makkah', fajrAngle: 18.5, ishaAngle: 0, ishaMinutes: 90 },
    { id: 'dubai', name: 'Dubai', fajrAngle: 18.2, ishaAngle: 18.2, ishaMinutes: null },
    { id: 'moonsighting', name: 'Moonsighting Committee', fajrAngle: 18, ishaAngle: 18, ishaMinutes: null },
];

export type PrayerTimesResult = {
    fajr: Date;
    dhuhr: Date;
    asr: Date;
    maghrib: Date;
    isha: Date;
    sunrise: Date;
    nextPrayer: { name: string; time: Date } | null;
    ishaMethod: 'angle' | 'minutes';
};

export function getPrayerTimes(
    date: Date,
    lat: number,
    lng: number,
    methodId = 'mwl',
    hanafi = false,
): PrayerTimesResult {
    const method = CALCULATION_METHODS.find((m) => m.id === methodId) || CALCULATION_METHODS[0];
    const times = SunCalc.getTimes(date, lat, lng);

    const dhuhr = times.solarNoon;
    const maghrib = times.sunset;
    const sunrise = times.sunrise;

    const fajrKey = `fajr${method.fajrAngle}`;
    const fajr = times[fajrKey] || new Date(times.nightEnd || times.dawn);

    let isha: Date;
    let ishaMethod: 'angle' | 'minutes' = 'angle';
    if (method.ishaMinutes !== null) {
        isha = new Date(maghrib.getTime() + method.ishaMinutes * 60_000);
        ishaMethod = 'minutes';
    } else {
        const ishaKey = `isha${method.ishaAngle}`;
        isha = times[ishaKey] || new Date(times.night || times.dusk);
    }

    const asr = getAsrTime(date, lat, lng, hanafi);

    const now = new Date();
    const prayers: { name: string; time: Date }[] = [
        { name: 'Fajr', time: fajr },
        { name: 'Dhuhr', time: dhuhr },
        { name: 'Asr', time: asr },
        { name: 'Maghrib', time: maghrib },
        { name: 'Isha', time: isha },
    ];

    let nextPrayer: { name: string; time: Date } | null = null;
    for (const p of prayers) {
        if (p.time > now) {
            nextPrayer = p;
            break;
        }
    }

    if (!nextPrayer) {
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTimes = getPrayerTimes(tomorrow, lat, lng, methodId, hanafi);
        nextPrayer = { name: 'Fajr', time: tomorrowTimes.fajr };
    }

    return {
        fajr,
        dhuhr,
        asr,
        maghrib,
        isha,
        sunrise,
        nextPrayer,
        ishaMethod,
    };
}

function getAsrTime(date: Date, lat: number, lng: number, hanafi = false): Date {
    const times = SunCalc.getTimes(date, lat, lng);
    const noon = times.solarNoon;
    const sunset = times.sunset;

    const noonAlt = radToDeg(SunCalc.getPosition(noon, lat, lng).altitude);
    const factor = hanafi ? 2 : 1;
    const tanNoon = Math.tan(degToRad(Math.abs(noonAlt)));
    const asrAlt = radToDeg(Math.atan(1 / (factor + tanNoon)));

    if (asrAlt >= noonAlt) return new Date(noon);

    const lo = noon.getTime();
    const hi = sunset.getTime();
    let loMs = lo;
    let hiMs = hi;

    for (let i = 0; i < 50; i++) {
        const mid = (loMs + hiMs) / 2;
        const midDate = new Date(mid);
        const alt = radToDeg(SunCalc.getPosition(midDate, lat, lng).altitude);
        if (Math.abs(alt - asrAlt) < 0.05) return midDate;
        if (alt > asrAlt) {
            loMs = mid;
        } else {
            hiMs = mid;
        }
    }
    return new Date((loMs + hiMs) / 2);
}

export function formatPrayerTime(date: Date | undefined): string {
    if (!date || Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatRemaining(target: Date | null): string {
    if (!target || Number.isNaN(target.getTime())) return '—';
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'Now';
    const totalMinutes = Math.round(diff / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}
