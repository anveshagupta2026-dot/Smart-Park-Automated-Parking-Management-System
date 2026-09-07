// admin/js/charts.js — small SVG charts, no dependencies. All colours via CSS vars.

const NS = "http://www.w3.org/2000/svg";
const el = (t, a = {}, txt) => { const n = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); if (txt != null) n.textContent = txt; return n; };
const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Vertical bar chart. data: [{label, value, hint?}] */
export function bars(container, data, { height = 180, color = "var(--route)", labelEvery = 1, yFmt = fmtINR, highlight = () => false } = {}) {
  container.innerHTML = "";
  const W = 720, H = height, padL = 46, padB = 26, padT = 12;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length || 1, gap = 3, bw = Math.max(2, (W - padL - 8) / n - gap);
  // gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (H - padT - padB) * (1 - i / 4);
    svg.appendChild(el("line", { x1: padL, x2: W - 4, y1: y, y2: y, class: "grid" }));
    svg.appendChild(el("text", { x: padL - 6, y: y + 3, class: "ax", "text-anchor": "end" }, yFmt(max * i / 4)));
  }
  data.forEach((d, i) => {
    const h = (H - padT - padB) * (d.value / max);
    const x = padL + i * (bw + gap), y = H - padB - h;
    const r = el("rect", { x, y, width: bw, height: Math.max(0, h), rx: 2, fill: highlight(d, i) ? "var(--warn)" : color, class: "bar" });
    r.appendChild(el("title", {}, `${d.hint || d.label}: ${yFmt(d.value)}`));
    svg.appendChild(r);
    if (i % labelEvery === 0) svg.appendChild(el("text", { x: x + bw / 2, y: H - 8, class: "ax", "text-anchor": "middle" }, d.label));
  });
  container.appendChild(svg);
}

/** Weekday × hour heatmap. grid: 7 arrays of 24 numbers. */
export function heatmap(container, grid, { labelFmt = fmtINR } = {}) {
  container.innerHTML = "";
  const W = 720, H = 190, padL = 34, padT = 18, cw = (W - padL - 6) / 24, ch = (H - padT - 4) / 7;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
  const max = Math.max(1, ...grid.flat());
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let h = 0; h < 24; h += 3) svg.appendChild(el("text", { x: padL + h * cw + cw / 2, y: 12, class: "ax", "text-anchor": "middle" }, `${h}h`));
  grid.forEach((row, d) => {
    svg.appendChild(el("text", { x: padL - 6, y: padT + d * ch + ch / 2 + 3, class: "ax", "text-anchor": "end" }, days[d]));
    row.forEach((v, h) => {
      const a = v / max;
      const r = el("rect", { x: padL + h * cw + 1, y: padT + d * ch + 1, width: cw - 2, height: ch - 2, rx: 2,
        fill: "var(--route)", "fill-opacity": (0.08 + a * 0.92).toFixed(2), stroke: a > 0.85 ? "var(--warn)" : "none", "stroke-width": 2 });
      r.appendChild(el("title", {}, `${days[d]} ${h}:00 — ${labelFmt(v)}`));
      svg.appendChild(r);
    });
  });
  container.appendChild(svg);
}

/** Horizontal ranked bars. data: [{label, value}] */
export function ranked(container, data, { fmt = fmtINR, color = "var(--free)" } = {}) {
  container.innerHTML = "";
  const max = Math.max(1, ...data.map(d => d.value));
  data.forEach(d => {
    const row = document.createElement("div"); row.className = "rank";
    row.innerHTML = `<span class="rl">${d.label}</span><span class="rb"><i style="width:${d.value / max * 100}%; background:${color}"></i></span><span class="rv">${fmt(d.value)}</span>`;
    container.appendChild(row);
  });
}

/** Two-tone sparkline for comparisons. a, b: number arrays of equal length. */
export function sparkPair(container, a, b, { height = 60 } = {}) {
  container.innerHTML = "";
  const W = 300, H = height, max = Math.max(1, ...a, ...b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
  const path = (arr, cls) => {
    const pts = arr.map((v, i) => `${(i / Math.max(1, arr.length - 1)) * (W - 4) + 2},${H - 4 - (v / max) * (H - 8)}`).join(" ");
    svg.appendChild(el("polyline", { points: pts, class: cls, fill: "none" }));
  };
  path(b, "spark prev"); path(a, "spark cur");
  container.appendChild(svg);
}

export const CHART_CSS = `
.chart{width:100%; height:auto; display:block;}
.chart .grid{stroke:var(--line); stroke-width:1;}
.chart .ax{font:600 10px 'Space Grotesk', system-ui, sans-serif; fill:var(--muted);}
.chart .bar{transition:fill .15s;} .chart .bar:hover{fill:var(--ink);}
.chart .spark{stroke-width:2; stroke-linejoin:round; stroke-linecap:round;}
.chart .spark.cur{stroke:var(--route);} .chart .spark.prev{stroke:var(--line); stroke-dasharray:4 3;}
.rank{display:grid; grid-template-columns:70px 1fr 74px; gap:10px; align-items:center; font-size:12px; margin-bottom:6px;}
.rank .rl{font-family:'JetBrains Mono',monospace; font-weight:700;}
.rank .rb{height:10px; background:var(--line);} .rank .rb i{display:block; height:100%;}
.rank .rv{text-align:right; font-variant-numeric:tabular-nums; color:var(--muted);}
`;
