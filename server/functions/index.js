// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

function getStripeInstance() {
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

function isPeakHour(date, timeZone = "Asia/Kolkata") {
  const d = date && date.toDate ? date.toDate() : new Date(date);
  const localHourStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", hour12: false, timeZone: timeZone
  }).format(d);
  const hour = parseInt(localHourStr, 10);
  return (hour >= 9 && hour < 11) || (hour >= 17 && hour < 20);
}

function calculatePrice(entryTime, exitTime, occupancyPercent, isPeak) {
  const entryMs = entryTime && entryTime.toDate ? entryTime.toDate().getTime() : new Date(entryTime).getTime();
  const exitMs = exitTime && exitTime.toDate ? exitTime.toDate().getTime() : new Date(exitTime).getTime();
  const durationMs = Math.max(0, exitMs - entryMs);
  const durationHours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
  const BASE_RATE = 20;
  let occupancyMultiplier = 1.0;
  if (occupancyPercent > 80) occupancyMultiplier = 1.6;
  else if (occupancyPercent >= 50) occupancyMultiplier = 1.3;
  const peakMultiplier = isPeak ? 1.2 : 1.0;
  const rawRate = BASE_RATE * occupancyMultiplier * peakMultiplier;
  const finalRate = Math.min(rawRate, 50);

  const rawTotal = Math.round(finalRate * durationHours * 100) / 100;
  const MIN_CHARGE = 50;  // Stripe requires ~$0.50 USD equivalent minimum
  const MAX_CHARGE = 100; // Hard ceiling for this demo
  const total = Math.min(Math.max(rawTotal, MIN_CHARGE), MAX_CHARGE);

  return {
    total, durationHours, finalRate,
    breakdown: { baseRate: BASE_RATE, occupancyMultiplier, peakMultiplier, rawRate, isCapped: rawRate > 50 }
  };
}

// ============================================================================
// finalizeExit
// ============================================================================
exports.finalizeExit = onCall(async (request) => {
  const { lotId, phone } = request.data || {};
  if (!lotId || !phone) throw new HttpsError("invalid-argument", "Both 'lotId' and 'phone' are required.");

  const normalizedPhone = String(phone).trim();
  const ticketRef = db.collection("tickets").doc(normalizedPhone);
  const lotRef = db.collection("lots").doc(lotId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const ticketDoc = await transaction.get(ticketRef);
      if (!ticketDoc.exists) throw new HttpsError("not-found", `No ticket found for phone: ${normalizedPhone}`);
      const ticket = ticketDoc.data();
      if (ticket.lotId !== lotId) throw new HttpsError("permission-denied", "Ticket lotId mismatch.");

      if (ticket.status === "billed" || ticket.status === "paid") {
        return { amount: ticket.amount, status: ticket.status, alreadyBilled: true, durationHours: ticket.durationHours || 1 };
      }
      if (ticket.status !== "active") throw new HttpsError("failed-precondition", `Cannot bill ticket in '${ticket.status}' status.`);

      const lotDoc = await transaction.get(lotRef);
      if (!lotDoc.exists) throw new HttpsError("not-found", `Lot '${lotId}' not found.`);

      const occupiedQuery = db.collection("lots").doc(lotId).collection("slots").where("status", "==", "occupied");
      const totalQuery = db.collection("lots").doc(lotId).collection("slots");
      const [occupiedSnap, totalSnap] = await Promise.all([
        transaction.get(occupiedQuery),
        transaction.get(totalQuery)
      ]);
      const totalSlots = totalSnap.size || 1;
      const occupancyPercent = (occupiedSnap.size / totalSlots) * 100;

      const now = admin.firestore.Timestamp.now();
      const isPeak = isPeakHour(now.toDate());
      const pricing = calculatePrice(ticket.entryTime, now, occupancyPercent, isPeak);

      transaction.update(ticketRef, {
        exitTime: now,
        amount: pricing.total,
        durationHours: pricing.durationHours,
        status: "billed",
        pricingDetails: {
          finalRate: pricing.finalRate,
          occupancyPercent: Math.round(occupancyPercent),
          isPeakHour: isPeak,
          breakdown: pricing.breakdown
        },
        updatedAt: now
      });

      return { amount: pricing.total, status: "billed", durationHours: pricing.durationHours, finalRate: pricing.finalRate, alreadyBilled: false };
    });
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("finalizeExit failed:", err);
    throw new HttpsError("internal", err.message || "Failed to process exit.");
  }
});

// ============================================================================
// createPaymentIntent
// ============================================================================
exports.createPaymentIntent = onCall(async (request) => {
  const { lotId, phone } = request.data || {};
  if (!lotId || !phone) throw new HttpsError("invalid-argument", "Missing 'lotId' or 'phone'.");

  const normalizedPhone = String(phone).trim();
  const ticketRef = db.collection("tickets").doc(normalizedPhone);
  const ticketDoc = await ticketRef.get();
  if (!ticketDoc.exists) throw new HttpsError("not-found", `Ticket for ${normalizedPhone} not found.`);

  const ticket = ticketDoc.data();
  if (ticket.lotId !== lotId) throw new HttpsError("permission-denied", "Ticket lotId mismatch.");
  if (ticket.status === "paid") throw new HttpsError("failed-precondition", "Ticket is already paid.");
  if (ticket.status !== "billed" || !ticket.amount || ticket.amount <= 0) {
    throw new HttpsError("failed-precondition", "Ticket must be in 'billed' status before creating payment.");
  }

  const stripe = getStripeInstance();
  const amountInPaise = Math.round(ticket.amount * 100);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaise,
      currency: "inr",
      description: `SmartPark parking fee for ${normalizedPhone}`,
      metadata: { phone: normalizedPhone, lotId: lotId, slotId: ticket.slotId },
      automatic_payment_methods: { enabled: true }
    });
    await ticketRef.update({ paymentIntentId: paymentIntent.id, updatedAt: admin.firestore.Timestamp.now() });
    return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount: ticket.amount };
  } catch (err) {
    logger.error("Stripe createPaymentIntent failed:", err);
    throw new HttpsError("internal", `Stripe error: ${err.message}`);
  }
});

// ============================================================================
// confirmPaymentAndRelease
// ============================================================================
exports.confirmPaymentAndRelease = onCall(async (request) => {
  const { lotId, phone, paymentIntentId } = request.data || {};
  if (!lotId || !phone || !paymentIntentId) throw new HttpsError("invalid-argument", "Missing parameters.");

  const normalizedPhone = String(phone).trim();
  const ticketRef = db.collection("tickets").doc(normalizedPhone);
  const ticketDoc = await ticketRef.get();
  if (!ticketDoc.exists) throw new HttpsError("not-found", `Ticket for ${normalizedPhone} not found.`);

  const ticket = ticketDoc.data();
  if (ticket.status === "paid") {
    return { success: true, alreadyProcessed: true, slotReleased: ticket.slotId, message: "Payment already confirmed and slot is released." };
  }

  const stripe = getStripeInstance();
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    logger.error("Failed to retrieve PaymentIntent:", err);
    throw new HttpsError("internal", `Unable to verify payment with Stripe: ${err.message}`);
  }

  if (paymentIntent.status !== "succeeded") {
    return { success: false, status: paymentIntent.status, message: `Payment status is '${paymentIntent.status}'. Ticket remains billed.` };
  }

  const slotId = ticket.slotId;
  const slotRef = db.collection("lots").doc(lotId).collection("slots").doc(slotId);
  const now = admin.firestore.Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const freshTicket = await transaction.get(ticketRef);
    if (freshTicket.data().status === "paid") return;

    transaction.update(ticketRef, { status: "paid", paymentIntentId: paymentIntent.id, paidAt: now, updatedAt: now });
    transaction.update(slotRef, { status: "available", ticketId: null, updatedAt: now });
  });

  return { success: true, alreadyProcessed: false, slotReleased: slotId, message: "Payment verified successfully. Slot released." };
});

// ============================================================================
// lockSlot
// ============================================================================
exports.lockSlot = onCall(async (request) => {
  const { lotId, slotId, phone } = request.data || {};
  if (!lotId || !slotId || !phone) {
    throw new HttpsError("invalid-argument", "Missing required fields: 'lotId', 'slotId', and 'phone' are required.");
  }

  const normalizedPhone = String(phone).trim();
  const ticketRef = db.collection("tickets").doc(normalizedPhone);
  const slotRef = db.collection("lots").doc(lotId).collection("slots").doc(slotId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const ticketDoc = await transaction.get(ticketRef);
      const slotDoc = await transaction.get(slotRef);

      if (ticketDoc.exists) {
        const ticketData = ticketDoc.data();
        if (ticketData.status === "active" || ticketData.status === "billed") {
          throw new HttpsError("already-exists", "You already have an active parking session");
        }
      }

      if (!slotDoc.exists) throw new HttpsError("not-found", `Slot '${slotId}' not found.`);
      const slotData = slotDoc.data();
      if (slotData.status !== "available") {
        throw new HttpsError("failed-precondition", "This slot was just taken, please choose another.");
      }

      const serverNow = admin.firestore.FieldValue.serverTimestamp();

      transaction.update(slotRef, { status: "occupied", ticketId: normalizedPhone, updatedAt: serverNow });
      transaction.set(ticketRef, { lotId, slotId, entryTime: serverNow, status: "active" });

      return { success: true, slotId };
    });
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("lockSlot failed:", err);
    throw new HttpsError("internal", err.message || "Failed to lock slot.");
  }
});

// ============================================================================
// seedDatabase
// ============================================================================
exports.seedDatabase = onCall(async (request) => {
  const lotsConfig = [
    {
      lotId: "main-campus",
      name: "Main Campus Lot",
      location: "Gate 2, VIT Vellore",
      floors: ["Ground", "Level 1", "Level 2"],
      slots: [
        { label: "G-01", floor: "Ground" }, { label: "G-02", floor: "Ground" },
        { label: "G-03", floor: "Ground" }, { label: "G-04", floor: "Ground" },
        { label: "G-05", floor: "Ground" }, { label: "G-06", floor: "Ground" },
        { label: "L1-01", floor: "Level 1" }, { label: "L1-02", floor: "Level 1" },
        { label: "L1-03", floor: "Level 1" }, { label: "L1-04", floor: "Level 1" },
        { label: "L1-05", floor: "Level 1" }, { label: "L1-06", floor: "Level 1" },
        { label: "L2-01", floor: "Level 2" }, { label: "L2-02", floor: "Level 2" },
        { label: "L2-03", floor: "Level 2" }, { label: "L2-04", floor: "Level 2" }
      ]
    },
    {
      lotId: "sjt-block",
      name: "SJT Block Lot",
      location: "SJT, VIT Vellore",
      floors: ["Ground", "Basement"],
      slots: [
        { label: "G-01", floor: "Ground" }, { label: "G-02", floor: "Ground" },
        { label: "G-03", floor: "Ground" }, { label: "G-04", floor: "Ground" },
        { label: "G-05", floor: "Ground" }, { label: "G-06", floor: "Ground" },
        { label: "B-01", floor: "Basement" }, { label: "B-02", floor: "Basement" },
        { label: "B-03", floor: "Basement" }, { label: "B-04", floor: "Basement" }
      ]
    }
  ];

  try {
    let totalCreated = 0;
    let skipped = [];

    for (const lot of lotsConfig) {
      const lotRef = db.collection("lots").doc(lot.lotId);
      const lotDoc = await lotRef.get();

      if (lotDoc.exists) {
        skipped.push(lot.lotId);
        continue;
      }

      const batch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();

      batch.set(lotRef, { floors: lot.floors, location: lot.location, name: lot.name });

      lot.slots.forEach((s) => {
        const slotRef = lotRef.collection("slots").doc(`${lot.lotId}__${s.label}`);
        batch.set(slotRef, {
          floor: s.floor,
          label: s.label,
          lotId: lot.lotId,
          status: "available",
          ticketId: null,
          updatedAt: now
        });
        totalCreated++;
      });

      await batch.commit();
    }

    return { success: true, slotsCreated: totalCreated, skippedLots: skipped, message: `Created ${totalCreated} slots across ${lotsConfig.length - skipped.length} lots.` };
  } catch (err) {
    logger.error("seedDatabase failed:", err);
    throw new HttpsError("internal", err.message || "Failed to seed database.");
  }
});