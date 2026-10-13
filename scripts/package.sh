#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
package_mode="${1:-local}"
if [[ "$#" -gt 1 || ( "$package_mode" != local && "$package_mode" != --ego ) ]]; then
    printf 'Kullanım: bash scripts/package.sh [--ego]\n' >&2
    exit 1
fi
package_stage="$(mktemp -d)"
trap 'rm -rf -- "$package_stage"' EXIT
mkdir -p "$package_stage"/{schemas,icons,locales} "$project_dir/dist"
cp "$project_dir"/{metadata.json,extension.js,weather.js,i18n.js,prefs.js,stylesheet.css,LICENSE} "$package_stage/"
cp "$project_dir"/schemas/*.xml "$package_stage/schemas/"
cp "$project_dir"/icons/*.svg "$package_stage/icons/"
cp "$project_dir"/locales/*.js "$package_stage/locales/"
package_name='material-weather@reisub.local.shell-extension.zip'
if [[ "$package_mode" == --ego ]]; then
    python3 - "$package_stage/metadata.json" <<'PY'
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

path = Path(sys.argv[1])
metadata = json.loads(path.read_text())
url = urlparse(metadata.get('url', ''))
if url.scheme != 'https' or not url.netloc or not url.path.strip('/'):
    sys.exit('GNOME paketi için metadata.json içine gerçek HTTPS depo URL’sini ekle (url alanı).')
metadata.pop('version', None)  # GNOME Extensions assigns the submission version.
path.write_text(json.dumps(metadata, indent=2) + '\n')
PY
    package_name='material-weather@reisub.local.ego.shell-extension.zip'
fi
glib-compile-schemas --strict "$package_stage/schemas"
cd "$package_stage"
zip -q -r "$package_stage/extension.zip" metadata.json extension.js weather.js i18n.js prefs.js stylesheet.css LICENSE schemas icons locales
mv "$package_stage/extension.zip" "$project_dir/dist/$package_name"
printf 'Paket: %s/dist/%s\n' "$project_dir" "$package_name"
