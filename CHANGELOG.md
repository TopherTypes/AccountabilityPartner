# Changelog

All notable changes to this project are documented in this file.

## [v0.2.0] - 2026-02-25
### Added
- Added a metric-management panel with effective-date controls and version history visibility.

### Changed
- Metric definitions now normalize/persist inclusive validity windows (`active_from`, optional `active_to`).
- Editing a metric creates a new definition row and closes the prior row window instead of mutating history.
- Removing a metric now soft-retires the active definition by setting `active_to`.
- Day rendering and weekly summaries now resolve definition versions by each day's date to preserve historical correctness.

## [v0.1.0] - 2026-02-25
### Added
- Initial `README.md` with setup, structure, and roadmap guidance.
- Initial `CHANGELOG.md` for version tracking.

### Changed
- Refactored monolithic `index.html` into:
  - `index.html` for structure/markup,
  - `styles.css` for styling,
  - `app.js` for behavior and data logic.
- Added a `noscript` fallback message to clarify JavaScript requirements.
