# Design System Layer

This directory owns shared visual tokens and non-component design constants for the app.

Reusable React components that apply these tokens should live in `src/components/ka`.

Current modules:

- `category-styles.ts`: semantic badge/color classes for common Kingdom Adventures categories.

Rules:

- Do not invent category colors in page files.
- Use semantic names such as `shop`, `house`, `facility`, `survey`, `warning`, or `success`.
- If a visual pattern appears on more than one page, promote it to `src/components/ka`.
