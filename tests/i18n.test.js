// SPDX-License-Identifier: GPL-2.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t, setLanguage, getLanguage, getLocale, languages} from '../i18n.js';
import {condition, advice, panelSummary} from '../weather.js';

const placeholders = message => [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
test('English is the initial language and schema default regardless of the system locale', () => {
    assert.equal(getLanguage(), 'en');
    assert.equal(t('settings'), 'Settings');
    assert.equal(condition(2).text, 'Partly cloudy');
    const schema = readFileSync(new URL('../schemas/org.gnome.shell.extensions.material-weather.gschema.xml', import.meta.url), 'utf8');
    assert.match(schema, /name="language"[^>]*><default>'en'<\/default>/);
});
test('every registered language has the full English key set and matching placeholders', () => {
    const english = languages.find(language => language.id === 'en').messages;
    assert.equal(new Set(languages.map(language => language.id)).size, languages.length);
    for (const language of languages) {
        assert.doesNotThrow(() => new Intl.DateTimeFormat(language.locale));
        assert.deepEqual(Object.keys(language.messages).sort(), Object.keys(english).sort(), language.id);
        for (const [key, message] of Object.entries(language.messages)) {
            assert.equal(typeof message, 'string', `${language.id}:${key}`);
            assert.ok(message.trim(), `${language.id}:${key}`);
            assert.deepEqual(placeholders(message), placeholders(english[key]), `${language.id}:${key}`);
        }
    }
});
test('language changes translate existing forecast advice without changing data or times', () => {
    const now = Date.parse('2026-10-13T14:30:00+03:00');
    const data = {updated: now, offset: 10800, code: 2, hourly: [{time: now + 1800000, code: 61, rain: 1, showers: 0, probability: 80, visibility: 10000}]};
    setLanguage('tr');
    assert.equal(condition(2).text, 'Parçalı bulutlu');
    assert.equal(advice(data, now)[0].summary, 'Bugün yağmur bekleniyor');
    assert.match(advice(data, now)[0].detail, /14:30–15:00.*%80/);
    setLanguage('en');
    assert.equal(panelSummary(data, now), 'Today: rain is expected');
    assert.match(advice(data, now)[0].detail, /14:30–15:00.*80%/);
    assert.equal(getLocale(), 'en-GB');
});
test('missing translations and unknown language IDs fall back to English', () => {
    languages.push({id: 'test', name: 'Test', locale: 'en-GB', messages: {'settings': 'Test settings'}});
    try {
        setLanguage('test');
        assert.equal(t('settings'), 'Test settings');
        assert.equal(t('refresh'), 'Refresh weather');
        assert.equal(t('advice.summary', {day: '$&', condition: 'rain'}), '$&: rain');
        setLanguage('not-installed');
        assert.equal(getLanguage(), 'en');
    } finally {
        languages.pop();
        setLanguage('en');
    }
});
