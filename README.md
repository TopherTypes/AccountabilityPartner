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
- **Day schema**: `accountability_scorecard.day.v2`
- **Week schema**: `accountability_scorecard.week.v2`
- **All-data schema**: `accountability_scorecard.all.v2`

Data is stored under the browser key: `accountability_daily_scorecard_v1`.

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

