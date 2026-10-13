// SPDX-License-Identifier: GPL-2.0-or-later
import {languages} from './locales/index.js';
export {languages};
let active = languages.find(language => language.id === 'en');
const english = active.messages;

export function setLanguage(id) {
    active = languages.find(language => language.id === id) ?? languages.find(language => language.id === 'en');
}
export function getLanguage() { return active.id; }
export function getLocale() { return active.locale; }
export function t(key, values = {}) {
    const message = active.messages[key] ?? english[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
        Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}
