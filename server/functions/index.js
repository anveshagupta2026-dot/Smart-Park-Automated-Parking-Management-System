// server/functions/index.js — COMPLETE FILE. Replace yours with this.
//
// Core:  lockSlot, finalizeExit, createPaymentIntent, confirmPaymentAndRelease, resetTicket, seedDatabase
// Admin: createLot, addFloor, addSlots, deleteSlot, renameSlot, updateLotLayout,
//        reportCameraFrame, applyCameraFrame, clearAllTickets, getRevenue, seedDemoPayments
//
// Every function is wrapped so unexpected errors reach the browser WITH a message
// instead of a bare "internal".

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const TS = admin.firestore.Timestamp;

// ---------------------------------------------------------------- helpers
function fn(name, handler) {
  return onCall(async (request) => {
    try {
      return await handler(request.data || {}, request);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error(`${name} failed`, err);
      throw new HttpsError("internal", `${name}: ${err.message || String(err)}`);
    }
  });
}
const need = (obj, keys) => {
  for (const k of keys) if (obj[k] === undefined || obj[k] === null || obj[k] === "")
    throw new HttpsError("invalid-argument", `'${k}' is required.`);
};
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
async function commitAll(ops) {
  if (!ops.length) return;
  let batch = db.batch(), n = 0;
  for (const op of ops) { op(batch); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  if (n % 400 !== 0) await batch.commit();
}
async function lotOrThrow(lotId) {
  const ref = db.collection("lots").doc(lotId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", `Lot '${lotId}' not found.`);
  return { ref, data: snap.data() };
}
const floorKey = (f) => String(f).replace(/[.~*/[\]]/g, "_");
function getStripe() { return require("stripe")(process.env.STRIPE_SECRET_KEY); }

function istParts(date) {
  const d = date && date.toDate ? date.toDate() : new Date(date);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { hour: Number(p.hour) % 24, weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday), ymd: `${p.year}-${p.month}-${p.day}` };
}
function isPeakHour(date) { const h = istParts(date).hour; return (h >= 9 && h < 11) || (h >= 17 && h < 20); }

function calculatePrice(entryTime, exitTime, occupancyPercent, isPeak) {
  const entryMs = entryTime && entryTime.toDate ? entryTime.toDate().getTime() : new Date(entryTime).getTime();
  const exitMs  = exitTime  && exitTime.toDate  ? exitTime.toDate().getTime()  : new Date(exitTime).getTime();
  const durationHours = Math.max(1, Math.ceil(Math.max(0, exitMs - entryMs) / 3600000));
  const BASE_RATE = 50, MAX_TOTAL = 75;
  let occupancyMultiplier = 1.0;
  if (occupancyPercent > 80) occupancyMultiplier = 1.6; else if (occupancyPercent >= 50) occupancyMultiplier = 1.3;
  const peakMultiplier = isPeak ? 1.2 : 1.0;
  const rawRate = BASE_RATE * occupancyMultiplier * peakMultiplier;
  const finalRate = Math.min(rawRate, MAX_TOTAL);
  const rawTotal = Math.round(finalRate * durationHours * 100) / 100;
  const total = Math.min(Math.max(rawTotal, BASE_RATE), MAX_TOTAL);
  return { total, durationHours, finalRate, breakdown: { baseRate: BASE_RATE, occupancyMultiplier, peakMultiplier, rawRate, isCapped: rawTotal > MAX_TOTAL } };
}

// Layout is stored as a matrix: { rows, cols, matrix:[ {c:[cell|null,...]}, ... ] }
// (Firestore forbids array-in-array, so each row is wrapped in {c:[...]}.)
function readLayout(lotData, floor) {
  const L = lotData?.layout?.floors?.[floorKey(floor)];
  if (!L) return null;
  if (Array.isArray(L.matrix)) return { rows: L.rows, cols: L.cols, matrix: L.matrix.map(r => r.c || []) };
  if (L.cells) { // legacy map form
    const m = Array.from({ length: L.rows }, () => Array(L.cols).fill(null));
    for (const [k, v] of Object.entries(L.cells)) { const [r, c] = k.split("_").map(Number); if (m[r]) m[r][c] = v; }
    return { rows: L.rows, cols: L.cols, matrix: m };
  }
  return null;
}
const isBayCell = (cell) => cell && typeof cell.el === "string" && cell.el.startsWith("bay") && cell.id;

// ================================================================ CORE
exports.lockSlot = fn("lockSlot", async ({ lotId, slotId, email }) => {
  need({ lotId, slotId, email }, ["lotId", "slotId", "email"]);
  const lotsSnap = await db.collection("lots").get();
  for (const lot of lotsSnap.docs) {
    const t = await lot.ref.collection("tickets").doc(email).get();
    if (t.exists) {
      const where = lot.id === lotId ? "this lot" : lot.data().name || lot.id;
      throw new HttpsError("already-exists", `You already have an active parking session at ${where}.`);
    }
  }
  const { ref: lotRef } = await lotOrThrow(lotId);
  const ticketRef = lotRef.collection("tickets").doc(email);
  const slotRef = lotRef.collection("slots").doc(slotId);
  return db.runTransaction(async (tx) => {
    const slot = await tx.get(slotRef);
    if (!slot.exists) throw new HttpsError("not-found", `Bay '${slotId}' not found.`);
    if (slot.data().status !== "available") throw new HttpsError("failed-precondition", "That bay was just taken. Pick another.");
    const now = FV.serverTimestamp();
    tx.update(slotRef, { status: "occupied", ticketId: email, updatedAt: now });
    tx.set(ticketRef, { email, lotId, slotId, floor: slot.data().floor || null, label: slot.data().label || null, entryTime: now, status: "active" });
    return { success: true, slotId };
  });
});

exports.finalizeExit = fn("finalizeExit", async ({ lotId, email }) => {
  need({ lotId, email }, ["lotId", "email"]);
  const { ref: lotRef } = await lotOrThrow(lotId);
  const ticketRef = lotRef.collection("tickets").doc(email);
  return db.runTransaction(async (tx) => {
    const tSnap = await tx.get(ticketRef);
    if (!tSnap.exists) throw new HttpsError("not-found", `No active bay for ${email} at this lot.`);
    const t = tSnap.data();
    if (t.status === "billed") {
      return { amount: t.amount, status: "billed", alreadyBilled: true, durationHours: t.durationHours || 1,
        finalRate: t.pricingDetails?.finalRate ?? t.amount, pricingDetails: t.pricingDetails || null,
        slotId: t.slotId, entryTime: t.entryTime?.toMillis() ?? null, exitTime: t.exitTime?.toMillis() ?? null };
    }
    if (t.status !== "active") throw new HttpsError("failed-precondition", `Ticket is '${t.status}'.`);
    const [occ, all] = await Promise.all([
      tx.get(lotRef.collection("slots").where("status", "==", "occupied")),
      tx.get(lotRef.collection("slots"))
    ]);
    const occupancyPercent = (occ.size / (all.size || 1)) * 100;
    const now = TS.now();
    const isPeak = isPeakHour(now);
    const p = calculatePrice(t.entryTime, now, occupancyPercent, isPeak);
    const pricingDetails = { finalRate: p.finalRate, occupancyPercent: Math.round(occupancyPercent), isPeakHour: isPeak, breakdown: p.breakdown };
    tx.update(ticketRef, { exitTime: now, amount: p.total, durationHours: p.durationHours, status: "billed", pricingDetails, updatedAt: now });
    return { amount: p.total, status: "billed", alreadyBilled: false, durationHours: p.durationHours, finalRate: p.finalRate,
      pricingDetails, slotId: t.slotId, entryTime: t.entryTime?.toMillis() ?? null, exitTime: now.toMillis() };
  });
});

exports.createPaymentIntent = fn("createPaymentIntent", async ({ lotId, email }) => {
  need({ lotId, email }, ["lotId", "email"]);
  const { ref: lotRef } = await lotOrThrow(lotId);
  const ticketRef = lotRef.collection("tickets").doc(email);
  const tSnap = await ticketRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
  const t = tSnap.data();
  if (t.status !== "billed" || !(t.amount > 0)) throw new HttpsError("failed-precondition", "Ticket must be billed first.");
  const pi = await getStripe().paymentIntents.create({
    amount: Math.round(t.amount * 100), currency: "inr", description: "SmartPark parking fee",
    metadata: { email, lotId, slotId: t.slotId }, automatic_payment_methods: { enabled: true }
  });
  await ticketRef.update({ paymentIntentId: pi.id, updatedAt: TS.now() });
  return { clientSecret: pi.client_secret, paymentIntentId: pi.id, amount: t.amount };
});

exports.confirmPaymentAndRelease = fn("confirmPaymentAndRelease", async ({ lotId, email, paymentIntentId }) => {
  need({ lotId, email, paymentIntentId }, ["lotId", "email", "paymentIntentId"]);
  const { ref: lotRef } = await lotOrThrow(lotId);
  const ticketRef = lotRef.collection("tickets").doc(email);
  const tSnap = await ticketRef.get();
  if (!tSnap.exists) return { success: true, alreadyProcessed: true, message: "Already processed." };
  const t = tSnap.data();
  const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") return { success: false, status: pi.status, message: `Payment status is '${pi.status}'.` };

  const slotRef = lotRef.collection("slots").doc(t.slotId);
  const now = TS.now();
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ticketRef);
    if (!fresh.exists) return;
    const slot = await tx.get(slotRef);
    const entryMs = t.entryTime?.toMillis() ?? now.toMillis();
    const exitMs = t.exitTime?.toMillis() ?? now.toMillis();
    const parts = istParts(exitMs);
    // permanent payment record for analytics
    tx.set(lotRef.collection("payments").doc(), {
      amount: t.amount || 0, paidAt: now, entryTime: t.entryTime || now, exitTime: t.exitTime || now,
      entryMs, exitMs, paidMs: now.toMillis(), durationHours: t.durationHours || 1,
      slotId: t.slotId, label: slot.exists ? slot.data().label || null : t.label || null,
      floor: slot.exists ? slot.data().floor || null : t.floor || null,
      occupancyPercent: t.pricingDetails?.occupancyPercent ?? null, isPeakHour: !!t.pricingDetails?.isPeakHour,
      finalRate: t.pricingDetails?.finalRate ?? null, hourOfDay: parts.hour, weekday: parts.weekday, ymd: parts.ymd,
      paymentIntentId: pi.id
    });
    tx.update(lotRef, { totalRevenue: FV.increment(t.amount || 0), lastPaymentAt: now });
    tx.delete(ticketRef);
    if (slot.exists) tx.update(slotRef, { status: "available", ticketId: null, updatedAt: now });
  });
  return { success: true, alreadyProcessed: false, slotReleased: t.slotId, message: "Payment verified. Bay released." };
});

exports.resetTicket = fn("resetTicket", async ({ lotId, email }) => {
  need({ lotId, email }, ["lotId", "email"]);
  const { ref: lotRef } = await lotOrThrow(lotId);
  const ticketRef = lotRef.collection("tickets").doc(email);
  const t = await ticketRef.get();
  if (!t.exists) throw new HttpsError("not-found", "No active ticket for that account here.");
  const slotRef = lotRef.collection("slots").doc(t.data().slotId);
  const slot = await slotRef.get();
  const ops = [(b) => b.delete(ticketRef)];
  if (slot.exists) ops.push((b) => b.update(slotRef, { status: "available", ticketId: null, updatedAt: FV.serverTimestamp() }));
  await commitAll(ops);
  return { success: true, message: "Ticket cleared, bay released." };
});

exports.seedDatabase = fn("seedDatabase", async () => {
  const cfg = [
    { lotId: "phoneix-marketcity", name: "Main Campus Lot", location: "Gate 2, VIT Vellore", floors: [["Ground","G",6],["Level 1","L1",6],["Level 2","L2",4]] },
    { lotId: "sjt-block",   name: "SJT Block Lot",   location: "SJT, VIT Vellore",    floors: [["Ground","G",6],["Basement","B",4]] }
  ];
  let created = 0; const skipped = [];
  for (const lot of cfg) {
    const ref = db.collection("lots").doc(lot.lotId);
    if ((await ref.get()).exists) { skipped.push(lot.lotId); continue; }
    const now = FV.serverTimestamp();
    const ops = [(b) => b.set(ref, { name: lot.name, location: lot.location, floors: lot.floors.map(f => f[0]), totalRevenue: 0, createdAt: now })];
    for (const [floor, prefix, count] of lot.floors) for (let i = 1; i <= count; i++) {
      const label = `${prefix}-${String(i).padStart(2, "0")}`;
      ops.push((b) => b.set(ref.collection("slots").doc(`${lot.lotId}__${label}`), { label, floor, lotId: lot.lotId, status: "available", ticketId: null, updatedAt: now }));
      created++;
    }
    await commitAll(ops);
  }
  return { success: true, slotsCreated: created, skippedLots: skipped };
});

// ================================================================ ADMIN (lot-scoped)
exports.createLot = fn("createLot", async ({ name, location, floors, lotId: rawId }) => {
  need({ name }, ["name"]);
  if (!Array.isArray(floors) || !floors.length) throw new HttpsError("invalid-argument", "At least one floor is required.");
  const lotId = slugify(rawId || name);
  if (!lotId) throw new HttpsError("invalid-argument", "Could not derive a lot id.");
  const ref = db.collection("lots").doc(lotId);
  if ((await ref.get()).exists) throw new HttpsError("already-exists", `'${lotId}' already exists.`);
  const floorNames = [], slots = [], seen = new Set();
  for (const f of floors) {
    const fName = String(f.name || "").trim(), count = Number(f.count);
    const prefix = String(f.prefix || fName.slice(0, 2) || "S").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!fName) throw new HttpsError("invalid-argument", "Every floor needs a name.");
    if (!Number.isInteger(count) || count < 1 || count > 300) throw new HttpsError("invalid-argument", `Floor '${fName}' needs 1–300 bays.`);
    if (floorNames.includes(fName)) throw new HttpsError("invalid-argument", `Duplicate floor '${fName}'.`);
    floorNames.push(fName);
    for (let i = 1; i <= count; i++) {
      const label = `${prefix}-${String(i).padStart(2, "0")}`;
      if (seen.has(label)) throw new HttpsError("invalid-argument", `Label '${label}' repeats — use a different prefix per floor.`);
      seen.add(label); slots.push({ label, floor: fName });
    }
  }
  const now = FV.serverTimestamp();
  const base = await getBaseUrl();
  await commitAll([
    (b) => b.set(ref, { name: String(name).trim(), location: String(location || "").trim(), floors: floorNames, totalRevenue: 0, createdAt: now, qr: buildQr(base, lotId) }),
    ...slots.map(s => (b) => b.set(ref.collection("slots").doc(`${lotId}__${s.label}`), { label: s.label, floor: s.floor, lotId, status: "available", ticketId: null, updatedAt: now }))
  ]);
  return { success: true, lotId, slotsCreated: slots.length, floors: floorNames, qr: buildQr(base, lotId) };
});

// ---------------------------------------------------------------- QR / gate links
//
// The QR image itself is NOT stored — it is fully derived from the URL, so keeping
// both would be two sources of truth. We store the URLs (and the base they were
// built from) on the lot document; the browser renders the image from that.
//
// The site's public base URL lives in one place, config/app, so that moving the
// site to a new domain is a single write plus a regenerate, not an edit per lot.

const CONFIG_REF = () => db.collection("config").doc("app");

async function getBaseUrl() {
  const snap = await CONFIG_REF().get();
  return snap.exists ? String(snap.data().baseUrl || "").replace(/\/+$/, "") : "";
}
function buildQr(baseUrl, lotId) {
  const b = String(baseUrl || "").replace(/\/+$/, "");
  const id = encodeURIComponent(lotId);
  return {
    baseUrl: b,
    entryUrl: b ? `${b}/app/entry.html?lot=${id}` : "",
    exitUrl:  b ? `${b}/app/exit.html?lot=${id}`  : "",
    updatedAt: Date.now()
  };
}

/** Read the configured public base URL (empty string if never set). */
exports.getAppConfig = fn("getAppConfig", async () => {
  return { baseUrl: await getBaseUrl() };
});

/**
 * Set the site's public base URL and rewrite every lot's gate URLs to match.
 * Call this once after deploying to Hosting, and again if the domain ever changes.
 */
exports.setBaseUrl = fn("setBaseUrl", async ({ baseUrl }) => {
  need({ baseUrl }, ["baseUrl"]);
  const b = String(baseUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(b)) {
    throw new HttpsError("invalid-argument", "baseUrl must start with http:// or https:// — e.g. https://smart-park-3b9a8.web.app");
  }
  await CONFIG_REF().set({ baseUrl: b, updatedAt: FV.serverTimestamp() }, { merge: true });

  const lots = await db.collection("lots").get();
  await commitAll(lots.docs.map(d => (bt) => bt.update(d.ref, { qr: buildQr(b, d.id) })));
  return { success: true, baseUrl: b, lotsUpdated: lots.size };
});

/** Rebuild one lot's gate URLs from the current base URL. */
exports.refreshLotQr = fn("refreshLotQr", async ({ lotId }) => {
  need({ lotId }, ["lotId"]);
  const { ref } = await lotOrThrow(lotId);
  const base = await getBaseUrl();
  if (!base) throw new HttpsError("failed-precondition", "No base URL configured yet. Set it on the QR codes page first.");
  const qr = buildQr(base, lotId);
  await ref.update({ qr });
  return { success: true, qr };
});

exports.addFloor = fn("addFloor", async ({ lotId, floor, count, prefix }) => {
  need({ lotId, floor }, ["lotId", "floor"]);
  const { ref, data } = await lotOrThrow(lotId);
  const floors = Array.isArray(data.floors) ? data.floors : [];
  if (floors.includes(floor)) throw new HttpsError("already-exists", `Floor '${floor}' already exists.`);
  const ops = [(b) => b.update(ref, { floors: [...floors, floor] })];
  const created = [];
  const n = Number(count) || 0;
  if (n > 0) {
    const p = String(prefix || floor.slice(0, 2)).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const now = FV.serverTimestamp();
    for (let i = 1; i <= Math.min(n, 300); i++) {
      const label = `${p}-${String(i).padStart(2, "0")}`;
      const sref = ref.collection("slots").doc(`${lotId}__${label}`);
      if ((await sref.get()).exists) continue;
      ops.push((b) => b.set(sref, { label, floor, lotId, status: "available", ticketId: null, updatedAt: now }));
      created.push(label);
    }
  }
  await commitAll(ops);
  return { success: true, floor, created };
});

exports.addSlots = fn("addSlots", async ({ lotId, floor, labels, count, prefix }) => {
  need({ lotId, floor }, ["lotId", "floor"]);
  const { ref, data } = await lotOrThrow(lotId);
  let wanted = [];
  if (Array.isArray(labels) && labels.length) wanted = labels.map(l => String(l).trim().toUpperCase()).filter(Boolean);
  else {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 300) throw new HttpsError("invalid-argument", "'count' must be 1–300.");
    const p = String(prefix || floor.slice(0, 2)).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const existing = await ref.collection("slots").where("floor", "==", floor).get();
    let max = 0;
    existing.forEach(d => { const m = (d.data().label || "").match(new RegExp(`^${p}-(\\d+)$`)); if (m) max = Math.max(max, Number(m[1])); });
    for (let i = 1; i <= n; i++) wanted.push(`${p}-${String(max + i).padStart(2, "0")}`);
  }
  const now = FV.serverTimestamp(), created = [], ops = [];
  for (const label of wanted) {
    const sref = ref.collection("slots").doc(`${lotId}__${label}`);
    if ((await sref.get()).exists) continue;
    ops.push((b) => b.set(sref, { label, floor, lotId, status: "available", ticketId: null, updatedAt: now }));
    created.push(label);
  }
  const floors = Array.isArray(data.floors) ? data.floors : [];
  if (!floors.includes(floor)) ops.push((b) => b.update(ref, { floors: [...floors, floor] }));
  await commitAll(ops);
  return { success: true, created, skipped: wanted.length - created.length };
});

exports.deleteSlot = fn("deleteSlot", async ({ lotId, slotId }) => {
  need({ lotId, slotId }, ["lotId", "slotId"]);
  const { ref } = await lotOrThrow(lotId);
  const sref = ref.collection("slots").doc(slotId);
  const s = await sref.get();
  if (!s.exists) throw new HttpsError("not-found", `Bay '${slotId}' not found.`);
  const ops = [(b) => b.delete(sref)];
  if (s.data().ticketId) ops.push((b) => b.delete(ref.collection("tickets").doc(s.data().ticketId)));
  await commitAll(ops);
  return { success: true, slotId };
});

exports.renameSlot = fn("renameSlot", async ({ lotId, slotId, newLabel }) => {
  need({ lotId, slotId, newLabel }, ["lotId", "slotId", "newLabel"]);
  const label = String(newLabel).trim().toUpperCase();
  const { ref } = await lotOrThrow(lotId);
  const oldRef = ref.collection("slots").doc(slotId), newRef = ref.collection("slots").doc(`${lotId}__${label}`);
  const [o, n] = await Promise.all([oldRef.get(), newRef.get()]);
  if (!o.exists) throw new HttpsError("not-found", `Bay '${slotId}' not found.`);
  if (n.exists && newRef.id !== oldRef.id) throw new HttpsError("already-exists", `'${label}' is taken.`);
  await commitAll([(b) => b.set(newRef, { ...o.data(), label, updatedAt: FV.serverTimestamp() }), (b) => { if (newRef.id !== oldRef.id) b.delete(oldRef); }]);
  return { success: true, slotId: newRef.id, label };
});

// layout: { rows, cols, matrix: [[cell|null,...],...] } from the browser → stored as [{c:[...]}]
exports.updateLotLayout = fn("updateLotLayout", async ({ lotId, floor, layout }) => {
  need({ lotId, floor }, ["lotId", "floor"]);
  if (!layout || !Array.isArray(layout.matrix)) throw new HttpsError("invalid-argument", "layout.matrix must be a 2-D array.");
  const rows = Number(layout.rows) || layout.matrix.length;
  const cols = Number(layout.cols) || Math.max(...layout.matrix.map(r => r.length), 0);
  if (rows < 1 || cols < 1 || rows > 40 || cols > 40) throw new HttpsError("invalid-argument", "Grid must be 1–40 in each direction.");
  const { ref } = await lotOrThrow(lotId);
  const stored = layout.matrix.slice(0, rows).map(r => ({ c: Array.from({ length: cols }, (_, i) => (r[i] ?? null)) }));
  await ref.update({ [`layout.floors.${floorKey(floor)}`]: { rows, cols, matrix: stored }, layoutUpdatedAt: FV.serverTimestamp() });
  return { success: true, rows, cols };
});

// ---- camera: one still camera per floor. It reports which GRID CELLS contain a car.
//   { lotId, floor, cells: ["r_c", ...], source }
// Stores the frame on the lot doc and mirrors it onto the bays at those coordinates
// as sensorState, WITHOUT touching booking status.
exports.reportCameraFrame = fn("reportCameraFrame", async ({ lotId, floor, cells, source }) => {
  need({ lotId, floor }, ["lotId", "floor"]);
  if (!Array.isArray(cells)) throw new HttpsError("invalid-argument", "'cells' must be an array of \"r_c\" strings.");
  const { ref, data } = await lotOrThrow(lotId);
  const layout = readLayout(data, floor);
  const detected = new Set(cells.map(String));
  const now = FV.serverTimestamp();
  const ops = [(b) => b.update(ref, { [`cameras.${floorKey(floor)}`]: { cells: [...detected], source: source || "manual", updatedAt: now } })];
  let mirrored = 0;
  if (layout) {
    const slotsSnap = await ref.collection("slots").where("floor", "==", floor).get();
    const byLabel = new Map(slotsSnap.docs.map(d => [d.data().label, d]));
    layout.matrix.forEach((row, r) => row.forEach((cell, c) => {
      if (!isBayCell(cell)) return;
      const doc = byLabel.get(cell.id); if (!doc) return;
      ops.push((b) => b.update(doc.ref, { sensorState: detected.has(`${r}_${c}`) ? "car" : "empty", sensorSource: source || "manual", sensorAt: now }));
      mirrored++;
    }));
  }
  await commitAll(ops);
  return { success: true, detected: detected.size, baysMirrored: mirrored, layoutFound: !!layout };
});

// Make bookings match the camera for one floor: bays with a car become occupied
// (no ticket), bays without a car become available (ticket deleted).
exports.applyCameraFrame = fn("applyCameraFrame", async ({ lotId, floor }) => {
  need({ lotId, floor }, ["lotId", "floor"]);
  const { ref, data } = await lotOrThrow(lotId);
  const frame = data?.cameras?.[floorKey(floor)];
  if (!frame) throw new HttpsError("failed-precondition", "No camera frame recorded for that floor yet.");
  const layout = readLayout(data, floor);
  if (!layout) throw new HttpsError("failed-precondition", "That floor has no saved layout, so cells can't be mapped to bays.");
  const detected = new Set(frame.cells || []);
  const slotsSnap = await ref.collection("slots").where("floor", "==", floor).get();
  const byLabel = new Map(slotsSnap.docs.map(d => [d.data().label, d]));
  const now = FV.serverTimestamp(); const ops = []; let freed = 0, filled = 0;
  layout.matrix.forEach((row, r) => row.forEach((cell, c) => {
    if (!isBayCell(cell)) return;
    const doc = byLabel.get(cell.id); if (!doc) return;
    const s = doc.data(), car = detected.has(`${r}_${c}`);
    if (car && s.status !== "occupied") { ops.push((b) => b.update(doc.ref, { status: "occupied", updatedAt: now })); filled++; }
    if (!car && s.status === "occupied") {
      ops.push((b) => b.update(doc.ref, { status: "available", ticketId: null, updatedAt: now }));
      if (s.ticketId) ops.push((b) => b.delete(ref.collection("tickets").doc(s.ticketId)));
      freed++;
    }
  }));
  await commitAll(ops);
  return { success: true, filled, freed };
});

exports.clearAllTickets = fn("clearAllTickets", async ({ lotId }) => {
  need({ lotId }, ["lotId"]);
  const { ref } = await lotOrThrow(lotId);
  const [tickets, slots] = await Promise.all([ref.collection("tickets").get(), ref.collection("slots").get()]);
  const now = FV.serverTimestamp();
  const ops = [];
  tickets.forEach(d => ops.push((b) => b.delete(d.ref)));
  let freed = 0;
  slots.forEach(d => { if (d.data().status === "occupied" || d.data().ticketId) { ops.push((b) => b.update(d.ref, { status: "available", ticketId: null, updatedAt: now })); freed++; } });
  await commitAll(ops);
  return { success: true, ticketsCleared: tickets.size, baysFreed: freed };
});

// ---- revenue: payment records in a time range, plus totals. Client does the charts.
exports.getRevenue = fn("getRevenue", async ({ lotId, fromMs, toMs, limit }) => {
  need({ lotId }, ["lotId"]);
  const { ref, data } = await lotOrThrow(lotId);
  const from = Number(fromMs) || 0, to = Number(toMs) || Date.now() + 86400000;
  const cap = Math.min(Number(limit) || 5000, 10000);
  const snap = await ref.collection("payments").where("paidMs", ">=", from).where("paidMs", "<=", to).orderBy("paidMs", "desc").limit(cap).get();
  const rows = snap.docs.map(d => { const p = d.data(); return {
    id: d.id, amount: p.amount || 0, paidMs: p.paidMs, entryMs: p.entryMs, exitMs: p.exitMs, durationHours: p.durationHours || 1,
    label: p.label, floor: p.floor, hourOfDay: p.hourOfDay, weekday: p.weekday, ymd: p.ymd,
    occupancyPercent: p.occupancyPercent, isPeakHour: !!p.isPeakHour, finalRate: p.finalRate }; });
  return { lotId, name: data.name || lotId, totalRevenueAllTime: data.totalRevenue || 0, count: rows.length, truncated: rows.length >= cap, rows };
});

// DEV: fabricate plausible payment history so the revenue page has something to show.
exports.seedDemoPayments = fn("seedDemoPayments", async ({ lotId, days, perDay }) => {
  need({ lotId }, ["lotId"]);
  const { ref } = await lotOrThrow(lotId);
  const slots = (await ref.collection("slots").get()).docs.map(d => d.data());
  if (!slots.length) throw new HttpsError("failed-precondition", "Lot has no bays.");
  const D = Math.min(Number(days) || 45, 120), PD = Math.min(Number(perDay) || 12, 60);
  const ops = []; let total = 0;
  const weight = (h) => (h >= 9 && h < 11) || (h >= 17 && h < 20) ? 3 : (h >= 7 && h < 22 ? 1.2 : 0.15);
  for (let d = D; d >= 1; d--) {
    const day = new Date(Date.now() - d * 86400000);
    const dow = day.getDay(); const n = Math.round(PD * (dow === 0 ? 0.55 : dow === 6 ? 0.8 : 1) * (0.7 + Math.random() * 0.6));
    for (let i = 0; i < n; i++) {
      let h; do { h = Math.floor(Math.random() * 24); } while (Math.random() > weight(h) / 3);
      const entry = new Date(day); entry.setHours(h, Math.floor(Math.random() * 60), 0, 0);
      const durationHours = Math.max(1, Math.round(Math.abs(1.2 + (Math.random() - 0.4) * 3)));
      const exit = new Date(entry.getTime() + durationHours * 3600000);
      const occ = Math.min(99, Math.round(20 + weight(h) * 22 + Math.random() * 20));
      const p = calculatePrice(entry, exit, occ, isPeakHour(exit));
      const s = slots[Math.floor(Math.random() * slots.length)];
      const parts = istParts(exit);
      ops.push((b) => b.set(ref.collection("payments").doc(), {
        amount: p.total, paidAt: TS.fromDate(exit), entryTime: TS.fromDate(entry), exitTime: TS.fromDate(exit),
        entryMs: entry.getTime(), exitMs: exit.getTime(), paidMs: exit.getTime(), durationHours,
        slotId: `${lotId}__${s.label}`, label: s.label, floor: s.floor, occupancyPercent: occ, isPeakHour: isPeakHour(exit),
        finalRate: p.finalRate, hourOfDay: parts.hour, weekday: parts.weekday, ymd: parts.ymd, demo: true
      }));
      total += p.total;
    }
  }
  ops.push((b) => b.update(ref, { totalRevenue: FV.increment(total) }));
  await commitAll(ops);
  return { success: true, records: ops.length - 1, revenueAdded: Math.round(total) };
});
