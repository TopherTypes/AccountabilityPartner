# Accountability Partner

A lightweight, browser-based accountability tracker for daily entries and weekly rollups.

## Features
- Daily logging for physiology, execution, and reflection.
- Weekly structure tracking (priorities, completion, review).
- Weekly dashboard with summaries and history.
- Local-first persistence via `localStorage`.
- JSON import/export for day, week, and full dataset backups.

## Project structure
- `index.html` — semantic page markup and app layout.
- `styles.css` — centralized styling for layout and components.
- `app.js` — application logic for state, rendering, validation, and persistence.
- `CHANGELOG.md` — versioned release notes.

## Getting started
1. Clone or download the repository.
2. Open `index.html` in a modern browser.
3. Start logging a day and click **Save day**.

## Data model overview
- **Day schema**: `accountability_scorecard.day.v3`
- **Week schema**: `accountability_scorecard.week.v3`
- **All-data schema**: `accountability_scorecard.all.v3`

Data is stored under the browser key: `accountability_daily_scorecard_v1`.


## Schema migration notes (v2 → v3)
- v3 exports now include a `metric_definitions` block (snapshot or reference metadata) so metric meaning can be reconstructed offline without live app state.
- Import remains backward compatible with `day.v2`, `week.v2`, and `all.v2`. Legacy day fields are mapped into stable metric IDs in the v3 `metrics` object during import/migration.
- Import/export paths are version-gated. Unknown future schemas (for example, `*.v4`) are rejected with a clear status message instead of best-effort parsing.

## Suggested next improvements
- Add automated tests (unit tests for helpers and integration tests for UI flows).
- Introduce linting/formatting (`ESLint`, `Prettier`) with CI checks.
- Add accessibility enhancements (focus-visible styles, ARIA live regions for status updates).
- Add configurable scoring/targets and trends charts.
- Add optional encrypted export/import for sensitive personal data.

## Contributing
1. Create a feature branch.
2. Keep HTML, CSS, and JS concerns separated.
3. Add clear, intent-based comments for non-obvious logic.
4. Update `CHANGELOG.md` for user-visible changes.

