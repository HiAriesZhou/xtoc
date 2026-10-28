// Small chart builders for the Analytics page. They return HTML/SVG strings;
// every dynamic value passes through esc(). Lines scale with the container
// (non-scaling strokes), and labels, dots and crosshairs are HTML on top so
// they never stretch. Hover details come from data attributes (see
// attachChartHover).
import { esc } from './ui.js';

const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fullFormat = new Intl.NumberFormat('en-US');

export const formatters = {
  number: (v) => (v === null || v === undefined ? '–' : fullFormat.format(Math.round(v))),
  compact: (v) => (v === null || v === undefined ? '–' : compactFormat.format(Math.abs(v) < 1000 ? Math.round(v) : v)),
  percent: (v) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`),
  signed: (v) => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${fullFormat.format(v)}`),
  multiple: (v) => (v === null || v === undefined ? '–' : `${v.toFixed(v < 10 ? 1 : 0)}×`)
};

export const format = (value, kind = 'number') => (formatters[kind] || formatters.number)(value);

// Rounds an axis maximum up to 1, 2 or 5 × 10^n.
export function niceMax(value) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value);
  return step * power;
}

const shortDay = (key) => {
  const date = new Date(`${key}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// Path through the points, broken where values are missing.
function linePath(values, max) {
  const n = values.length;
  let d = '';
  let open = false;
  values.forEach((value, i) => {
    if (value === null || value === undefined) {
      open = false;
      return;
    }
    const x = n === 1 ? 500 : (i / (n - 1)) * 1000;
    const y = 100 - (value / max) * 100;
    d += `${open ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(2)}`;
    open = true;
  });
  return d;
}

function areaPath(values, max) {
  const n = values.length;
  const segments = [];
  let current = [];
  values.forEach((value, i) => {
    if (value === null || value === undefined) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push([n === 1 ? 500 : (i / (n - 1)) * 1000, 100 - (value / max) * 100]);
  });
  if (current.length) segments.push(current);
  return segments
    .map((pts) => `M${pts[0][0]},100${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(2)}`).join('')}L${pts.at(-1)[0]},100Z`)
    .join('');
}

const gridLines = (max, kind) =>
  [0, 0.5, 1]
    .map((share) => `<div class="viz-gridline" style="bottom:${share * 100}%"><span>${esc(format(max * share, kind === 'percent' ? 'percent' : 'compact'))}</span></div>`)
    .join('');

const xAxis = (days) => {
  if (!days.length) return '';
  const picks = days.length > 2 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : days.map((_, i) => i);
  return `<div class="viz-xaxis">${picks
    .map((i) => `<span style="left:${days.length === 1 ? 50 : (i / (days.length - 1)) * 100}%">${esc(shortDay(days[i]))}</span>`)
    .join('')}</div>`;
};

// One series over days: area wash + 2px line + end dot, hover crosshair.
export function lineChart({ days, values, kind = 'number', label, height = 160 }) {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (!present.length) return `<p class="viz-empty">No ${esc(label.toLowerCase())} data in this period.</p>`;
  const max = niceMax(Math.max(...present));
  const lastIndex = values.findLastIndex((v) => v !== null && v !== undefined);
  const n = values.length;
  const dotLeft = n === 1 ? 50 : (lastIndex / (n - 1)) * 100;
  const data = JSON.stringify({ days, values, kind, label });
  return `
    <div class="viz viz-line" data-chart="line" data-series="${esc(data)}" role="img" aria-label="${esc(`${label} by day, latest ${format(values[lastIndex], kind)}`)}">
      <div class="viz-plot" style="height:${height}px">
        ${gridLines(max, kind)}
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="viz-area" d="${areaPath(values, max)}"/>
          <path class="viz-stroke" d="${linePath(values, max)}" vector-effect="non-scaling-stroke"/>
        </svg>
        <span class="viz-dot" style="left:${dotLeft}%;bottom:${(values[lastIndex] / max) * 100}%"></span>
        <span class="viz-endlabel" style="left:${dotLeft}%;bottom:${(values[lastIndex] / max) * 100}%">${esc(format(values[lastIndex], kind === 'percent' ? 'percent' : 'compact'))}</span>
        <span class="viz-cross" hidden></span>
      </div>
      ${xAxis(days)}
    </div>`;
}

// Follows up, unfollows down, one shared scale; legend names both series.
export function divergingColumns({ days, up, down, upLabel, downLabel, height = 120 }) {
  const max = niceMax(Math.max(1, ...up, ...down));
  const columns = days
    .map((day, i) => {
      const tip = `${shortDay(day)} · ${upLabel} ${format(up[i])} · ${downLabel} ${format(down[i])}`;
      return `<div class="viz-col" data-viz-tip="${esc(tip)}">
        <span class="viz-half viz-half-up"><span class="viz-up" style="height:${(up[i] / max) * 100}%"></span></span>
        <span class="viz-half viz-half-down"><span class="viz-down" style="height:${(down[i] / max) * 100}%"></span></span>
      </div>`;
    })
    .join('');
  return `
    <div class="viz viz-diverging" role="img" aria-label="${esc(`${upLabel} and ${downLabel} by day`)}">
      <div class="viz-legend"><span><i class="key key-1"></i>${esc(upLabel)}</span><span><i class="key key-2"></i>${esc(downLabel)}</span></div>
      <div class="viz-plot viz-cols" style="height:${height}px"><div class="viz-zero"></div>${columns}</div>
      ${xAxis(days)}
    </div>`;
}

// Single-series columns (weekly cadence).
export function columns({ labels, values, kind = 'number', label, height = 110 }) {
  const max = niceMax(Math.max(1, ...values));
  const cols = labels
    .map(
      (key, i) =>
        `<div class="viz-col" data-viz-tip="${esc(`Week of ${shortDay(key)} · ${format(values[i], kind)} ${label.toLowerCase()}`)}"><span class="viz-up" style="height:${(values[i] / max) * 100}%"></span></div>`
    )
    .join('');
  return `
    <div class="viz viz-columns" role="img" aria-label="${esc(`${label} per week`)}">
      <div class="viz-plot viz-cols viz-cols-single" style="height:${height}px">${gridLines(max, kind)}${cols}</div>
      ${xAxis(labels)}
    </div>`;
}

// Horizontal bars for one measure across named groups.
export function barList(rows, { kind = 'number', valueLabel = '' } = {}) {
  if (!rows.length) return '<p class="viz-empty">Not enough data yet.</p>';
  const max = Math.max(...rows.map((row) => row.value || 0), 0) || 1;
  return `<div class="viz-bars">${rows
    .map(
      (row) => `
      <div class="viz-bar-row" data-viz-tip="${esc(`${row.label} · ${format(row.value, kind)}${valueLabel ? ` ${valueLabel}` : ''}${row.note ? ` · ${row.note}` : ''}`)}">
        <span class="viz-bar-label">${esc(row.label)}</span>
        <span class="viz-bar-track"><span class="viz-bar ${row.tone || ''}" style="width:${((row.value || 0) / max) * 100}%"></span></span>
        <span class="viz-bar-value">${esc(format(row.value, kind))}</span>
      </div>`
    )
    .join('')}</div>`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STEPS = 5;

// Weekday × hour grid on the sequential blue ramp (empty cells stay neutral).
export function heatmap(grid, { label, kind = 'compact', unit = '' }) {
  const values = grid.flat().map((cell) => cell.value).filter((v) => v !== null && v !== undefined);
  if (!values.length) return `<p class="viz-empty">No ${esc(label.toLowerCase())} data yet.</p>`;
  const max = Math.max(...values) || 1;
  const rows = grid
    .map(
      (row, day) =>
        `<span class="heat-day">${DAYS[day]}</span>${row
          .map((cell, hour) => {
            if (cell.value === null || cell.value === undefined) return '<span class="heat-cell"></span>';
            const step = Math.min(STEPS, Math.max(1, Math.ceil((cell.value / max) * STEPS)));
            const tip = `${DAYS[day]} ${String(hour).padStart(2, '0')}:00 · ${format(cell.value, kind)}${unit ? ` ${unit}` : ''}${cell.count ? ` · ${cell.count} ${cell.count === 1 ? 'sample' : 'samples'}` : ''}`;
            return `<span class="heat-cell q${step}" data-viz-tip="${esc(tip)}"></span>`;
          })
          .join('')}`
    )
    .join('');
  const hours = [0, 6, 12, 18, 23].map((h) => `<span style="grid-column:${h + 2}">${String(h).padStart(2, '0')}</span>`).join('');
  return `
    <div class="viz heat" role="img" aria-label="${esc(`${label} by weekday and hour, local time`)}">
      <div class="heat-grid">${rows}<span></span>${hours}</div>
      <div class="heat-scale"><span>Less</span>${Array.from({ length: STEPS }, (_, i) => `<i class="heat-cell q${i + 1}"></i>`).join('')}<span>More</span></div>
    </div>`;
}

export function sparkline(values, { width = 72, height = 22 } = {}) {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length < 2) return '';
  const max = Math.max(...present) || 1;
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="${linePath(values.map((v) => (v === null || v === undefined ? null : v * 0.9 + max * 0.05)), max)}" vector-effect="non-scaling-stroke"/></svg>`;
}

// Funnel: three stages on the ordinal ramp, with the rate between stages.
export function funnelChart(steps) {
  const max = steps[0]?.value || 1;
  return `<div class="funnel">${steps
    .map(
      (step, i) => `
      <div class="funnel-step" data-viz-tip="${esc(`${step.label} · ${format(step.value)}`)}">
        <span class="funnel-label">${esc(step.label)}</span>
        <span class="funnel-track"><span class="funnel-bar f${i + 1}" style="width:${Math.max(1.5, (step.value / max) * 100)}%"></span></span>
        <span class="funnel-value">${esc(format(step.value, 'compact'))}</span>
        <span class="funnel-rate">${step.stepRate === null ? '' : esc(`${format(step.stepRate, 'percent')} of previous`)}</span>
      </div>`
    )
    .join('')}</div>`;
}

// Table view: every charted value stays reachable without hover.
export function dataTable(headers, rows) {
  return `<details class="viz-table"><summary>Show data table</summary><div class="table-scroll"><table>
    <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

// One shared tooltip: data-viz-tip marks on hover/focus, crosshair on line charts.
export function attachChartHover(root) {
  let tip = document.querySelector('.viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.append(tip);
  }
  const place = (x, y) => {
    const pad = 12;
    const { width, height } = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - width - 8, x + pad)}px`;
    tip.style.top = `${Math.max(8, y - height - pad)}px`;
  };
  const show = (text, x, y) => {
    tip.textContent = text;
    tip.hidden = false;
    place(x, y);
  };
  const hide = () => {
    tip.hidden = true;
    root.querySelectorAll('.viz-cross').forEach((cross) => (cross.hidden = true));
  };

  root.onpointermove = (event) => {
    const mark = event.target.closest('[data-viz-tip]');
    if (mark && root.contains(mark)) return show(mark.dataset.vizTip, event.clientX, event.clientY);
    const chart = event.target.closest('[data-chart="line"]');
    if (!chart) return hide();
    const plot = chart.querySelector('.viz-plot');
    const { days, values, kind, label } = JSON.parse(chart.dataset.series);
    const rect = plot.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const i = Math.round(share * (days.length - 1));
    const cross = chart.querySelector('.viz-cross');
    cross.hidden = false;
    cross.style.left = `${days.length === 1 ? 50 : (i / (days.length - 1)) * 100}%`;
    show(`${format(values[i], kind)} ${label.toLowerCase()} · ${shortDay(days[i])}`, event.clientX, event.clientY);
  };
  root.onpointerleave = hide;
  // Properties, not listeners: the Library re-renders into the same element.
  root.onfocusin = (event) => {
    const mark = event.target.closest('[data-viz-tip]');
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    show(mark.dataset.vizTip, rect.left + rect.width / 2, rect.top);
  };
  root.onfocusout = hide;
  return hide;
}
