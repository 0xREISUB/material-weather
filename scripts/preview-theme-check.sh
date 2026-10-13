#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
preview_root="$project_dir/.preview"
export GSETTINGS_SCHEMA_DIR="$XDG_DATA_HOME/gnome-shell/extensions/material-weather@reisub.local/schemas"
assert_theme() {
    sleep .2
    local result
    result=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.panel.statusArea[\"material-weather@reisub.local\"].menu.box.has_style_class_name(\"mw-light\") === $1")
    [[ $result == "(true, 'true')" ]] || { printf 'Theme check failed: %s\n' "$result"; return 1; }
}
gsettings set org.gnome.shell.extensions.material-weather theme-mode dark
assert_theme false
result=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '(() => { const c=Main.panel.statusArea["material-weather@reisub.local"].menu.box.get_theme_node().get_background_color(); return c.red===28 && c.green===27 && c.blue===32; })()')
[[ $result == "(true, 'true')" ]]
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false "$preview_root/theme-dark.png"
gsettings set org.gnome.shell.extensions.material-weather theme-mode light
assert_theme true
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false "$preview_root/theme-light.png"
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
assert_theme true
gsettings set org.gnome.shell.extensions.material-weather theme-mode system
assert_theme false
gsettings set org.gnome.desktop.interface color-scheme prefer-light
assert_theme true
gsettings set org.gnome.shell.extensions.material-weather theme-mode dark
assert_theme false
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
assert_theme false
gsettings set org.gnome.shell.extensions.material-weather theme-mode system
gsettings set org.gnome.desktop.interface color-scheme default
gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark
assert_theme false
gsettings set org.gnome.desktop.interface gtk-theme Adwaita
assert_theme true
printf 'THEME_CHECK_PASSED: manual, automatic, GTK fallback, original dark background.\n'
cd "$project_dir"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.panel.statusArea["material-weather@reisub.local"].menu.close();'
gjs -m scripts/prefs-smoke.js > "$preview_root/prefs-theme.log" 2>&1 &
preview_prefs_pid=$!
sleep 2
grep -q 'Preferences constructed successfully' "$preview_root/prefs-theme.log"
printf 'PREFS_THEME_CHECK_PASSED\n'
wait "$preview_prefs_pid"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.panel.statusArea["material-weather@reisub.local"].menu.open();'
