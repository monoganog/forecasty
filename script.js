document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const form = document.getElementById("entry-form");
  const dateInput = document.getElementById("date");
  const valueInput = document.getElementById("value");
  const tableBody = document.querySelector("#data-table tbody");
  const forecastBtn = document.getElementById("forecast-btn");
  const horizonInput = document.getElementById("horizon");
  const chartCanvas = document.getElementById("chart");
  const summary = document.getElementById("summary");
  const forecastOutput = document.getElementById("forecast-output");
  const sampleBtn = document.getElementById("sample-btn");
  const clearBtn = document.getElementById("clear-btn");
  const algToggle = document.getElementById("alg-toggle");
  const algPanel = document.getElementById("alg-panel");
  const algApply = document.getElementById("alg-apply");
  const algLinear = document.getElementById("alg-linear");
  const algMA = document.getElementById("alg-ma");
  const algNaive = document.getElementById("alg-naive");
  // Holt and Log-linear removed
  const maWindowInput = document.getElementById("ma-window");
  let chart = null;

  // Persistence
  function loadData() {
    const raw = localStorage.getItem("forecasty-data");
    return raw ? JSON.parse(raw) : [];
  }

  function saveData(data) {
    localStorage.setItem("forecasty-data", JSON.stringify(data));
  }

  // UI
  function renderTable() {
    const data = loadData();
    tableBody.innerHTML = "";
    data.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.date}</td><td>${row.value}</td><td><button data-i="${i}" class="del">Delete</button></td>`;
      tableBody.appendChild(tr);
    });
    renderSummary();
  }

  function renderSummary() {
    const data = loadData();
    if (data.length === 0) {
      summary.textContent = "No data yet";
      forecastOutput.textContent = "";
      if (chart) {
        chart.destroy();
        chart = null;
      }
      return;
    }
    const latest = data[data.length - 1];
    summary.innerHTML = `<strong>Latest</strong>: ${latest.date} — ${latest.value}`;
  }

  // Simple linear regression (x in days since epoch -> y value)
  function linearFit(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) * (xs[i] - meanX);
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    return { slope, intercept };
  }

  function preparePointsForRegression(data) {
    // Determine average interval between consecutive input dates (days)
    const dates = data.map((d) => new Date(d.date));
    const diffs = [];
    for (let i = 1; i < dates.length; i++) {
      diffs.push((dates[i].getTime() - dates[i - 1].getTime()) / 86400000);
    }
    const avgIntervalDays = diffs.length
      ? diffs.reduce((a, b) => a + b, 0) / diffs.length
      : 1;

    // Use index-based x values (0,1,2,...) so regression treats points as equally spaced.
    // This keeps forecast steps equal to the average observed interval.
    const points = data.map((d, i) => ({ x: i, y: Number(d.value) }));
    return { points, avgIntervalDays };
  }

  // horizonMonths is the number of future points (months) to predict
  function forecast(horizonMonths) {
    const data = loadData();
    if (data.length < 2) {
      alert("Add at least 2 points to forecast");
      return;
    }
    const { points, avgIntervalDays } = preparePointsForRegression(data);
    const { slope, intercept } = linearFit(points);
    const lastIndex = points[points.length - 1].x;
    const preds = [];
    const labels = [];
    const lastDate = new Date(data[data.length - 1].date);
    for (let m = 1; m <= horizonMonths; m++) {
      const x = lastIndex + m; // index-based step
      const y = intercept + slope * x;
      preds.push(Number(y.toFixed(4)));
      // add m calendar months to lastDate, preserving day when possible
      const d = new Date(lastDate.getTime());
      const targetMonth = d.getMonth() + m;
      const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
      const month = targetMonth % 12;
      const day = d.getDate();
      // handle months with fewer days by taking the min
      const daysInTarget = new Date(targetYear, month + 1, 0).getDate();
      const finalDay = Math.min(day, daysInTarget);
      const date = new Date(targetYear, month, finalDay);
      labels.push(date.toISOString().slice(0, 10));
    }
    return { preds, labels, slope, intercept, avgIntervalDays };
  }

  function drawChart(data, forecastResult) {
    const ctx = chartCanvas.getContext("2d");
    if (chart) chart.destroy();
    const actualLabels = data.map((d) => d.date);
    const actualVals = data.map((d) => Number(d.value));
    const labels = actualLabels.concat(forecastResult.labels);
    const forecastData = new Array(data.length)
      .fill(null)
      .concat(forecastResult.preds);
    // build datasets: always include actuals
    const datasets = [
      {
        label: "Actual",
        data: actualVals,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.08)",
        tension: 0.2,
      },
    ];

    // helper to pad forecast arrays for chart alignment
    function padForecast(arr) {
      return new Array(data.length).fill(null).concat(arr);
    }

    // linear
    if (forecastResult.linear) {
      datasets.push({
        label: "Linear",
        data: padForecast(forecastResult.linear.preds),
        borderColor: "#ef4444",
        borderDash: [6, 4],
        tension: 0.2,
      });
    }
    // moving average
    if (forecastResult.ma) {
      datasets.push({
        label: `MA(${forecastResult.ma.window})`,
        data: padForecast(forecastResult.ma.preds),
        borderColor: "#f59e0b",
        borderDash: [4, 2],
        tension: 0.2,
      });
    }
    // naive
    if (forecastResult.naive) {
      datasets.push({
        label: "Naive",
        data: padForecast(forecastResult.naive.preds),
        borderColor: "#7c3aed",
        borderDash: [3, 3],
        tension: 0.2,
      });
    }

    chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: { x: { display: true }, y: { display: true } },
      },
    });
  }

  // algorithm panel toggling
  algToggle.addEventListener("click", () => {
    algPanel.classList.toggle("hidden");
  });

  function computeMA(values, window, steps) {
    // Instead of a simple flat multi-step MA, fit a straight line (OLS)
    // to the last `window` points and extrapolate. This preserves the
    // smoothing of MA while allowing multi-step trend projection.
    const n = values.length;
    if (n === 0) return new Array(steps).fill(0);
    const start = Math.max(0, n - window);
    const xs = [];
    const ys = [];
    for (let i = start; i < n; i++) {
      xs.push(i - start); // 0..(m-1)
      ys.push(values[i]);
    }
    const m = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / m;
    const meanY = ys.reduce((a, b) => a + b, 0) / m;
    let num = 0,
      den = 0;
    for (let i = 0; i < m; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) * (xs[i] - meanX);
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const lastX = m - 1;
    const res = [];
    for (let h = 1; h <= steps; h++) {
      const x = lastX + h;
      res.push(Number((intercept + slope * x).toFixed(4)));
    }
    return res;
  }

  // Exponential smoothing removed per user request.

  function computeNaive(values, steps) {
    const last = values[values.length - 1];
    return new Array(steps).fill(Number(last.toFixed ? last.toFixed(4) : last));
  }

  // Holt's linear method (simple double exponential smoothing)
  // (Holt and Log-linear implementations moved to modules)

  algApply.addEventListener("click", () => {
    // re-run forecast with selected algorithms
    const data = loadData();
    if (data.length < 1) return;
    const horizon = parseInt(horizonInput.value, 10) || 6;
    const values = data.map((d) => Number(d.value));
    const res = { labels: [], linear: null, ma: null, naive: null };
    // reuse existing forecast to get labels
    const base = forecast(horizon);
    res.labels = base.labels;
    if (algLinear.checked) res.linear = { preds: base.preds };
    if (algMA.checked)
      res.ma = {
        window: parseInt(maWindowInput.value, 10) || 3,
        preds: computeMA(
          values,
          parseInt(maWindowInput.value, 10) || 3,
          horizon
        ),
      };
    if (algNaive.checked) res.naive = { preds: computeNaive(values, horizon) };
    // holt/log removed
    forecastOutput.textContent = "";
    drawChart(data, res);
  });

  // Handlers
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = dateInput.value;
    const v = parseFloat(valueInput.value);
    if (!d || Number.isNaN(v)) return;
    const data = loadData();
    data.push({ date: d, value: v });
    data.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveData(data);
    renderTable();
    form.reset();
  });

  tableBody.addEventListener("click", (e) => {
    if (e.target.matches(".del")) {
      const i = parseInt(e.target.dataset.i, 10);
      const data = loadData();
      data.splice(i, 1);
      saveData(data);
      renderTable();
    }
  });

  forecastBtn.addEventListener("click", () => {
    const data = loadData();
    if (data.length < 2) {
      alert("Add at least 2 points to forecast");
      return;
    }
    const horizon = parseInt(horizonInput.value, 10) || 6;
    const values = data.map((d) => Number(d.value));
    const res = { labels: [], linear: null, ma: null, naive: null };
    const base = forecast(horizon);
    res.labels = base.labels;
    if (algLinear.checked) res.linear = { preds: base.preds };
    if (algMA.checked)
      res.ma = {
        window: parseInt(maWindowInput.value, 10) || 3,
        preds: computeMA(
          values,
          parseInt(maWindowInput.value, 10) || 3,
          horizon
        ),
      };
    if (algNaive.checked) res.naive = { preds: computeNaive(values, horizon) };
    // holt/log removed
    forecastOutput.textContent = "";
    drawChart(data, res);
  });

  sampleBtn.addEventListener("click", () => {
    // Hardcoded 12-month series trending from ~0 to 5000 (start 2024-09-01)
    const sample = [
      { date: "2024-09-01", value: 0 },
      { date: "2024-10-01", value: 50 },
      { date: "2024-11-01", value: 150 },
      { date: "2024-12-01", value: 350 },
      { date: "2025-01-01", value: 700 },
      { date: "2025-02-01", value: 1200 },
      { date: "2025-03-01", value: 1800 },
      { date: "2025-04-01", value: 2600 },
      { date: "2025-05-01", value: 3400 },
      { date: "2025-06-01", value: 4100 },
      { date: "2025-07-01", value: 4700 },
      { date: "2025-08-01", value: 5000 },
    ];
    saveData(sample);
    renderTable();
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all data?")) return;
    saveData([]);
    renderTable();
  });

  // init
  renderTable();
});
