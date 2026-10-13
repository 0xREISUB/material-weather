// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import GIRepository from 'gi://GIRepository?version=2.0';

GIRepository.Repository.prepend_search_path('/usr/lib/gnome-shell/girepository-1.0');
GIRepository.Repository.prepend_library_path('/usr/lib/gnome-shell');

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Extensions.data.gresource'));
const path = GLib.get_current_dir();
const {default: Preferences} = await import(Gio.File.new_for_path(`${path}/prefs.js`).get_uri());
const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));
metadata.path = path;
metadata.dir = Gio.File.new_for_path(path);
Adw.init();
const window = new Adw.PreferencesWindow({title: 'Material Weather — Ayarlar'});
new Preferences(metadata).fillPreferencesWindow(window);
window.present();
print('Preferences constructed successfully');
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => {
    window.close();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
