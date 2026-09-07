// Paste this into functions/index.js (anywhere after `const db = admin.firestore();`), then:
//   cd functions && firebase deploy --only functions:updateLotLayout
// Then in Cloud Run console: updatelotlayout → Security → Allow public access (same as the others).
//
// Stores the admin-drawn blueprint for one floor on the lot doc:
//   lots/{lotId}.layout.floors[floorName] = { cols, rows, cells: { "r_c": cell } }
// Entry/exit pages read it live via onSnapshot(lots/{lotId}); no rules change needed.

exports.updateLotLayout = onCall(async (request) => {
  const { lotId, floor, layout } = request.data || {};
  if (!lotId || !floor || !layout || typeof layout !== "object" || !layout.cells) {
    throw new HttpsError("invalid-argument", "'lotId', 'floor', and a layout {cols, rows, cells} are required.");
  }
  const lotRef = db.collection("lots").doc(lotId);
  const snap = await lotRef.get();
  if (!snap.exists) throw new HttpsError("not-found", `Lot '${lotId}' not found.`);

  await lotRef.update({
    [`layout.floors.${floor.replace(/\./g, "_")}`]: {
      cols: Number(layout.cols), rows: Number(layout.rows), cells: layout.cells
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { success: true };
});
