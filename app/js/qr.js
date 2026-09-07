// js/qr.js — builds Smart Park entry/exit URLs and renders them as QR codes.
//
// Rendering is done here, in the browser, from the URL stored on the lot document.
// We deliberately store the URL (small, readable, diffable) rather than a PNG blob:
// the image is fully derived from the URL, so storing both would mean two sources of
// truth that can drift. Re-rendering is instant and works offline.

import qrcode from "./qrcode.js";

/** Strip trailing slashes so joins never produce "//". */
export const cleanBase = (b) => String(b || "").trim().replace(/\/+$/, "");

/**
 * The canonical public URLs for a lot's gates.
 * baseUrl is the site root, e.g. https://smart-park-3b9a8.web.app
 */
export function lotUrls(baseUrl, lotId) {
  const b = cleanBase(baseUrl);
  const id = encodeURIComponent(lotId);
  return {
    entry: `${b}/app/entry.html?lot=${id}`,
    exit:  `${b}/app/exit.html?lot=${id}`,
  };
}

/**
 * Guess the site root from wherever this page is being served.
 * Works for both /admin/x.html and /app/x.html, and for a project served at a
 * sub-path. Used only as a default when nothing is stored yet.
 */
export function guessBaseUrl() {
  const path = location.pathname.replace(/\/(admin|app)\/[^/]*$/, "");
  return cleanBase(location.origin + path);
}

/**
 * Render `text` as an SVG QR code string.
 * ecc "M" survives a bit of print smudging; "H" survives a lot but is denser.
 * `quiet` is the mandatory white margin — without it many scanners fail.
 */
export function qrSvg(text, { size = 240, ecc = "M", quiet = 4, dark = "#000000", light = "#FFFFFF" } = {}) {
  const q = qrcode(0, ecc);          // 0 = auto-pick the smallest version that fits
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  const total = n + quiet * 2;
  const cell = size / total;

  let rects = "";
  for (let r = 0; r < n; r++) {
    // merge horizontal runs into one rect — far fewer nodes, identical output
    let c = 0;
    while (c < n) {
      if (!q.isDark(r, c)) { c++; continue; }
      let run = 1;
      while (c + run < n && q.isDark(r, c + run)) run++;
      const x = (quiet + c) * cell, y = (quiet + r) * cell;
      rects += `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${(cell * run).toFixed(3)}" height="${cell.toFixed(3)}"/>`;
      c += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
         `<rect width="${size}" height="${size}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}

/** Same QR as a PNG data URL, for download/print at a real print resolution. */
export function qrPngDataUrl(text, { size = 1024, ecc = "M", quiet = 4 } = {}) {
  const q = qrcode(0, ecc);
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  const total = n + quiet * 2;
  const cell = Math.max(1, Math.floor(size / total));   // integer cells = no blur
  const px = cell * total;

  const cv = document.createElement("canvas");
  cv.width = px; cv.height = px;
  const g = cv.getContext("2d");
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, px, px);
  g.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) g.fillRect((quiet + c) * cell, (quiet + r) * cell, cell, cell);
  }
  return cv.toDataURL("image/png");
}

/** Trigger a browser download of the PNG. */
export function downloadQrPng(text, filename, opts) {
  const a = document.createElement("a");
  a.href = qrPngDataUrl(text, opts);
  a.download = filename;
  a.click();
}
