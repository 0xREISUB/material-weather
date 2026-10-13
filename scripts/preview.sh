#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
preview_root="$project_dir/.preview"
mkdir -p "$preview_root/config" "$preview_root/data/gnome-shell/extensions/material-weather@reisub.local"
export XDG_CONFIG_HOME="$preview_root/config"
export XDG_DATA_HOME="$preview_root/data"
export GSETTINGS_BACKEND=keyfile
extension_dir="$XDG_DATA_HOME/gnome-shell/extensions/material-weather@reisub.local"
cp "$project_dir"/{extension.js,weather.js,i18n.js,prefs.js,metadata.json,stylesheet.css} "$extension_dir/"
cp -r "$project_dir/icons" "$project_dir/schemas" "$project_dir/locales" "$extension_dir/"
for preview_number in {96..99}; do
    if [[ ! -e /tmp/.X${preview_number}-lock ]]; then break; fi
done
preview_display=":$preview_number"
Xephyr "$preview_display" -screen 1440x1000 -ac -noreset -title 'Material Weather - Tasarım testi' > "$preview_root/xephyr.log" 2>&1 &
preview_display_pid=$!
printf '%s' "$preview_display" > "$preview_root/display"
trap 'kill "$preview_display_pid" 2>/dev/null || true' EXIT
sleep 2
export DISPLAY="$preview_display"
unset WAYLAND_DISPLAY
dbus-run-session bash "$project_dir/scripts/preview-session.sh" > "$preview_root/session.log" 2>&1
