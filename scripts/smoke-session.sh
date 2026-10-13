#!/usr/bin/env bash
# Run only inside an isolated D-Bus session / test display.
set -euo pipefail
if [[ ${GSETTINGS_BACKEND:-} != keyfile || ${XDG_CONFIG_HOME:-} != /tmp/material-weather-test/config ]]; then
    printf 'Use the isolated test config and GSETTINGS_BACKEND=keyfile.\n' >&2
    exit 1
fi
gsettings set org.gnome.shell enabled-extensions "['material-weather@reisub.local']"
GSETTINGS_SCHEMA_DIR="$PWD/schemas" gsettings set org.gnome.shell.extensions.material-weather forecast-model best_match
gnome-shell --x11 --unsafe-mode > /tmp/material-weather-test/shell.log 2>&1 &
shell_pid=$!
trap 'kill "$shell_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
    if gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.ListExtensions > /tmp/material-weather-test/extensions.txt 2>/dev/null; then break; fi
    sleep 1
done
sleep 6
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'JSON.stringify(Main.extensionManager.lookup("material-weather@reisub.local").state)'
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.panel.statusArea["material-weather@reisub.local"].menu.open();'
sleep 2

result=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '(() => { const walk = actor => [actor, ...actor.get_children().flatMap(walk)]; const actors = walk(Main.panel.statusArea["material-weather@reisub.local"].menu.box); return actors.filter(actor => actor.style_class?.split(" ").includes("mw-hour-column")).length >= 24 && actors.filter(actor => actor.style_class?.split(" ").includes("mw-day")).length === 5 && !actors.some(actor => actor.text === "Şimdi"); })()')
printf '%s\n' "$result"
[[ $result == "(true, 'true')" ]]
GSETTINGS_SCHEMA_DIR="$PWD/schemas" gsettings set org.gnome.shell.extensions.material-weather forecast-model ecmwf_ifs
sleep 2
result=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '(() => { const walk = actor => [actor, ...actor.get_children().flatMap(walk)]; const actors = walk(Main.panel.statusArea["material-weather@reisub.local"].menu.box); return actors.some(actor => actor.text?.startsWith("ECMWF IFS")) && actors.filter(actor => actor.style_class?.split(" ").includes("mw-hour-column")).length >= 24; })()')
printf '%s\n' "$result"
[[ $result == "(true, 'true')" ]]
printf 'Compact hourly strip, daily section and live model change verified.\n'
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false /tmp/material-weather-test/preview.png
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.panel.statusArea["material-weather@reisub.local"].menu.close();'
gjs -m scripts/prefs-smoke.js > /tmp/material-weather-test/prefs.log 2>&1 &
prefs_pid=$!
for attempt in {1..40}; do
    if rg -q 'Preferences constructed successfully' /tmp/material-weather-test/prefs.log; then break; fi
    if ! kill -0 "$prefs_pid" 2>/dev/null; then cat /tmp/material-weather-test/prefs.log; exit 1; fi
    sleep 1
done
rg -q 'Preferences constructed successfully' /tmp/material-weather-test/prefs.log
sleep 1
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.Screenshot false false /tmp/material-weather-test/preferences.png
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.extensionManager.disableExtension("material-weather@reisub.local");'
sleep 1
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'Main.extensionManager.enableExtension("material-weather@reisub.local");'
sleep 2
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval 'JSON.stringify(Main.extensionManager.lookup("material-weather@reisub.local").state)'
kill "$prefs_pid" 2>/dev/null || true
