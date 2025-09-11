forecasty.app

A tiny single-page browser forecasting tool that fits in a few files.

What it does

- Let users add date → numeric value points.
- Store data in localStorage.
- Fit a simple linear regression on time (days) to predict a user-chosen horizon.
- Show actuals + forecast on a small Chart.js line chart.

Files

- `index.html` — UI and app structure.
- `script.js` — app logic, persistence, regression and chart drawing.
- `style.css` — minimal styles.

Notes

- Data is stored in your browser's localStorage under key `forecasty-data`.
- Forecasty is a basic linear trend on time; it is intentionally simple.

License

MIT
