// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {MODELS, modelName} from './weather.js';
import {t, setLanguage, languages} from './i18n.js';

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        setLanguage(settings.get_string('language'));
        let retranslating = false;
        const texts = [];
        const ui = (Type, properties) => {
            const translated = {...properties};
            for (const name of ['title', 'description', 'subtitle', 'label']) {
                if (typeof properties[name] === 'string') translated[name] = t(properties[name]);
            }
            const widget = new Type(translated);
            for (const name of ['title', 'description', 'subtitle', 'label']) {
                if (typeof properties[name] === 'string') texts.push({widget, name, key: properties[name]});
            }
            return widget;
        };
        window._settings = settings;
        window.set_default_size(560, 640);
        const page = ui(Adw.PreferencesPage, {title: 'preferences.title', icon_name: 'weather-few-clouds-symbolic'});
        window.add(page);
        const languageGroup = ui(Adw.PreferencesGroup, {title: 'language.title', description: 'language.description'});
        const languageRow = ui(Adw.ComboRow, {title: 'language.title',
            model: Gtk.StringList.new(languages.map(language => language.name)),
            selected: Math.max(0, languages.findIndex(language => language.id === settings.get_string('language')))});
        languageRow.connect('notify::selected', () => {
            if (!retranslating && languages[languageRow.selected]) settings.set_string('language', languages[languageRow.selected].id);
        });
        languageGroup.add(languageRow);
        page.add(languageGroup);
        const themes = [
            {id: 'system', name: t('theme.system')},
            {id: 'light', name: t('theme.light')},
            {id: 'dark', name: t('theme.dark')},
        ];
        const themeGroup = ui(Adw.PreferencesGroup, {title: 'theme.title',
            description: 'theme.description'});
        const themeRow = ui(Adw.ComboRow, {title: 'theme.mode',
            model: Gtk.StringList.new(themes.map(theme => theme.name)),
            selected: Math.max(0, themes.findIndex(theme => theme.id === settings.get_string('theme-mode')))});
        themeRow.connect('notify::selected', () => {
            if (!retranslating && themes[themeRow.selected]) settings.set_string('theme-mode', themes[themeRow.selected].id);
        });
        const applyPreferencesTheme = () => {
            const mode = settings.get_string('theme-mode');
            const schemes = {system: Adw.ColorScheme.DEFAULT, light: Adw.ColorScheme.FORCE_LIGHT, dark: Adw.ColorScheme.FORCE_DARK};
            Adw.StyleManager.get_default().set_color_scheme(schemes[mode] ?? Adw.ColorScheme.DEFAULT);
        };
        applyPreferencesTheme();
        const themeChanged = settings.connect('changed::theme-mode', () => {
            themeRow.selected = Math.max(0, themes.findIndex(theme => theme.id === settings.get_string('theme-mode')));
            applyPreferencesTheme();
        });
        window.connect('close-request', () => {
            settings.disconnect(themeChanged);
            return false;
        });
        themeGroup.add(themeRow);
        page.add(themeGroup);
        const appearance = ui(Adw.PreferencesGroup, {title: 'dock.title',
            description: 'dock.description'});
        const autoSize = ui(Adw.SwitchRow, {title: 'dock.auto'});
        settings.bind('auto-size', autoSize, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(autoSize);
        for (const [key, title, lower, upper, step] of [
            ['indicator-scale', 'dock.scale', 50, 150, 5],
            ['icon-size', 'dock.iconSize', 12, 96, 1],
            ['text-size', 'dock.textSize', 9, 48, 1],
        ]) {
            const row = ui(Adw.SpinRow, {title,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            if (key !== 'indicator-scale')
                settings.bind('auto-size', row, 'sensitive', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN);
            appearance.add(row);
        }
        const connection = ui(Adw.PreferencesGroup, {title: 'Open-Meteo',
            description: 'source.description'});
        page.add(connection);
        const models = Gtk.StringList.new(MODELS.map(model => modelName(model.id)));
        const modelRow = ui(Adw.ComboRow, {title: 'source.model', model: models,
            selected: Math.max(0, MODELS.findIndex(model => model.id === settings.get_string('forecast-model')))});
        modelRow.connect('notify::selected', () => {
            if (!retranslating && MODELS[modelRow.selected]) settings.set_string('forecast-model', MODELS[modelRow.selected].id);
        });
        const modelChanged = settings.connect('changed::forecast-model', () => {
            modelRow.selected = Math.max(0, MODELS.findIndex(model => model.id === settings.get_string('forecast-model')));
        });
        window.connect('close-request', () => {
            settings.disconnect(modelChanged);
            return false;
        });
        connection.add(modelRow);
        const source = ui(Adw.ActionRow, {title: 'source.title', subtitle: 'Open-Meteo · CC BY 4.0'});
        const sourceButton = ui(Gtk.Button, {label: 'source.open', valign: Gtk.Align.CENTER});
        sourceButton.connect('clicked', () => Gio.AppInfo.launch_default_for_uri('https://open-meteo.com/', null));
        source.add_suffix(sourceButton);
        connection.add(source);
        page.add(appearance);

        const location = ui(Adw.PreferencesGroup, {title: 'location.title', description: 'location.description'});
        page.add(location);
        const city = ui(Adw.EntryRow, {title: 'location.city', show_apply_button: true});
        city.text = settings.get_string('city');
        city.connect('apply', () => settings.set_string('city', city.text.trim()));
        location.add(city);
        for (const [name, title, min, max] of [['latitude', 'location.latitude', -90, 90], ['longitude', 'location.longitude', -180, 180]]) {
            const row = ui(Adw.SpinRow, {title, digits: 4,
                adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: 0.0001, page_increment: 1})});
            settings.bind(name, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            location.add(row);
        }
        const update = ui(Adw.PreferencesGroup, {title: 'update.title', description: 'update.description'});
        page.add(update);
        const interval = ui(Adw.SpinRow, {title: 'update.interval',
            adjustment: new Gtk.Adjustment({lower: 15, upper: 360, step_increment: 15})});
        settings.bind('refresh-minutes', interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        update.add(interval);
        const updateLanguage = () => {
            setLanguage(settings.get_string('language'));
            retranslating = true;
            for (const {widget, name, key} of texts) widget[name] = t(key);
            window.title = `Material Weather — ${t('settings')}`;
            languageRow.selected = Math.max(0, languages.findIndex(language => language.id === settings.get_string('language')));
            themeRow.model.splice(0, themeRow.model.get_n_items(), ['theme.system', 'theme.light', 'theme.dark'].map(key => t(key)));
            themeRow.selected = Math.max(0, themes.findIndex(theme => theme.id === settings.get_string('theme-mode')));
            modelRow.model.splice(0, modelRow.model.get_n_items(), MODELS.map(model => modelName(model.id)));
            modelRow.selected = Math.max(0, MODELS.findIndex(model => model.id === settings.get_string('forecast-model')));
            retranslating = false;
        };
        const languageChanged = settings.connect('changed::language', updateLanguage);
        window.connect('close-request', () => {
            settings.disconnect(languageChanged);
            return false;
        });
        updateLanguage();
    }
}
