# Changelog

All notable changes to this project are documented in this file.

## [v0.3.0] - 2026-02-25
### Added
- Added v3 export metadata for day/week/all payloads with metric-definition snapshots/references to preserve metric meaning offline.
- Added explicit schema version-gating during import so unknown future schema versions fail safely with clear status messaging.

### Changed
- Export handlers now emit `accountability_scorecard.day.v3`, `week.v3`, and `all.v3` payloads.
- Import handlers now accept both v2 and v3 payloads, mapping v2 legacy day fields into v3 metric IDs during normalization.
- Compatibility and migration code now includes inline comments describing assumptions and fallback behavior.

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
