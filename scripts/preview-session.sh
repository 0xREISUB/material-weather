#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
preview_root="$project_dir/.preview"
gsettings set org.gnome.shell enabled-extensions "['material-weather@reisub.local']"
GSETTINGS_SCHEMA_DIR="$XDG_DATA_HOME/gnome-shell/extensions/material-weather@reisub.local/schemas" gsettings set org.gnome.shell.extensions.material-weather forecast-model ecmwf_ifs
printf '%s' "$DBUS_SESSION_BUS_ADDRESS" > "$preview_root/dbus-address"
gnome-shell --x11 --unsafe-mode --mode=user > "$preview_root/shell.log" 2>&1 &
preview_shell_pid=$!
trap 'kill "$preview_shell_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
    if gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.ListExtensions > "$preview_root/extensions.txt" 2>/dev/null; then break; fi
    sleep 1
done
sleep 4
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.panel.statusArea["material-weather@reisub.local"].menu.open();'
sleep 2
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false "$preview_root/preview.png"
if [[ ${MW_PREVIEW_THEME_CHECK:-0} == 1 ]]; then
    bash "$project_dir/scripts/preview-theme-check.sh" > "$preview_root/theme-check.log" 2>&1 || printf "THEME_CHECK_FAILED; pencere açık kalacak.\n"
fi
printf 'PREVIEW_READY; kullanıcı testi bitirmeden kapatılmaz.\n'
wait "$preview_shell_pid"
