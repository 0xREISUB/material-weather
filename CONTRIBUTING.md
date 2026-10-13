# Contributing

Material Weather targets GNOME Shell 46. Please read the [pull request rules](README.md#pull-request-kuralları) before submitting a change.

- Keep each pull request focused on one purpose and explain the resulting behavior.
- Run `npm test` and `bash scripts/package.sh`. State any checks you could not perform.
- For translations, follow the [language guide](README.md#çoklu-dil-desteği--languages). Keep all keys and placeholders, and request review by a native speaker.
- For interface changes, check English/Turkish, light/dark themes, keyboard navigation, and the affected scrolling or sizing behavior. Include relevant screenshots.
- Keep credentials, personal settings, logs, generated packages, and `.preview/` out of commits.
- Contributions to the source code and SVG icons must be compatible with GPL-2.0-or-later; preserve third-party copyright and license notices.

Release preparation and GNOME submission are documented in [docs/GNOME_SUBMISSION.md](docs/GNOME_SUBMISSION.md). Project owner review is required before merging or publishing.
