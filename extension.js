// SPDX-License-Identifier: GPL-2.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {advice, forecastUrl, parseForecast, temperature, modelName, panelSummary,
    rollingForecast, localDate, localTime, condition} from './weather.js';

import {t, setLanguage, getLocale} from './i18n.js';

function label(text, style = '') {
    return new St.Label({text, style_class: style, y_align: Clutter.ActorAlign.CENTER});
}

export default class MaterialWeather extends Extension {
    enable() {
        this._active = true;
        this._generation = 0;
        this._hourlyScrollValue = 0;
        this._settings = this.getSettings();
        setLanguage(this._settings.get_string('language'));
        this._statusKey = null;
        this._session = new Soup.Session({timeout: 25, user_agent: 'MaterialWeather/1.0'});
        this._button = new PanelMenu.Button(0.0, 'Material Weather');
        this._button.set_style('background-color: transparent; border: none; box-shadow: none;');
        this._button.menu.box.add_style_class_name('mw-menu-surface');
        const panel = new St.BoxLayout({style_class: 'mw-panel'});
        this._panelContent = panel;
        this._icon = this._weatherIcon('cloud', 22);
        this._panelText = label('—');
        this._panelAdvice = label('', 'mw-panel-advice');
        this._panelAdvice.hide();
        panel.add_child(this._icon);
        panel.add_child(this._panelText);
        panel.add_child(this._panelAdvice);
        this._button.add_child(panel);
        const container = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._content = new St.BoxLayout({vertical: true, style_class: 'mw-content'});
        const scroll = new St.ScrollView({style_class: 'mw-scroll',
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
        scroll.set_child(this._content);
        scroll.vadjustment.connect('notify::value', () => {
            const redraw = actor => {
                actor.queue_redraw();
                for (const child of actor.get_children()) redraw(child);
            };
            redraw(scroll);
        });
        this._mainScroll = scroll;
        container.add_child(scroll);
        this._button.menu.addMenuItem(container);
        // Keep the indicator outside the right system group (also on Zorin panels).
        Main.panel.addToStatusArea(this.uuid, this._button, 1, 'left');
        this._contextMenu = new PopupMenu.PopupMenu(this._button, 0.5, St.Side.TOP);
        this._contextMenu.box.add_style_class_name('mw-menu-surface');
        Main.uiGroup.add_child(this._contextMenu.actor);
        this._contextMenu.actor.hide();
        this._settingsItem = new PopupMenu.PopupMenuItem(t('settings'));
        this._settingsItem.connect('activate', () => this.openPreferences());
        this._contextMenu.addMenuItem(this._settingsItem);
        this._contextManager = new PopupMenu.PopupMenuManager(this._button);
        this._contextManager.addMenu(this._contextMenu);
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._interfaceChanged = this._interfaceSettings.connect('changed', (_settings, key) => {
            if (key === 'color-scheme' || key === 'gtk-theme') this._applyTheme();
        });
        this._applyTheme();
        this._button.connect('captured-event', (_actor, event) => {
            const type = event.type();
            if (![Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE].includes(type) ||
                event.get_button() !== Clutter.BUTTON_SECONDARY)
                return Clutter.EVENT_PROPAGATE;
            if (type === Clutter.EventType.BUTTON_PRESS) {
                this._button.menu.close();
                const side = this._button.menu._boxPointer._arrowSide;
                this._contextMenu._arrowSide = side;
                this._contextMenu._boxPointer._arrowSide = side;
                this._contextMenu.toggle();
            }
            return Clutter.EVENT_STOP;
        });
        this._sizeSignals = [
            [Main.panel, Main.panel.connect('notify::height', () => this._queueIndicatorSize())],
            [Main.panel, Main.panel.connect('notify::width', () => this._queueIndicatorSize())],
            [this._button, this._button.connect('notify::height', () => this._queueIndicatorSize())],
            [St.ThemeContext.get_for_stage(global.stage),
                St.ThemeContext.get_for_stage(global.stage).connect('notify::scale-factor', () => this._queueIndicatorSize())],
            [St.ThemeContext.get_for_stage(global.stage),
                St.ThemeContext.get_for_stage(global.stage).connect('changed', () => this._applyTheme())],
        ];
        this._queueIndicatorSize();
        this._button.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._contextMenu.close();
                this._render(this._status);
            } else {
                this._finishHourlyDrag();
            }
        });
        this._adviceTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._render(this._status);
            return GLib.SOURCE_CONTINUE;
        });
        this._settingsChanged = this._settings.connect('changed', (_settings, key) => {
            if (key === 'language') {
                setLanguage(this._settings.get_string('language'));
                this._settingsItem.label.text = t('settings');
                this._status = this._statusText();
                this._render(this._status);
                return;
            }
            if (key === 'theme-mode') {
                this._applyTheme();
                return;
            }
            if (['auto-size', 'indicator-scale', 'icon-size', 'text-size'].includes(key)) {
                this._queueIndicatorSize();
                return;
            }
            this._data = null;
            this._restartTimer();
            this._refresh();
        });
        this._restartTimer();
        this._refresh();
    }

    _gicon(name, light = this._lightTheme) {
        const variant = light && ['cloud', 'partly', 'rain', 'fog', 'snow', 'storm'].includes(name) ? '-light' : '';
        return new Gio.FileIcon({file: this.dir.get_child('icons').get_child(`${name}${variant}.svg`)});
    }

    _applyTheme() {
        if (!this._active || !this._interfaceSettings) return;
        const mode = this._settings.get_string('theme-mode');
        const scheme = this._interfaceSettings.get_string('color-scheme');
        const dark = mode === 'dark' || (mode === 'system' &&
            (scheme === 'prefer-dark' || (scheme === 'default' &&
                /dark/i.test(this._interfaceSettings.get_string('gtk-theme')))));
        this._lightTheme = !dark;
        for (const actor of [this._button.menu.box, this._contextMenu.box]) {
            if (dark) actor.remove_style_class_name('mw-light');
            else actor.add_style_class_name('mw-light');
        }
        // The transparent dock indicator follows the actual panel contrast,
        // even when the popup's theme is manually different from the system.
        const foreground = this._button.get_theme_node().get_foreground_color();
        const lightPanel = foreground.red * 0.2126 + foreground.green * 0.7152 + foreground.blue * 0.0722 < 128;
        this._lightPanel = lightPanel;
        if (lightPanel) this._panelContent.add_style_class_name('mw-light');
        else this._panelContent.remove_style_class_name('mw-light');
        this._icon.gicon = this._gicon(this._icon._mwWeatherName, lightPanel);
        const updateIcons = actor => {
            if (actor._mwWeatherName) actor.gicon = this._gicon(actor._mwWeatherName);
            for (const child of actor.get_children()) updateIcons(child);
        };
        updateIcons(this._content);
    }

    _weatherIcon(name, size) {
        const icon = new St.Icon({gicon: this._gicon(name), icon_size: size,
            style_class: 'mw-weather-icon', style: '-st-icon-style: regular;',
            y_align: Clutter.ActorAlign.CENTER});
        icon._mwWeatherName = name;
        return icon;
    }

    _restartTimer() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('refresh-minutes') * 60, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _queueIndicatorSize() {
        if (this._sizeIdle) return;
        this._sizeIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._sizeIdle = null;
            if (this._active) this._updateIndicatorSize();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateIndicatorSize() {
        // Actor allocations are physical pixels; St icon sizes and CSS use logical pixels.
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const vertical = Main.panel._leftBox?.vertical ?? false;
        const thickness = (vertical ? Main.panel.width : Main.panel.height) / scaleFactor;
        if (thickness <= 0) return;
        const available = Math.max(12, Math.floor(thickness - 8));
        const multiplier = this._settings.get_int('indicator-scale') / 100;
        const automatic = this._settings.get_boolean('auto-size');
        const iconSize = Math.round(Math.min(available, Math.max(12,
            (automatic ? thickness * 0.65 : this._settings.get_int('icon-size')) * multiplier)));
        const textSize = Math.round(Math.min(available * 0.7, Math.max(9,
            (automatic ? thickness * 0.38 : this._settings.get_int('text-size')) * multiplier)));
        const spacing = Math.max(3, Math.round(iconSize * 0.2));
        const style = `spacing: ${spacing}px; padding: 2px ${spacing}px; margin: 2px 4px;`;
        const signature = `${iconSize}:${textSize}:${style}`;
        if (signature === this._indicatorSizing) return;
        this._indicatorSizing = signature;
        this._icon.icon_size = iconSize;
        this._panelAdvice.set_style(`font-size: ${Math.max(9, Math.round(textSize * 0.8))}px;`);
        this._panelText.set_style(`font-size: ${textSize}px; font-weight: 600;`);
        this._panelContent.set_style(style);
    }

    async _refresh() {
        const generation = ++this._generation;
        this._cancel?.cancel();
        this._cancel = new Gio.Cancellable();
        this._statusKey = 'status.loading';
        this._statusHttp = null;
        this._status = this._statusText();
        this._render(this._status);
        const message = Soup.Message.new('GET', forecastUrl(
            this._settings.get_double('latitude'), this._settings.get_double('longitude'),
            this._settings.get_string('forecast-model')));
        try {
            const bytes = await new Promise((resolve, reject) => {
                this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancel,
                    (session, result) => {
                        try { resolve(session.send_and_read_finish(result)); }
                        catch (error) { reject(error); }
                    });
            });
            if (!this._active || generation !== this._generation) return;
            const status = message.get_status();
            if (status !== 200) {
                const error = new Error(t(status === 429 ? 'error.rateLimit' : 'error.http'));
                error.translationKey = status === 429 ? 'error.rateLimit' : 'error.http';
                error.httpStatus = status;
                throw error;
            }
            this._data = parseForecast(JSON.parse(new TextDecoder().decode(bytes.get_data())));
            this._data.model = this._settings.get_string('forecast-model');
            this._statusKey = null;
            this._status = '';
            this._render();
        } catch (error) {
            if (!this._active || generation !== this._generation) return;
            this._statusKey = error.translationKey ?? 'error.connection';
            this._statusHttp = error.httpStatus ?? null;
            this._status = this._statusText();
            this._render(this._status);
        }
    }

    _statusText() {
        if (!this._statusKey) return '';
        return t(this._statusKey) + (this._statusHttp ? ` (HTTP ${this._statusHttp})` : '') +
            (this._data && this._statusKey !== 'status.loading' ? t('status.cached') : '');
    }

    _render(status = '') {
        if (this._hourlyDrag) {
            this._pendingRenderStatus = status;
            return;
        }
        if (this._restoreScrollIdle) GLib.Source.remove(this._restoreScrollIdle);
        this._restoreScrollIdle = null;
        if (this._hourlyScroll) this._hourlyScrollValue = this._hourlyScroll.hadjustment.value;
        this._stopHourlyAnimation();
        this._content.destroy_all_children();
        const monitor = Main.layoutManager.findMonitorForActor(this._button) ?? Main.layoutManager.primaryMonitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._content.set_style(`width: ${Math.min(500, monitor.width / scale - 80)}px;`);
        this._mainScroll.set_style(`max-height: ${Math.min(850, Math.max(300, monitor.height / scale - 110))}px;`);
        const data = this._data;
        if (data) {
            data.text = condition(data.code, data.isDay).text;
            for (const hour of data.hourly) hour.text = condition(hour.code, hour.isDay).text;
            for (const day of data.days) day.text = condition(day.code).text;
        }
        const now = Date.now();
        const alerts = advice(data, now);
        const outlook = panelSummary(data, now, alerts);
        this._panelAdvice.visible = Boolean(outlook);
        this._panelAdvice.text = outlook ? `· ${outlook}` : '';
        this._button.accessible_name = [this._settings.get_string('city') || t('location.title'),
            data ? `${temperature(data.temperature)} ${data.text}` : t('status.pending'),
            outlook, ...alerts.map(alert => `${alert.title}: ${alert.detail}`)].filter(Boolean).join(' · ');
        const header = new St.BoxLayout();
        header.add_child(label(this._settings.get_string('city') || t('location.title'), 'mw-city'));
        header.add_child(new St.Widget({x_expand: true}));
        const refreshButton = new St.Button({style_class: 'mw-refresh',
            accessible_name: t('refresh'), can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({icon_name: 'view-refresh-symbolic', icon_size: 20})});
        refreshButton.connect('clicked', () => this._refresh());
        header.add_child(refreshButton);
        this._content.add_child(header);
        this._panelText.text = data ? temperature(data.temperature) : '—';
        this._icon._mwWeatherName = data?.icon ?? 'cloud';
        this._icon.gicon = this._gicon(this._icon._mwWeatherName, this._lightPanel);

        const hero = new St.BoxLayout({style_class: 'mw-hero'});
        const summary = new St.BoxLayout({vertical: true, x_expand: true});
        summary.add_child(label(data ? temperature(data.temperature) : '—', 'mw-temperature'));
        summary.add_child(label(data?.text ?? t('status.pending'), 'mw-condition'));
        summary.add_child(label(`${modelName(data?.model ?? this._settings.get_string('forecast-model'))} · °C`, 'mw-caption'));
        hero.add_child(summary);
        hero.add_child(this._weatherIcon(data?.icon ?? 'cloud', 64));
        this._content.add_child(hero);

        if (data) {
            for (const alert of alerts) {
                const card = new St.BoxLayout({style_class: 'mw-advice'});
                card.add_child(this._weatherIcon(alert.icon, 28));
                const body = new St.BoxLayout({vertical: true, x_expand: true});
                body.add_child(label(alert.title, 'mw-advice-title'));
                const detail = label(alert.detail, 'mw-advice-detail');
                detail.clutter_text.line_wrap = true;
                body.add_child(detail);
                card.add_child(body);
                this._content.add_child(card);
            }
            const metrics = new St.BoxLayout({style_class: 'mw-metrics'});
            metrics.layout_manager.homogeneous = true;
            for (const [title, value, unit] of [[t('metric.humidity'), data.humidity, '%'], [t('metric.wind'), data.wind, t('unit.wind')], [t('metric.rain'), data.precipitation, '%']]) {
                const box = new St.BoxLayout({vertical: true, style_class: 'mw-metric', x_expand: true});
                box.add_child(label(title, 'mw-caption'));
                box.add_child(label(value === null ? '—' : `${Math.round(value)}${unit}`, 'mw-metric-value'));
                metrics.add_child(box);
            }
            this._content.add_child(metrics);
            this._renderHourly(data, now);
            this._renderDaily(data);
        }
        const updated = data ? new Date(data.updated).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'}) : '';
        this._content.add_child(label(status || `${t('status.updated', {time: updated})}${data && Date.now() - data.updated > 3 * 3600000 ? t('status.old') : ''}`, 'mw-status'));
        const statusLabel = this._content.get_last_child();
        statusLabel.clutter_text.line_wrap = true;
    }

    _renderHourly(data, now) {
        const tomorrow = localDate(now + 24 * 3600000, data.offset);
        const heading = new St.BoxLayout({style_class: 'mw-section-heading'});
        heading.add_child(label(t('hourly.title'), 'mw-section-title'));
        heading.add_child(new St.Widget({x_expand: true}));
        heading.add_child(label(t('hourly.range'), 'mw-caption'));
        this._content.add_child(heading);
        const hourly = new St.BoxLayout({style_class: 'mw-hourly'});
        const textActors = [];
        for (const hour of rollingForecast(data, now)) {
            const card = new St.BoxLayout({vertical: true, style_class: 'mw-hour-column'});
            const hourLabel = (text, style) => {
                const actor = label(text, style);
                actor.x_expand = true;
                actor.x_align = Clutter.ActorAlign.FILL;
                actor.clutter_text.set_single_line_mode(true);
                textActors.push(actor.clutter_text);
                return actor;
            };
            const isTomorrow = localDate(hour.time, data.offset) === tomorrow;
            card.add_child(hourLabel(localTime(hour.time, data.offset), 'mw-hour-time'));
            card.add_child(hourLabel(isTomorrow ? t('day.tomorrow') : t('day.today'), 'mw-hour-date'));
            card.add_child(this._weatherIcon(hour.icon, 24));
            card.add_child(hourLabel(temperature(hour.temperature), 'mw-hour-temp'));
            card.add_child(hourLabel(hour.probability == null ? '—' : t('format.percent', {value: Math.round(hour.probability)}), 'mw-hour-rain'));
            const amount = hour.precipitation ?? (hour.rain == null && hour.showers == null ? null : (hour.rain ?? 0) + (hour.showers ?? 0));
            card.add_child(hourLabel(amount === null ? '—' : `${amount.toFixed(1)} mm`, 'mw-hour-amount'));
            card.accessible_name = `${isTomorrow ? t('day.tomorrow') : t('day.today')} ${localTime(hour.time, data.offset)} · ${hour.text} · ${temperature(hour.temperature)}${hour.probability == null ? '' : t('hourly.rainAccessible', {value: Math.round(hour.probability)})}`;
            hourly.add_child(card);
        }
        const scroll = new St.ScrollView({style_class: 'mw-hourly-scroll', reactive: true, can_focus: true,
            accessible_name: t('hourly.accessible'),
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            hscrollbar_policy: St.PolicyType.EXTERNAL, vscrollbar_policy: St.PolicyType.NEVER});
        scroll.set_child(hourly);
        // Redraw the clipped surface and glyphs without mutating the adjustment in notify.
        scroll.hadjustment.connect('notify::value', () => {
            for (const text of textActors) text.queue_redraw();
            hourly.queue_redraw();
            scroll.queue_redraw();
        });
        scroll.connect('captured-event', (_actor, event) => this._onHourlyEvent(scroll, event));
        scroll.connect('event', (_actor, event) => this._onHourlyEvent(scroll, event));
        this._hourlyScroll = scroll;
        this._restoreScrollIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._restoreScrollIdle = null;
            if (this._active && scroll.get_stage()) this._setHourlyScroll(scroll, this._hourlyScrollValue);
            return GLib.SOURCE_REMOVE;
        });
        this._content.add_child(scroll);
        const note = label(t('hourly.hint'), 'mw-caption');
        note.clutter_text.line_wrap = true;
        this._content.add_child(note);
    }

    _setHourlyScroll(scroll, value, animate = false) {
        const adjustment = scroll.hadjustment;
        const target = Math.round(Math.max(adjustment.lower, Math.min(value, adjustment.upper - adjustment.page_size)));
        this._stopHourlyAnimation();
        adjustment.remove_transition('value');
        this._hourlyScrollTarget = target;
        this._hourlyScrollValue = target;
        if (animate && target !== adjustment.value) {
            const start = adjustment.value;
            const timeline = new Clutter.Timeline({actor: scroll, duration: 320});
            timeline.set_progress_mode(Clutter.AnimationMode.EASE_IN_OUT_CUBIC);
            timeline.connect('new-frame', () => {
                adjustment.value = Math.round(start + (target - start) * timeline.get_progress());
            });
            timeline.connect('completed', () => {
                adjustment.value = target;
                if (this._hourlyAnimation === timeline) this._hourlyAnimation = null;
            });
            this._hourlyAnimation = timeline;
            timeline.start();
        } else {
            adjustment.value = target;
        }
    }

    _stopHourlyAnimation() {
        this._hourlyAnimation?.stop();
        this._hourlyAnimation = null;
    }

    _onHourlyEvent(scroll, event) {
        const step = 72 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const type = event.type();
        if (type === Clutter.EventType.SCROLL) {
            let delta = 0;
            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT: delta = step; break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT: delta = -step; break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [dx, dy] = event.get_scroll_delta();
                delta = -(Math.abs(dx) > Math.abs(dy) ? dx : dy) * step;
                break;
            }
            }
            this._setHourlyScroll(scroll, (this._hourlyScrollTarget ?? scroll.hadjustment.value) + delta, true);
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Left || key === Clutter.KEY_Right) {
                this._setHourlyScroll(scroll, scroll.hadjustment.value + (key === Clutter.KEY_Left ? -step : step));
                return Clutter.EVENT_STOP;
            }
        }
        if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._finishHourlyDrag();
            this._setHourlyScroll(scroll, scroll.hadjustment.value);
            const [startX] = event.get_coords();
            this._hourlyDrag = {scroll, startX, startValue: scroll.hadjustment.value};
            scroll.grab_key_focus();
            scroll.add_style_pseudo_class('dragging');
            this._dragSignal = global.stage.connect('captured-event', (_stage, captured) => {
                if (captured.type() === Clutter.EventType.MOTION) {
                    const [x] = captured.get_coords();
                    const drag = this._hourlyDrag;
                    if (drag) this._setHourlyScroll(drag.scroll, drag.startValue + drag.startX - x);
                    return Clutter.EVENT_STOP;
                }
                if (captured.type() === Clutter.EventType.BUTTON_RELEASE && captured.get_button() === Clutter.BUTTON_PRIMARY) {
                    this._finishHourlyDrag();
                    return Clutter.EVENT_STOP;
                }
                if (captured.type() === Clutter.EventType.KEY_PRESS && captured.get_key_symbol() === Clutter.KEY_Escape)
                    this._finishHourlyDrag();
                return Clutter.EVENT_PROPAGATE;
            });
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _finishHourlyDrag() {
        if (this._dragSignal) global.stage.disconnect(this._dragSignal);
        this._dragSignal = null;
        this._hourlyDrag?.scroll.remove_style_pseudo_class('dragging');
        this._hourlyDrag = null;
        if (this._active && this._pendingRenderStatus !== undefined) {
            const status = this._pendingRenderStatus;
            this._pendingRenderStatus = undefined;
            this._render(status);
        }
    }

    _renderDaily(data) {
        this._content.add_child(label(t('daily.title'), 'mw-section-title'));
        const forecast = new St.BoxLayout({vertical: true, style_class: 'mw-forecast'});
        data.days.forEach(day => {
            const row = new St.BoxLayout({style_class: 'mw-day'});
            const date = new Date(`${day.date}T12:00:00`);
            row.add_child(label(date.toLocaleDateString(getLocale(), {weekday: 'short', day: 'numeric'}), 'mw-day-name'));
            row.add_child(this._weatherIcon(day.icon, 22));
            row.add_child(label(day.text, 'mw-day-condition'));
            row.add_child(new St.Widget({x_expand: true}));
            row.add_child(label(`${temperature(day.max)} / ${temperature(day.min)}`, 'mw-day-temp'));
            forecast.add_child(row);
        });
        this._content.add_child(forecast);
    }

    disable() {
        this._active = false;
        this._stopHourlyAnimation();
        this._finishHourlyDrag();
        if (this._restoreScrollIdle) GLib.Source.remove(this._restoreScrollIdle);
        this._restoreScrollIdle = null;
        this._pendingRenderStatus = undefined;
        if (this._sizeIdle) GLib.Source.remove(this._sizeIdle);
        this._sizeIdle = null;
        for (const [actor, id] of this._sizeSignals ?? []) actor.disconnect(id);
        this._sizeSignals = null;
        this._indicatorSizing = null;
        ++this._generation;
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = null;
        if (this._adviceTimer) GLib.Source.remove(this._adviceTimer);
        this._adviceTimer = null;
        this._cancel?.cancel();
        this._session?.abort();
        if (this._settingsChanged) this._settings.disconnect(this._settingsChanged);
        this._settingsChanged = null;
        if (this._interfaceChanged) this._interfaceSettings.disconnect(this._interfaceChanged);
        this._interfaceChanged = null;
        this._interfaceSettings = null;
        if (this._contextMenu) {
            this._contextManager.removeMenu(this._contextMenu);
            this._contextMenu.destroy();
        }
        this._contextMenu = null;
        this._settingsItem = null;
        this._contextManager = null;
        this._button?.destroy();
        this._button = null;
        this._panelContent = null;
        this._panelAdvice = null;
        this._content = null;
        this._mainScroll = null;
        this._hourlyScroll = null;
        this._data = null;
        this._status = '';
        this._session = null;
        this._settings = null;
    }
}
