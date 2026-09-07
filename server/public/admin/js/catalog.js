// js/catalog.js — every element you can put on a parking plan.
//
// Each entry:
//   id        stable key stored in the cell
//   group     palette section
//   name      label shown to humans
//   glyph     inline SVG (24x24 viewBox) drawn in the palette and on the grid
//   kind      "bay" | "lane" | "wall" | "prop"   — drives behaviour, not looks
//   rotatable can be turned with R
//   consumes  true = takes a real Firestore bay label
//   tint      css var used for the glyph/border
//
// Cells on the grid store { el:<id>, rot?:0|90|180|270, id?:<bay label>, text?:<sign text> }

const g = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;

export const CATALOG = {
  // ---------------- bays ----------------
  "bay": { group:"Parking bays", name:"Standard bay", kind:"bay", consumes:true, tint:"free", rotatable:true,
    glyph: g(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17h8"/>`) },
  "bay-angled": { group:"Parking bays", name:"Angled bay", kind:"bay", consumes:true, tint:"free", rotatable:true, skew:true,
    glyph: g(`<path d="M7 3h13l-3 18H4z"/><path d="M8 17h8"/>`) },
  "bay-compact": { group:"Parking bays", name:"Compact bay", kind:"bay", consumes:true, tint:"free", rotatable:true,
    glyph: g(`<rect x="6" y="5" width="12" height="14" rx="2"/><path d="M9 16h6"/>`) },
  "bay-accessible": { group:"Parking bays", name:"Accessible bay", kind:"bay", consumes:true, tint:"route", rotatable:true,
    glyph: g(`<circle cx="12" cy="5" r="1.6"/><path d="M10 9h5"/><path d="M10 9v5h4l2 5"/><path d="M13.5 14a4 4 0 1 1-3.5-4"/>`) },
  "bay-ev": { group:"Parking bays", name:"EV charging bay", kind:"bay", consumes:true, tint:"free", rotatable:true,
    glyph: g(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M13 7l-3 5h4l-3 5"/>`) },
  "bay-moto": { group:"Parking bays", name:"Motorcycle bay", kind:"bay", consumes:true, tint:"free", rotatable:true,
    glyph: g(`<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-6h5l3 6"/><path d="M10 10h4"/>`) },
  "bay-reserved": { group:"Parking bays", name:"Reserved bay", kind:"bay", consumes:true, tint:"warn", rotatable:true,
    glyph: g(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9h6M9 13h6"/>`) },

  // ---------------- circulation ----------------
  "lane": { group:"Circulation", name:"Lane (pen)", kind:"lane", tint:"lane", pen:true,
    glyph: g(`<path d="M12 3v18M3 12h18"/>`) },
  "arrow-one": { group:"Circulation", name:"One-way arrow", kind:"prop", rotatable:true, tint:"route", overLane:true,
    glyph: g(`<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>`) },
  "arrow-two": { group:"Circulation", name:"Two-way arrow", kind:"prop", rotatable:true, tint:"route", overLane:true,
    glyph: g(`<path d="M12 4v16"/><path d="M8 8l4-4 4 4"/><path d="M8 16l4 4 4-4"/>`) },
  "speed-bump": { group:"Circulation", name:"Speed bump", kind:"prop", rotatable:true, tint:"warn", overLane:true,
    glyph: g(`<path d="M3 15c3-6 15-6 18 0"/><path d="M3 19h18"/>`) },
  "ramp": { group:"Circulation", name:"Ramp", kind:"prop", rotatable:true, tint:"muted", overLane:true,
    glyph: g(`<path d="M3 19h18L3 8z"/>`) },
  "crosswalk": { group:"Circulation", name:"Crossing", kind:"prop", rotatable:true, tint:"ink", overLane:true,
    glyph: g(`<path d="M5 4v16M10 4v16M15 4v16M20 4v16"/>`) },

  // ---------------- structure ----------------
  "pillar": { group:"Structure", name:"Pillar", kind:"prop", tint:"ink",
    glyph: g(`<rect x="6" y="4" width="12" height="16" rx="1"/><path d="M6 8h12M6 12h12M6 16h12"/>`) },
  "wall": { group:"Structure", name:"Wall", kind:"wall", pen:true, tint:"ink",
    glyph: g(`<rect x="3" y="6" width="18" height="5"/><rect x="3" y="13" width="18" height="5"/>`) },
  "bollard": { group:"Structure", name:"Bollard", kind:"prop", tint:"muted",
    glyph: g(`<path d="M12 20V8"/><circle cx="12" cy="6" r="2.5"/><path d="M8 20h8"/>`) },
  "island": { group:"Structure", name:"Kerb / island", kind:"prop", rotatable:true, tint:"muted",
    glyph: g(`<rect x="3" y="9" width="18" height="6" rx="3"/>`) },

  // ---------------- signage & safety ----------------
  "mirror": { group:"Signage & safety", name:"Convex mirror", kind:"prop", tint:"route",
    glyph: g(`<circle cx="12" cy="10" r="6"/><path d="M12 16v5"/><path d="M9 21h6"/>`) },
  "sign": { group:"Signage & safety", name:"Sign", kind:"prop", tint:"warn", text:true,
    glyph: g(`<path d="M12 3l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`) },
  "no-parking": { group:"Signage & safety", name:"No parking", kind:"prop", tint:"taken",
    glyph: g(`<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>`) },
  "height-limit": { group:"Signage & safety", name:"Height limit", kind:"prop", tint:"warn", text:true,
    glyph: g(`<path d="M4 5h16"/><path d="M12 8v11"/><path d="M9 11l3-3 3 3"/><path d="M9 16l3 3 3-3"/>`) },
  "cctv": { group:"Signage & safety", name:"Camera", kind:"prop", rotatable:true, tint:"ink",
    glyph: g(`<path d="M3 8l14-3 2 6-14 3z"/><path d="M6 14v5"/><path d="M17 11l4-1"/>`) },

  // ---------------- access ----------------
  "gate-entry": { group:"Access", name:"Entry gate", kind:"prop", unique:true, tint:"free", rotatable:true,
    glyph: g(`<path d="M4 20V6"/><path d="M4 8h14l2 3-2 3H4"/>`) },
  "gate-exit": { group:"Access", name:"Exit gate", kind:"prop", unique:true, tint:"taken", rotatable:true,
    glyph: g(`<path d="M20 20V6"/><path d="M20 8H6l-2 3 2 3h14"/>`) },
  "kiosk": { group:"Access", name:"Ticket kiosk", kind:"prop", tint:"ink",
    glyph: g(`<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="9" y="6" width="6" height="5"/><path d="M9 15h6"/>`) },
  "elevator": { group:"Access", name:"Lift", kind:"prop", tint:"ink",
    glyph: g(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>`) },
  "stairs": { group:"Access", name:"Stairs", kind:"prop", rotatable:true, tint:"ink",
    glyph: g(`<path d="M3 20h5v-4h5v-4h5V8h3"/>`) },
  "pedestrian": { group:"Access", name:"Pedestrian exit", kind:"prop", rotatable:true, tint:"free",
    glyph: g(`<circle cx="12" cy="5" r="2"/><path d="M12 8v6"/><path d="M9 21l3-7 3 7"/><path d="M8 11l4-2 4 2"/>`) }
};

export const GROUPS = ["Parking bays", "Circulation", "Structure", "Signage & safety", "Access"];

export const el = (id) => CATALOG[id] || null;
export const isBay = (cell) => !!cell && !!CATALOG[cell.el]?.consumes;
export const isLaneLike = (cell) => !!cell && CATALOG[cell.el]?.kind === "lane";
export const isWallLike = (cell) => !!cell && CATALOG[cell.el]?.kind === "wall";

/** Old saved plans used type/dir/kind. Bring them forward. */
export function migrateCell(cell) {
  if (!cell) return null;
  if (cell.el) return cell;
  const t = cell.type;
  if (t === "slot")   return { el:"bay", id: cell.id };
  if (t === "angled") return { el:"bay-angled", id: cell.id };
  if (t === "road" || t === "curve" || t === "lane") return { el:"lane" };
  if (t === "pillar") return { el:"pillar" };
  if (t === "sign")   return { el:"sign", text: cell.label || "" };
  if (t === "gate")   return { el: (cell.kind === "exit" || /exit/i.test(cell.label||"")) ? "gate-exit" : "gate-entry" };
  return null;
}
