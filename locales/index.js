// SPDX-License-Identifier: GPL-2.0-or-later
import en from './en.js';
import tr from './tr.js';

// Add one import and one entry here to register another language.
export const languages = [
    {id: 'en', name: 'English', locale: 'en-GB', messages: en},
    {id: 'tr', name: 'Türkçe', locale: 'tr-TR', messages: tr},
];
