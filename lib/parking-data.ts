// ==========================================================
// SMART PARK - shared parking data + small helpers.
// Kept in one place so the home page, the entry routes, and
// the main flow component all use the same information.
// ==========================================================

// Two parking lots. Each lot has:
//  - id: internal id used in slot keys
//  - slug: the value used in the QR link URL (/entry/<slug>)
//  - name: the friendly name we show on screen
//  - qr: the image path for its printable QR code (drop your
//        own image at that path in /public to replace it)
//  - floors: each floor has stalls
export const LOTS = [
  {
    id: "main",
    slug: "main-campus",
    name: "Main Campus Lot",
    qr: "/entry-main-campus.png",
    floors: [
      { id: "ground", name: "Ground Floor", stalls: ["G-01", "G-02", "G-03", "G-04", "G-05", "G-06"] },
      { id: "level1", name: "Level 1", stalls: ["L1-01", "L1-02", "L1-03", "L1-04", "L1-05", "L1-06"] },
      { id: "level2", name: "Level 2", stalls: ["L2-01", "L2-02", "L2-03", "L2-04"] },
    ],
  },
  {
    id: "sjt",
    slug: "sjt-block",
    name: "SJT Block Lot",
    qr: "/entry-sjt-block.png",
    floors: [
      { id: "basement", name: "Basement", stalls: ["B-01", "B-02", "B-03", "B-04"] },
      { id: "ground", name: "Ground Floor", stalls: ["G-01", "G-02", "G-03", "G-04", "G-05", "G-06"] },
    ],
  },
]

// Find a lot from the URL slug (e.g. "main-campus" -> Main Campus Lot).
export function getLotBySlug(slug) {
  return LOTS.find((lot) => lot.slug === slug)
}

// A unique key for every stall so we can track its status.
export function slotKey(lotId, floorId, stall) {
  return lotId + "/" + floorId + "/" + stall
}

// Slots that start as "occupied" (already taken by other cars).
export const INITIAL_OCCUPIED = {
  "main/ground/G-02": true,
  "main/ground/G-05": true,
  "main/level1/L1-03": true,
  "main/level2/L2-01": true,
  "sjt/basement/B-02": true,
  "sjt/ground/G-04": true,
  "sjt/ground/G-06": true,
}

// Show time like "06:42 PM"
export function formatTime(date) {
  if (!date) return "-"
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

// Show date like "6 Sept 2026"
export function formatDate(date) {
  if (!date) return "-"
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
