#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/material-weather@reisub.local"
mkdir -p "$extension_dir/schemas" "$extension_dir/icons" "$extension_dir/locales"
install -m 644 "$project_dir"/icons/*.svg "$extension_dir/icons/"
install -m 644 "$project_dir"/locales/*.js "$extension_dir/locales/"
for source_file in metadata.json extension.js weather.js i18n.js stylesheet.css prefs.js LICENSE; do
    install -m 644 "$project_dir/$source_file" "$extension_dir/$source_file"
done
install -m 644 "$project_dir/schemas/org.gnome.shell.extensions.material-weather.gschema.xml" "$extension_dir/schemas/"
glib-compile-schemas --strict "$extension_dir/schemas"
printf 'Kuruldu: %s\n' "$extension_dir"
if timeout 10s gnome-extensions enable material-weather@reisub.local; then
    printf 'Eklenti etkinleştirildi.\n'
else
    gjs -c 'const Gio = imports.gi.Gio;
        const settings = new Gio.Settings({schema_id: "org.gnome.shell"});
        const enabled = settings.get_strv("enabled-extensions");
        const uuid = "material-weather@reisub.local";
        if (!enabled.includes(uuid)) settings.set_strv("enabled-extensions", [...enabled, uuid]);
        const disabled = settings.get_strv("disabled-extensions");
        if (disabled.includes(uuid)) settings.set_strv("disabled-extensions", disabled.filter(value => value !== uuid));
        Gio.Settings.sync();'
    printf 'Eklenti sonraki oturum için etkinleştirildi. Görünmesi için oturumu kapatıp aç.\n'
fi
