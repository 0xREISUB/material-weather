// SPDX-License-Identifier: GPL-2.0-or-later
import {t, getLocale} from './i18n.js';

// Open-Meteo WMO codes. Times from the API are Unix seconds (UTC).
export function condition(code, isDay = true) {
    let text = t('weather.unknown'), icon = 'cloud';
    if (code === 0) [text, icon] = [t('weather.clear'), isDay ? 'sun' : 'moon'];
    else if (code === 1 || code === 2) [text, icon] = [t('weather.partly'), isDay ? 'partly' : 'cloud'];
    else if (code === 3) text = t('weather.cloudy');
    else if ([45, 48].includes(code)) [text, icon] = [t('weather.fog'), 'fog'];
    else if ([51, 53, 55, 56, 57].includes(code)) [text, icon] = [t('weather.drizzle'), 'rain'];
    else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) [text, icon] = [t('weather.rain'), 'rain'];
    else if ([71, 73, 75, 77, 85, 86].includes(code)) [text, icon] = [t('weather.snow'), 'snow'];
    else if ([95, 96, 97, 99].includes(code)) [text, icon] = [t('weather.storm'), 'storm'];
    return {text, icon};
}
export function number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function temperature(value) {
    return number(value) === null ? '—' : `${Math.round(value)}°`;
}
export const MODELS = [
    {id: 'best_match', get name() { return t('model.auto'); }},
    {id: 'ecmwf_ifs', name: 'ECMWF IFS'},
    {id: 'icon_seamless', name: 'DWD ICON'},
    {id: 'gfs_seamless', name: 'NOAA GFS'},
];
export function modelName(id) {
    return MODELS.find(model => model.id === id)?.name ?? MODELS[0].name;
}
export function forecastUrl(latitude, longitude, model = 'best_match') {
    if (!MODELS.some(option => option.id === model)) model = 'best_match';
    const params = {
        latitude, longitude, timezone: 'auto', timeformat: 'unixtime', forecast_days: 5,
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
        hourly: 'temperature_2m,is_day,precipitation_probability,precipitation,rain,showers,weather_code,visibility,wind_speed_10m,wind_gusts_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        temperature_unit: 'celsius', wind_speed_unit: 'kmh', models: model,
    };
    return `https://api.open-meteo.com/v1/forecast?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
export function localDate(time, offset) {
    return new Date(time + offset * 1000).toISOString().slice(0, 10);
}
export function localTime(time, offset) {
    return new Date(time + offset * 1000).toISOString().slice(11, 16);
}
function forecastError(key) {
    const error = new Error(t(key));
    error.translationKey = key;
    return error;
}
export function parseForecast(raw, now = Date.now()) {
    const current = raw.current, hours = raw.hourly, days = raw.daily;
    if (raw.error || number(current?.temperature_2m) === null || number(current?.time) === null ||
        !Array.isArray(hours?.time) || !hours.time.length || !Array.isArray(days?.time) || !days.time.length ||
        number(raw.utc_offset_seconds) === null)
        throw forecastError('error.fields');
    if (Math.abs(current.time * 1000 - now) > 3 * 3600000)
        throw forecastError('error.stale');
    if (raw.current_units?.temperature_2m !== '°C' || raw.current_units?.wind_speed_10m !== 'km/h')
        throw forecastError('error.units');
    const hourly = hours.time.map((time, i) => ({
        time: time * 1000, code: hours.weather_code?.[i], isDay: hours.is_day?.[i] !== 0,
        temperature: number(hours.temperature_2m?.[i]),
        ...condition(hours.weather_code?.[i], hours.is_day?.[i] !== 0),
        probability: number(hours.precipitation_probability?.[i]),
        precipitation: number(hours.precipitation?.[i]),
        rain: number(hours.rain?.[i]), showers: number(hours.showers?.[i]),
        visibility: number(hours.visibility?.[i]),
        wind: number(hours.wind_speed_10m?.[i]), gusts: number(hours.wind_gusts_10m?.[i]),
    })).filter(hour => Number.isFinite(hour.time)).sort((a, b) => a.time - b.time);
    const next = hourly.find(hour => hour.time > now);
    return {
        updated: now, time: current.time * 1000, offset: raw.utc_offset_seconds,
        temperature: current.temperature_2m, code: current.weather_code, isDay: current.is_day !== 0,
        ...condition(current.weather_code, current.is_day !== 0),
        humidity: number(current.relative_humidity_2m), wind: number(current.wind_speed_10m),
        gusts: number(current.wind_gusts_10m),
        precipitation: next?.probability ?? null, hourly,
        days: days.time.slice(0, 5).map((time, i) => ({
            date: localDate(time * 1000, raw.utc_offset_seconds), code: days.weather_code?.[i],
            ...condition(days.weather_code?.[i]),
            min: number(days.temperature_2m_min?.[i]), max: number(days.temperature_2m_max?.[i]),
        })),
    };
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const ICE_CODES = [56, 57, 66, 67];
const STORM_CODES = [95, 96, 97, 99];
const fresh = (data, now) => data && now - data.updated <= 3 * HOUR;

// At 21:00 the daily outlook switches to tomorrow in the LOCATION's timezone.
export function outlookWindow(data, now = Date.now()) {
    const today = localDate(now, data.offset);
    const todayStart = Date.parse(`${today}T00:00:00Z`) - data.offset * 1000;
    const tomorrow = now >= todayStart + 21 * HOUR;
    const start = tomorrow ? todayStart + DAY : now;
    const dayStart = tomorrow ? todayStart + DAY : todayStart;
    return {start, end: dayStart + DAY, rainEnd: dayStart + 21 * HOUR,
        date: localDate(dayStart, data.offset), tomorrow, label: t(tomorrow ? 'day.tomorrow' : 'day.today')};
}

// Rain describes the preceding hour; only intervals overlapping the outlook count.
export function advice(data, now = Date.now()) {
    if (!fresh(data, now)) return [];
    const offset = data.offset;
    const window = outlookWindow(data, now);
    const prefix = window.label;
    const alerts = [];
    const rain = data.hourly.find(hour => {
        const start = hour.time - HOUR;
        return hour.time > window.start && start < window.rainEnd &&
            ((hour.rain ?? 0) + (hour.showers ?? 0) >= 0.1 ||
             (hour.probability >= 50 && !SNOW_CODES.includes(hour.code)));
    });
    if (rain) {
        const start = Math.max(window.start, rain.time - HOUR);
        const end = Math.min(window.rainEnd, rain.time);
        const likely = rain.probability >= 50 || (rain.probability == null && condition(rain.code).icon === 'rain');
        const wording = t(likely ? 'rain.likely' : 'rain.possible');
        alerts.push({icon: 'rain', title: likely ? t('advice.rain.title') : t('advice.rain.cautious'),
            summary: t('advice.summary', {day: prefix, condition: wording}),
            detail: t('advice.rain.detail', {day: prefix, start: localTime(start, offset), end: localTime(end, offset), condition: wording, probability: rain.probability == null ? '' : t('advice.probability', {value: Math.round(rain.probability)})})});
    }
    const upcoming = data.hourly.filter(hour => hour.time >= window.start && hour.time < window.end);
    const currentApplies = !window.tomorrow;
    const fog = upcoming.find(hour => [45, 48].includes(hour.code) || (hour.visibility !== null && hour.visibility < 1000));
    const currentFog = currentApplies && [45, 48].includes(data.code);
    if (currentFog || fog) {
        alerts.push({icon: 'fog', title: t('advice.fog.title'),
            summary: t(currentFog || [45, 48].includes(fog?.code) ? 'advice.fog.summary' : 'advice.visibility.summary', {day: prefix}),
            detail: currentFog ? t('advice.fog.current') :
                t([45, 48].includes(fog.code) ? 'advice.fog.detail' : 'advice.visibility.detail', {day: prefix, time: localTime(fog.time, offset)})});
    }
    const storm = upcoming.find(hour => STORM_CODES.includes(hour.code));
    if ((currentApplies && STORM_CODES.includes(data.code)) || storm)
        alerts.push({icon: 'storm', title: t('advice.storm.title'), summary: t('advice.storm.summary', {day: prefix}),
            detail: t('advice.storm.detail', {day: prefix})});
    const windy = upcoming.find(hour => (hour.wind ?? 0) >= 50 || (hour.gusts ?? 0) >= 60);
    if ((currentApplies && ((data.wind ?? 0) >= 50 || (data.gusts ?? 0) >= 60)) || windy)
        alerts.push({icon: 'storm', title: t('advice.wind.title'),
            summary: t('advice.wind.summary', {day: prefix}),
            detail: t('advice.wind.detail', {day: prefix, time: windy ? t('advice.around', {time: localTime(windy.time, offset)}) : ''})});
    if ((currentApplies && ICE_CODES.includes(data.code)) || upcoming.some(hour => ICE_CODES.includes(hour.code)))
        alerts.push({icon: 'snow', title: t('advice.ice.title'), summary: t('advice.ice.summary', {day: prefix}),
            detail: t('advice.ice.detail', {day: prefix})});
    if ((currentApplies && SNOW_CODES.includes(data.code)) || upcoming.some(hour => SNOW_CODES.includes(hour.code)))
        alerts.push({icon: 'snow', title: t('advice.snow.title'), summary: t('advice.snow.summary', {day: prefix}),
            detail: t('advice.snow.detail', {day: prefix})});
    return alerts;
}

export function panelSummary(data, now = Date.now(), alerts = advice(data, now)) {
    if (!data) return '';
    if (!fresh(data, now)) return t('outlook.stale');
    if (alerts.length) return alerts[0].summary;
    const window = outlookWindow(data, now);
    const hours = data.hourly.filter(hour => hour.time >= window.start && hour.time <= window.rainEnd);
    const codes = hours.map(hour => number(hour.code)).filter(code => code !== null);
    if (!codes.length) return t('outlook.pending', {day: window.label});
    const counts = new Map();
    for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    const code = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    if (code === 0 || code === 1)
        return t(window.tomorrow ? 'outlook.goodTomorrow' : 'outlook.good', {condition: condition(code).text});
    return t('outlook.condition', {day: window.label, condition: condition(code).text.toLocaleLowerCase(getLocale())});
}

// Instantaneous hourly values stay at their actual timestamps; no synthetic interpolation.
export function rollingForecast(data, now = Date.now()) {
    if (!data) return [];
    return data.hourly.filter(hour => hour.time >= now && hour.time <= now + DAY);
}
