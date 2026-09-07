// js/blueprint.js — the team's tile-grid blueprint model, shared by entry / exit / admin.
//
// In memory:   { cols, rows, matrix: cell[][] }        cell = null | {type, label?, id?, dir?}
// In Firestore: { cols, rows, cells: { "r_c": cell } }   (Firestore can't store arrays of arrays)
//
// Slot cells use type "slot" | "angled" and id = the Firestore slot LABEL (e.g. "G-04").
// Status is never stored in the layout; it's overlaid from lots/{lotId}/slots at render time.

export const COLS = 11, ROWS = 8;

/** Decorated default floor. Fills stall positions with the given labels, in order. */
export function defaultBlueprint(labels = []) {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  m[0][0]  = { type:"gate",  label:"ENTRY ↓" };
  m[7][10] = { type:"gate",  label:"EXIT →" };
  m[1][0]  = { type:"road",  label:"LANE ↓" };
  m[2][0]  = { type:"curve", dir:"curve-bl", label:"╭ TURN" };
  m[2][1]  = { type:"road",  label:"══" };
  m[2][2]  = { type:"road",  label:"══" };
  m[2][3]  = { type:"curve", dir:"curve-tr", label:"╮ TURN" };
  m[3][3]  = { type:"road",  label:"║ LANE" };
  m[4][3]  = { type:"curve", dir:"curve-bl", label:"╰ TURN" };
  m[4][4]  = { type:"road",  label:"══" };
  m[4][5]  = { type:"road",  label:"══" };
  m[4][6]  = { type:"road",  label:"══" };
  m[4][7]  = { type:"curve", dir:"curve-br", label:"╯ TURN" };
  m[5][7]  = { type:"road",  label:"║ LANE" };
  m[6][7]  = { type:"curve", dir:"curve-bl", label:"╰ TURN" };
  m[6][8]  = { type:"road",  label:"══" };
  m[6][9]  = { type:"road",  label:"══" };
  m[6][10] = { type:"curve", dir:"curve-tr", label:"╮ EXIT" };
  m[3][2]  = { type:"pillar", label:"COL-1" };
  m[3][4]  = { type:"pillar", label:"COL-2" };
  m[5][6]  = { type:"sign",  label:"MIRROR 🪞" };
  m[2][4]  = { type:"sign",  label:"SLOW 10" };

  const stalls = [
    {r:0,c:2,a:false},{r:0,c:3,a:false},{r:0,c:4,a:false},{r:0,c:5,a:false},
    {r:1,c:5,a:true}, {r:1,c:6,a:true}, {r:1,c:7,a:true}, {r:1,c:8,a:true},
    {r:5,c:1,a:false},{r:5,c:2,a:false},{r:5,c:3,a:false},
    {r:7,c:5,a:true}, {r:7,c:6,a:true}, {r:7,c:7,a:true}
  ];
  labels.forEach((label, i) => {
    const p = stalls[i];
    if (p) m[p.r][p.c] = { type: p.a ? "angled" : "slot", id: label };
    else placeInEmpty(m, { type:"slot", id: label });
  });
  return { cols: COLS, rows: ROWS, matrix: m };
}

function placeInEmpty(m, cell) {
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (!m[r][c]) { m[r][c] = cell; return true; }
  return false;
}

/** Firestore-safe form → in-memory. */
export function fromStore(store) {
  if (!store || !store.cells) return null;
  const cols = store.cols || COLS, rows = store.rows || ROWS;
  const m = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const [k, cell] of Object.entries(store.cells)) {
    const [r, c] = k.split("_").map(Number);
    if (m[r] && c < cols) m[r][c] = cell;
  }
  return { cols, rows, matrix: m };
}

/** In-memory → Firestore-safe form. */
export function toStore(bp) {
  const cells = {};
  bp.matrix.forEach((row, r) => row.forEach((cell, c) => { if (cell) cells[`${r}_${c}`] = cell; }));
  return { cols: bp.cols, rows: bp.rows, cells };
}

/**
 * Overlay live Firestore slot docs onto a blueprint.
 * docs: [{id, label, status, ticketId}] for this floor.
 * Slots in Firestore but not drawn get dropped into empty cells.
 * Drawn slots not in Firestore render as "unprovisioned".
 * Returns a NEW blueprint with `state` set on each slot cell.
 */
export function overlayStatus(bp, docs) {
  const byLabel = new Map(docs.map(d => [d.label || d.id.split("__").pop(), d]));
  const seen = new Set();
  const m = bp.matrix.map(row => row.map(cell => {
    if (!cell || (cell.type !== "slot" && cell.type !== "angled")) return cell;
    const d = byLabel.get(cell.id);
    if (!d) return { ...cell, state: "unprovisioned" };
    seen.add(cell.id);
    return { ...cell, state: d.status === "occupied" ? "taken" : "free", ticketId: d.ticketId || null, docId: d.id };
  }));
  const out = { cols: bp.cols, rows: bp.rows, matrix: m };
  for (const [label, d] of byLabel) {
    if (!seen.has(label)) placeInEmpty(m, { type:"slot", id: label, state: d.status === "occupied" ? "taken" : "free", ticketId: d.ticketId || null, docId: d.id });
  }
  return out;
}

/** Nearest free slot to the ENTRY gate (Manhattan distance). */
export function nearestFree(bp) {
  let g = { r:0, c:0 };
  bp.matrix.forEach((row, r) => row.forEach((cell, c) => { if (cell?.type === "gate" && /entry/i.test(cell.label || "")) g = { r, c }; }));
  let best = null;
  bp.matrix.forEach((row, r) => row.forEach((cell, c) => {
    if (cell && (cell.type === "slot" || cell.type === "angled") && cell.state === "free") {
      const d = Math.abs(r - g.r) + Math.abs(c - g.c);
      if (!best || d < best.d) best = { id: cell.id, d };
    }
  }));
  return best ? best.id : null;
}

/** Render a blueprint into a .blueprint-grid element. opts: {selectedId, highlightId, onSlotClick} */
export function renderBlueprint(gridEl, bp, opts = {}) {
  gridEl.style.gridTemplateColumns = `repeat(${bp.cols}, 1fr)`;
  gridEl.innerHTML = "";
  for (let r = 0; r < bp.rows; r++) for (let c = 0; c < bp.cols; c++) {
    const item = bp.matrix[r][c];
    const cell = document.createElement("div");
    cell.className = "bp-cell";
    cell.dataset.r = r; cell.dataset.c = c;
    if (!item) { cell.classList.add("cell-empty"); }
    else if (item.type === "slot" || item.type === "angled") {
      const isSel = item.id === opts.selectedId, isMine = item.id === opts.highlightId;
      cell.classList.add("cell-slot", isSel ? "selected" : (item.state || "free"));
      if (item.type === "angled") cell.classList.add("angled");
      if (isMine) cell.classList.add("mine");
      cell.innerHTML = `<strong>${item.id}</strong>`;
      cell.dataset.id = item.id;
      if (item.state === "free" && opts.onSlotClick) cell.onclick = () => opts.onSlotClick(item);
    }
    else if (item.type === "road")   { cell.classList.add("cell-road");   cell.textContent = item.label || ""; }
    else if (item.type === "curve")  { cell.classList.add("cell-curve", item.dir || ""); cell.textContent = item.label || ""; }
    else if (item.type === "pillar") { cell.classList.add("cell-pillar"); cell.textContent = item.label || ""; }
    else if (item.type === "sign")   { cell.classList.add("cell-sign");   cell.textContent = `🪧 ${item.label || ""}`; }
    else if (item.type === "gate")   { cell.classList.add("cell-gate");   cell.textContent = item.label || ""; }
    gridEl.appendChild(cell);
  }
}
