// js/blueprint.js — grid model + renderer. Elements come from catalog.js.
//
// In memory:    { cols, rows, matrix: cell[][] }
// In Firestore: { cols, rows, cells: { "r_c": cell } }   (no nested arrays)
// cell:         { el, rot?, id?, text? }   see catalog.js
//
// Bay STATUS is never stored here; it's overlaid from lots/{lotId}/slots.

import { CATALOG, el, isBay, isLaneLike, isWallLike, migrateCell } from "./catalog.js";
export { isBay } from "./catalog.js";

export const COLS = 12, ROWS = 8;
const CAR_GLYPH = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h2zm2.1 0h9.8l-1-3H8.1l-1 3zM6 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;

export const blank = (cols = COLS, rows = ROWS) =>
  ({ cols, rows, matrix: Array.from({ length: rows }, () => Array(cols).fill(null)) });

/** Starter plan: a cross of lanes, gates at each end, bays filling the aisles. */
export function starter(labels = [], cols = COLS, rows = ROWS) {
  const bp = blank(cols, rows), m = bp.matrix;
  const mc = Math.floor(cols / 2), mr = Math.floor(rows / 2);
  for (let c = 1; c < cols - 1; c++) m[mr][c] = { el:"lane" };
  for (let r = 1; r < rows - 1; r++) m[r][mc] = { el:"lane" };
  m[rows-1][mc] = { el:"gate-entry" };
  m[0][mc]      = { el:"gate-exit" };
  m[mr][mc-1]   = { el:"arrow-one", rot:0 };

  let i = 0;
  for (const r of [mr-1, mr+1, 1, rows-2]) {
    if (r < 0 || r >= rows) continue;
    for (let c = 1; c < cols - 1 && i < labels.length; c++)
      if (!m[r][c]) m[r][c] = { el:"bay", id: labels[i++] };
  }
  for (let r = 0; r < rows && i < labels.length; r++)
    for (let c = 0; c < cols && i < labels.length; c++)
      if (!m[r][c]) m[r][c] = { el:"bay", id: labels[i++] };
  return bp;
}

export function fromStore(store) {
  if (!store) return null;
  const rows = store.rows, cols = store.cols;
  // current format: matrix as [{c:[...]}, ...]
  if (Array.isArray(store.matrix)) {
    const m = store.matrix.map(r => Array.from({ length: cols }, (_, i) => migrateCell((r.c || r)[i] ?? null)));
    while (m.length < rows) m.push(Array(cols).fill(null));
    return { cols, rows, matrix: m };
  }
  // legacy format: {cells:{"r_c":cell}}
  if (store.cells) {
    const m = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const [k, cell] of Object.entries(store.cells)) {
      const [r, c] = k.split("_").map(Number);
      if (m[r] && c < cols) m[r][c] = migrateCell(cell);
    }
    return { cols, rows, matrix: m };
  }
  return null;
}
/** What we send to updateLotLayout: a plain 2-D array. The server wraps rows for Firestore. */
export function toStore(bp) {
  return { cols: bp.cols, rows: bp.rows, matrix: bp.matrix.map(r => r.map(c => c ?? null)) };
}
export const clone = (bp) =>
  ({ cols: bp.cols, rows: bp.rows, matrix: bp.matrix.map(r => r.map(c => c ? { ...c } : null)) });

/** Add or remove a row/column on one side, keeping content in place. */
export function grow(bp, side) {
  const m = bp.matrix.map(r => [...r]);
  if (side === "top")    { m.unshift(Array(bp.cols).fill(null)); return { cols:bp.cols, rows:bp.rows+1, matrix:m }; }
  if (side === "bottom") { m.push(Array(bp.cols).fill(null));    return { cols:bp.cols, rows:bp.rows+1, matrix:m }; }
  if (side === "left")   { m.forEach(r => r.unshift(null));      return { cols:bp.cols+1, rows:bp.rows, matrix:m }; }
  m.forEach(r => r.push(null));
  return { cols: bp.cols+1, rows: bp.rows, matrix: m };
}
export function shrink(bp, side) {
  if ((side === "top" || side === "bottom") && bp.rows <= 3) return bp;
  if ((side === "left" || side === "right") && bp.cols <= 3) return bp;
  const m = bp.matrix.map(r => [...r]);
  if (side === "top")    { m.shift();  return { cols:bp.cols, rows:bp.rows-1, matrix:m }; }
  if (side === "bottom") { m.pop();    return { cols:bp.cols, rows:bp.rows-1, matrix:m }; }
  if (side === "left")   { m.forEach(r => r.shift()); return { cols:bp.cols-1, rows:bp.rows, matrix:m }; }
  m.forEach(r => r.pop());
  return { cols: bp.cols-1, rows: bp.rows, matrix: m };
}

/** Sides a lane/wall connects to, so runs join up automatically. */
function arms(matrix, r, c, test) {
  const at = (rr, cc) => (matrix[rr] && matrix[rr][cc]) || null;
  const ok = (x) => test(x) || (x && (x.el === "gate-entry" || x.el === "gate-exit"));
  return { n: ok(at(r-1,c)), e: ok(at(r,c+1)), s: ok(at(r+1,c)), w: ok(at(r,c-1)) };
}

/** Merge live Firestore bays with the drawing. */
export function overlay(bp, docs, opts = { autoPlace: false }) {
  const byLabel = new Map(docs.map(d => [d.label || d.id.split("__").pop(), d]));
  const seen = new Set();
  const m = bp.matrix.map(row => row.map(cell => {
    if (!isBay(cell)) return cell;
    const d = byLabel.get(cell.id);
    if (!d) return { ...cell, state:"unprovisioned" };
    seen.add(cell.id);
    return { ...cell, state: d.status === "occupied" ? "taken" : "free", docId: d.id, ticketId: d.ticketId || null };
  }));
  const out = { cols: bp.cols, rows: bp.rows, matrix: m };
  if (!opts.autoPlace) return out;
  for (const [label, d] of byLabel) {
    if (seen.has(label)) continue;
    outer: for (let r = 0; r < out.rows; r++) for (let c = 0; c < out.cols; c++)
      if (!m[r][c]) { m[r][c] = { el:"bay", id:label, state: d.status === "occupied" ? "taken":"free", docId:d.id, ticketId:d.ticketId||null }; break outer; }
  }
  return out;
}

export function nearestFree(bp) {
  let g = null;
  bp.matrix.forEach((row,r) => row.forEach((cell,c) => { if (cell?.el === "gate-entry") g = { r, c }; }));
  if (!g) g = { r: bp.rows-1, c: 0 };
  let best = null;
  bp.matrix.forEach((row,r) => row.forEach((cell,c) => {
    if (isBay(cell) && cell.state === "free") {
      const d = Math.abs(r-g.r) + Math.abs(c-g.c);
      if (!best || d < best.d) best = { id: cell.id, d };
    }
  }));
  return best?.id ?? null;
}

/** Draw into a .bp-grid element. opts: { selectedId, highlightId, onCell } */
export function render(gridEl, bp, opts = {}) {
  gridEl.style.setProperty("--cols", bp.cols);
  const frag = document.createDocumentFragment();

  for (let r = 0; r < bp.rows; r++) for (let c = 0; c < bp.cols; c++) {
    const cell = bp.matrix[r][c];
    const div = document.createElement("div");
    div.className = "bp-cell";
    div.dataset.r = r; div.dataset.c = c;

    if (cell && cell.car) div.classList.add("car");
    if (!cell || !cell.el) { div.classList.add("is-empty"); if (cell?.car) div.innerHTML = CAR_GLYPH; frag.appendChild(div); continue; }
    const def = el(cell.el);
    if (!def) { div.classList.add("is-empty"); frag.appendChild(div); continue; }

    div.dataset.el = cell.el;
    div.classList.add("has-el", "tint-" + (def.tint || "ink"));
    if (cell.rot) div.style.setProperty("--rot", cell.rot + "deg");

    if (def.kind === "lane" || def.kind === "wall") {
      div.classList.add(def.kind === "lane" ? "is-lane" : "is-wall");
      const a = arms(bp.matrix, r, c, def.kind === "lane" ? isLaneLike : isWallLike);
      const hub = document.createElement("span"); hub.className = "hub"; div.appendChild(hub);
      for (const d of ["n","e","s","w"]) if (a[d]) {
        const s = document.createElement("span"); s.className = "arm arm-" + d; div.appendChild(s);
      }
      if (!a.n && !a.e && !a.s && !a.w) div.classList.add("lonely");
    } else if (def.consumes) {
      div.classList.add("is-bay", cell.state || "free");
      if (def.skew) div.classList.add("skew");
      if (cell.id === opts.selectedId) div.classList.add("selected");
      if (cell.id === opts.highlightId) div.classList.add("mine");
      div.dataset.id = cell.id;
      const ic = document.createElement("span"); ic.className = "gi"; ic.innerHTML = def.glyph; div.appendChild(ic);
      const t = document.createElement("span"); t.className = "tag"; t.textContent = cell.id; div.appendChild(t);
      if (cell.car) { const cv = document.createElement("span"); cv.className = "carmark"; cv.innerHTML = CAR_GLYPH; div.appendChild(cv); }
    } else {
      div.classList.add("is-prop");
      const ic = document.createElement("span"); ic.className = "gi"; ic.innerHTML = def.glyph; div.appendChild(ic);
      if (cell.text) { const t = document.createElement("span"); t.className = "tag sm"; t.textContent = cell.text; div.appendChild(t); }
    }
    frag.appendChild(div);
  }
  gridEl.replaceChildren(frag);
}

export const BP_CSS = `
.bp-grid{display:grid; grid-template-columns:repeat(var(--cols,12),1fr); gap:3px;
  transform-origin:50% 50%; transition:transform .35s cubic-bezier(.2,.8,.2,1);}
.bp-grid.iso{transform:rotateX(52deg) rotateZ(-22deg) scale(.86);}
.bp-cell{aspect-ratio:1; position:relative; border-radius:3px; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:1px; user-select:none;
  font:700 9px/1 'JetBrains Mono', ui-monospace, monospace; transition:background .12s, border-color .12s;}
.bp-cell .gi{display:block; width:58%; height:58%; transform:rotate(var(--rot,0deg)); transition:transform .18s;}
.bp-cell .gi svg{width:100%; height:100%; display:block;}
.bp-cell .tag{font-size:8.5px; letter-spacing:-.02em; line-height:1;}
.bp-cell .tag.sm{font-size:7.5px; opacity:.8;}

.bp-cell.is-empty{border:1px dashed var(--line);}
.bp-grid.editing .bp-cell.is-empty:hover{border-color:var(--ink); background:color-mix(in srgb,var(--ink) 8%,transparent);}
.bp-grid.editing .bp-cell{cursor:crosshair;}
.bp-grid.moving .bp-cell{cursor:grab;}

.bp-cell.is-bay{border:1.5px solid var(--free); background:var(--free-bg); color:var(--free);}
.bp-cell.is-bay.taken{border-color:var(--taken); background:var(--taken-bg); color:var(--taken);}
.bp-cell.is-bay.unprovisioned{border-style:dashed; border-color:var(--muted); background:transparent; color:var(--muted);}
.bp-cell.is-bay.skew{transform:skewX(-15deg);}
.bp-cell.is-bay.skew .gi,.bp-cell.is-bay.skew .tag{transform:skewX(15deg) rotate(var(--rot,0deg));}
.bp-cell.is-bay.selected{outline:3px solid var(--route); outline-offset:1px; z-index:3;}
.bp-cell.is-bay.mine{animation:bpPulse 1.5s ease-in-out infinite;}
.bp-cell.is-bay .gi{width:40%; height:40%; opacity:.85;}
.bp-cell.tint-route.is-bay{border-color:var(--route); color:var(--route); background:color-mix(in srgb,var(--route) 14%,transparent);}
.bp-cell.tint-warn.is-bay{border-color:var(--warn); color:var(--warn); background:color-mix(in srgb,var(--warn) 15%,transparent);}
.bp-cell.tint-route.is-bay.taken,.bp-cell.tint-warn.is-bay.taken{border-color:var(--taken); color:var(--taken); background:var(--taken-bg);}
@keyframes bpPulse{0%,100%{box-shadow:0 0 0 0 var(--route);}50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--route) 30%,transparent);}}
@media (prefers-reduced-motion:reduce){.bp-cell.is-bay.mine{animation:none;outline:3px solid var(--route);}.bp-grid{transition:none;}}

.bp-cell.is-lane .hub{position:absolute; left:50%; top:50%; width:34%; height:34%; transform:translate(-50%,-50%); background:var(--lane); border-radius:2px;}
.bp-cell.is-lane .arm{position:absolute; background:var(--lane);}
.bp-cell.is-wall .hub{position:absolute; left:50%; top:50%; width:46%; height:46%; transform:translate(-50%,-50%); background:var(--ink); border-radius:1px;}
.bp-cell.is-wall .arm{position:absolute; background:var(--ink);}
.bp-cell.is-lane .arm-n,.bp-cell.is-wall .arm-n{left:33%; width:34%; top:-4px; height:calc(53% + 4px);}
.bp-cell.is-lane .arm-s,.bp-cell.is-wall .arm-s{left:33%; width:34%; bottom:-4px; height:calc(53% + 4px);}
.bp-cell.is-lane .arm-w,.bp-cell.is-wall .arm-w{top:33%; height:34%; left:-4px; width:calc(53% + 4px);}
.bp-cell.is-lane .arm-e,.bp-cell.is-wall .arm-e{top:33%; height:34%; right:-4px; width:calc(53% + 4px);}
.bp-cell.is-wall .arm-n,.bp-cell.is-wall .arm-s{left:28%; width:44%;}
.bp-cell.is-wall .arm-w,.bp-cell.is-wall .arm-e{top:28%; height:44%;}
.bp-cell.is-lane.lonely .hub{width:44%; height:44%; border-radius:50%;}

.bp-cell.is-prop{border:1px solid transparent;}
.bp-cell.is-prop.tint-ink{color:var(--ink);}
.bp-cell.is-prop.tint-route{color:var(--route);}
.bp-cell.is-prop.tint-warn{color:var(--warn); }
.bp-cell.is-prop.tint-taken{color:var(--taken);}
.bp-cell.is-prop.tint-free{color:var(--free);}
.bp-cell.is-prop.tint-muted{color:var(--muted);}
.bp-cell[data-el="pillar"]{background:repeating-linear-gradient(45deg,var(--pillar-bg) 0 4px,var(--pillar) 4px 7px); border:1.5px solid var(--ink); border-radius:2px;}
.bp-cell[data-el="pillar"] .gi{opacity:.9;}
.bp-cell[data-el="gate-entry"]{background:var(--ink); color:var(--paper); box-shadow:inset 0 -3px 0 var(--free);}
.bp-cell[data-el="gate-exit"]{background:var(--ink); color:var(--paper); box-shadow:inset 0 -3px 0 var(--taken);}
.bp-cell[data-el="sign"],.bp-cell[data-el="height-limit"]{background:#FACC15; color:#161A1E; border:1.5px solid var(--ink);}
.bp-cell[data-el="no-parking"]{background:color-mix(in srgb,var(--taken) 14%,transparent); border:1.5px solid var(--taken);}
.bp-cell[data-el="mirror"]{background:color-mix(in srgb,var(--route) 12%,transparent); border-radius:50%;}
.bp-cell[data-el="crosswalk"],.bp-cell[data-el="speed-bump"],.bp-cell[data-el="ramp"],
.bp-cell[data-el="arrow-one"],.bp-cell[data-el="arrow-two"]{background:color-mix(in srgb,var(--lane) 45%,transparent);}
.bp-cell[data-el="kiosk"],.bp-cell[data-el="elevator"],.bp-cell[data-el="stairs"],
.bp-cell[data-el="pedestrian"],.bp-cell[data-el="cctv"],.bp-cell[data-el="bollard"],
.bp-cell[data-el="island"]{background:color-mix(in srgb,var(--ink) 8%,transparent); border-color:var(--line);}

.bp-grid.iso .bp-cell{transform-style:preserve-3d;}
.bp-grid.iso .bp-cell.is-bay{transform:translateZ(10px); box-shadow:-3px 4px 0 rgba(0,0,0,.18);}
.bp-grid.iso .bp-cell.is-bay.skew{transform:translateZ(10px) skewX(-15deg);}
.bp-grid.iso .bp-cell[data-el="pillar"]{transform:translateZ(30px); box-shadow:-6px 9px 0 rgba(0,0,0,.35);}
.bp-grid.iso .bp-cell.is-wall{transform:translateZ(22px); box-shadow:-5px 7px 0 rgba(0,0,0,.3);}
.bp-grid.iso .bp-cell[data-el="sign"],.bp-grid.iso .bp-cell[data-el="mirror"],
.bp-grid.iso .bp-cell[data-el="no-parking"],.bp-grid.iso .bp-cell[data-el="height-limit"]{transform:translateZ(20px); box-shadow:-4px 6px 0 rgba(0,0,0,.28);}
.bp-grid.iso .bp-cell[data-el="gate-entry"],.bp-grid.iso .bp-cell[data-el="gate-exit"],
.bp-grid.iso .bp-cell[data-el="kiosk"],.bp-grid.iso .bp-cell[data-el="elevator"]{transform:translateZ(12px); box-shadow:-3px 4px 0 rgba(0,0,0,.22);}

.bp-cell.car{box-shadow:inset 0 0 0 2px var(--warn);}
.bp-cell.is-empty.car{background:color-mix(in srgb,var(--warn) 18%,transparent); border-style:solid; border-color:var(--warn); color:var(--warn);}
.bp-cell.is-empty.car svg{width:60%; height:60%;}
.bp-cell .carmark{position:absolute; right:2px; top:2px; width:34%; height:34%; color:var(--ink); background:var(--warn); border-radius:3px; padding:2px;}
.bp-cell .carmark svg{width:100%; height:100%; display:block;}
.bp-cell.drop-ok{outline:3px solid var(--route); outline-offset:-1px; z-index:4;}
.bp-cell.lifting{opacity:.28;}
`;

/** Mark cells the floor camera says contain a car. cells: ["r_c", ...] */
export function overlayCamera(bp, cells) {
  const set = new Set(cells || []);
  const m = bp.matrix.map((row, r) => row.map((cell, c) => {
    const car = set.has(`${r}_${c}`);
    if (!cell && !car) return null;
    return { ...(cell || { el: null }), car };
  }));
  return { cols: bp.cols, rows: bp.rows, matrix: m };
}
