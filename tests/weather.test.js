// SPDX-License-Identifier: GPL-2.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastUrl, parseForecast, advice, temperature, condition, MODELS, modelName,
    panelSummary, outlookWindow, rollingForecast} from '../weather.js';
import {setLanguage} from '../i18n.js';
setLanguage('tr');
const at = time => Date.parse(`2026-10-12T${time}:00+03:00`);
const hour = (time, values = {}) => ({time: at(time), code: 3, probability: 0, rain: 0, showers: 0, visibility: 20000, ...values});
const data = (hours, now = at('17:30'), code = 3) => ({updated: now, offset: 10800, code, hourly: hours});
test('excludes passed rain and next-day rain', () => {
    const tomorrow = {...hour('18:00', {rain: 1}), time: at('18:00') + 86400000};
    assert.deepEqual(advice(data([hour('16:00', {rain: 1}), tomorrow]), at('17:30')), []);
});
test('ongoing rain interval uses only its remaining time', () => {
    const alerts = advice(data([hour('18:00', {rain: 1, probability: 80})]), at('17:30'));
    assert.equal(alerts[0].title, 'Şemsiyeni almalısın');
    assert.match(alerts[0].detail, /17:30–18:00.*%80/);
    assert.deepEqual(advice(data([hour('18:00', {rain: 1})], at('18:01')), at('18:01')), []);
});
test('21:00 cutoff includes 20–21 interval but excludes later rain', () => {
    assert.equal(advice(data([hour('21:00', {rain: 1})], at('20:30')), at('20:30')).length, 1);
    assert.deepEqual(advice(data([hour('22:00', {rain: 1})]), at('17:30')), []);
    assert.deepEqual(advice(data([hour('21:00', {rain: 1})], at('21:00')), at('21:00')), []);
});
test('probability threshold, snow exclusion and stale guidance', () => {
    assert.equal(advice(data([hour('19:00', {probability: 50})]), at('17:30')).length, 1);
    assert.deepEqual(advice(data([hour('19:00', {probability: 49})]), at('17:30')), []);
    const snow = advice(data([hour('19:00', {probability: 90, code: 75})]), at('17:30'));
    assert.ok(snow.some(alert => alert.title === 'Kar yağışı bekleniyor'));
    assert.ok(!snow.some(alert => alert.icon === 'rain'));
    assert.deepEqual(advice(data([hour('19:00', {rain: 1})], at('13:00')), at('17:30')), []);
});
test('after 21:00 fog outlook refers to tomorrow, not current or past fog', () => {
    assert.deepEqual(advice(data([], at('22:00'), 45), at('22:00')), []);
    const tomorrowFog = {...hour('08:00', {code: 45}), time: at('08:00') + 86400000};
    assert.match(advice(data([tomorrowFog], at('22:00')), at('22:00'))[0].detail, /Yarın 08:00.*sis/);
    assert.match(advice(data([hour('19:00', {visibility: 500})]), at('17:30'))[0].detail, /düşük görüş/);
    assert.deepEqual(advice(data([hour('16:00', {code: 45})]), at('17:30')), []);
});
test('21:00 switches from the remaining day to tomorrow, including month/year changes', () => {
    const tomorrow = {...hour('10:00', {rain: 1, probability: 80}), time: at('10:00') + 86400000};
    assert.deepEqual(advice(data([tomorrow], at('20:59')), at('20:59')), []);
    const alerts = advice(data([tomorrow], at('21:00')), at('21:00'));
    assert.match(alerts[0].summary, /^Yarın yağmur bekleniyor/);
    assert.match(alerts[0].detail, /Yarın 09:00–10:00/);
    const newYear = Date.parse('2026-12-31T21:00:00+03:00');
    assert.equal(outlookWindow(data([], newYear), newYear).date, '2027-01-01');
    const midnightEnd = {...tomorrow, time: at('00:00') + 86400000};
    assert.deepEqual(advice(data([midnightEnd], at('21:00')), at('21:00')), []);
});
test('low probability with a rain amount uses cautious wording instead of certainty', () => {
    const now = at('17:30');
    const forecast = data([hour('19:00', {rain: 0.2, probability: 5})], now);
    assert.equal(panelSummary(forecast, now), 'Bugün yağmur ihtimali var');
    assert.equal(advice(forecast, now)[0].title, 'Şemsiye bulundurabilirsin');
});
test('dry outlook describes conditions; unknown and old forecasts never claim good weather', () => {
    const now = at('17:30');
    assert.match(panelSummary(data([hour('18:00', {code: 0})], now), now), /Hava iyi görünüyor.*Açık/);
    assert.equal(panelSummary(data([hour('18:00', {code: 2})], now), now), 'Bugün parçalı bulutlu');
    assert.equal(panelSummary(data([hour('18:00', {code: 3})], now), now), 'Bugün bulutlu');
    assert.match(panelSummary(data([], now), now), /tahmin bekleniyor/);
    assert.equal(panelSummary(data([], at('13:00')), now), 'Tahmin eski · Yenile');
    const tomorrow = {...hour('12:00', {code: 2}), time: at('12:00') + 86400000};
    assert.equal(panelSummary(data([tomorrow], at('22:00')), at('22:00')), 'Yarın parçalı bulutlu');
});
test('rolling hourly forecast contains only real hourly points within the next 24 hours', () => {
    const now = at('14:00');
    const hours = Array.from({length: 28}, (_, i) => ({...hour('14:00'), time: now + (i - 1) * 3600000}));
    const forecast = {...data(hours, now), temperature: 24, icon: 'sun', text: 'Açık'};
    const result = rollingForecast(forecast, now);
    assert.equal(result.length, 25);
    assert.ok(result.every(row => row.now === undefined));
    assert.equal(result[0].time, now);
    assert.equal(result.at(-1).time, now + 86400000);
    assert.ok(result.slice(1).every(row => row.time > now && row.time <= now + 86400000));
    const partial = rollingForecast(forecast, now + 30 * 60000);
    assert.ok(partial.every(row => row.time >= now + 30 * 60000 && row.time <= now + 86400000 + 30 * 60000));
});
test('model selection keeps the same API and sends a single supported model', () => {
    for (const model of MODELS) {
        const url = new URL(forecastUrl(37, 29, model.id));
        assert.equal(url.origin, 'https://api.open-meteo.com');
        assert.equal(url.searchParams.get('models'), model.id);
        assert.ok(url.searchParams.get('hourly').includes('temperature_2m'));
        assert.equal(modelName(model.id), model.name);
    }
    assert.equal(new URL(forecastUrl(37, 29, 'unknown')).searchParams.get('models'), 'best_match');
});
test('wind and freezing precipitation produce guidance without old or tomorrow warnings', () => {
    const now = at('17:30');
    assert.equal(advice({...data([], now), gusts: 65}, now)[0].title, 'Kuvvetli rüzgâra dikkat');
    assert.equal(advice(data([], now, 66), now)[0].title, 'Buzlanma riski');
    assert.equal(advice(data([hour('19:00', {code: 57})], now), now)[0].icon, 'snow');
    assert.deepEqual(advice(data([hour('16:00', {code: 66}),
        {...hour('19:00', {code: 57}), time: at('19:00') + 86400000}], now), now), []);
    assert.deepEqual(advice({...data([], at('13:00')), gusts: 65}, now), []);
});
test('parser keeps correct units and location date; malformed/stale data fails', () => {
    const now = at('17:30');
    const raw = {utc_offset_seconds: 10800,
        current: {time: now / 1000, temperature_2m: 24, relative_humidity_2m: 48, weather_code: 2, wind_speed_10m: 11, is_day: 1},
        current_units: {temperature_2m: '°C', wind_speed_10m: 'km/h'},
        hourly: {time: [at('18:00') / 1000], precipitation_probability: [80], rain: [1], weather_code: [61]},
        daily: {time: [at('00:00') / 1000], weather_code: [2], temperature_2m_min: [15], temperature_2m_max: [26]}};
    const parsed = parseForecast(raw, now);
    assert.equal(parsed.wind, 11);
    assert.equal(parsed.precipitation, 80);
    assert.equal(parsed.days[0].date, '2026-10-12');
    assert.equal(advice(parsed, now).length, 1);
    assert.throws(() => parseForecast({}, now), /alanları/);
    assert.throws(() => parseForecast(raw, now + 86400000), /Güncel/);
    assert.equal(temperature(null), '—');
    assert.equal(condition(0).icon, 'sun');
    assert.equal(condition(0, false).icon, 'moon');
    assert.ok(!forecastUrl(37, 29).includes('apikey'));
});
