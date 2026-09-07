// js/entry.js
import { db, functions } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-functions.js";
import { setupRecaptcha, sendOTP, verifyOTP } from "./authService.js";

// Cloud Function caller
const lockSlot = httpsCallable(functions, "lockSlot");

// Active lot identifier
const CURRENT_LOT_ID = "phoneix-marketcity";

// DOM target
const gridContainer = document.getElementById("parking-grid");

// Interaction State
let selectedSlotId = null;
let confirmationResult = null;
let recaptchaVerifier = null;

/**
 * Ensures the reservation form, recaptcha container, and feedback banners exist in the DOM below the grid
 */
function ensureUIElements() {
  if (!gridContainer || !gridContainer.parentNode) return;

  let errorBanner = document.getElementById("entry-error-banner");
  if (!errorBanner) {
    errorBanner = document.createElement("div");
    errorBanner.id = "entry-error-banner";
    errorBanner.className = "status-box hidden";
    errorBanner.style.cssText =
      "background: #fef2f2; color: #991b1b; border: 2px solid #ef4444; font-size: 1rem; padding: 14px; margin-top: 20px;";
    gridContainer.parentNode.insertBefore(errorBanner, gridContainer.nextSibling);
  }

  let bookingSection = document.getElementById("booking-section");
  if (!bookingSection) {
    bookingSection = document.createElement("section");
    bookingSection.id = "booking-section";
    bookingSection.className = "card hidden";
    bookingSection.innerHTML = `
      <h2 style="margin-bottom: 8px;">Reserve Slot: <span id="selected-slot-id" style="color: var(--primary);"></span></h2>
      <p style="color: var(--text-muted); margin-bottom: 16px;">Enter your vehicle and mobile details to lock this slot.</p>

      <div id="booking-status" class="status-box hidden"></div>

      <form id="booking-form" onsubmit="return false;">
        <div id="booking-step-details">
         
          <label for="phone-input">Mobile Number (with country code):</label>
          <input type="tel" id="phone-input" placeholder="+919876543210" required />

          <button type="button" id="send-otp-btn" class="btn">Send OTP</button>
        </div>

        <div id="booking-step-otp" class="hidden" style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px;">
          <label for="otp-input">Enter 6-Digit OTP:</label>
          <input type="text" id="otp-input" placeholder="123456" maxlength="6" autocomplete="one-time-code" />

          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <button type="button" id="verify-park-btn" class="btn btn-pay">Verify &amp; Park Here</button>
            <button type="button" id="cancel-booking-btn" class="btn" style="background: #6b7280;">Cancel</button>
          </div>
        </div>

        <div id="recaptcha-container"></div>
      </form>
    `;

    gridContainer.parentNode.insertBefore(bookingSection, errorBanner.nextSibling);
  }

  let successBanner = document.getElementById("entry-success-banner");
  if (!successBanner) {
    successBanner = document.createElement("div");
    successBanner.id = "entry-success-banner";
    successBanner.className = "status-box hidden";
    successBanner.style.cssText =
      "background: #ecfdf5; color: #065f46; border: 2px solid #10b981; font-size: 1.1rem; padding: 18px; margin-top: 20px; font-weight: 600;";
    gridContainer.parentNode.insertBefore(successBanner, bookingSection.nextSibling);
  }
}

function showBookingStatus(message, type = "info") {
  const statusBox = document.getElementById("booking-status");
  if (!statusBox) return;

  statusBox.textContent = message;
  statusBox.classList.remove("hidden");

  if (type === "error") {
    statusBox.style.background = "#fef2f2";
    statusBox.style.color = "#991b1b";
    statusBox.style.border = "1px solid #ef4444";
  } else if (type === "success") {
    statusBox.style.background = "#ecfdf5";
    statusBox.style.color = "#065f46";
    statusBox.style.border = "1px solid #10b981";
  } else {
    statusBox.style.background = "#e0f2fe";
    statusBox.style.color = "#0369a1";
    statusBox.style.border = "1px solid #bae6fd";
  }
}

function selectSlot(slotId) {
  selectedSlotId = slotId;

  const successBanner = document.getElementById("entry-success-banner");
  if (successBanner) successBanner.classList.add("hidden");

  const errorBanner = document.getElementById("entry-error-banner");
  if (errorBanner) errorBanner.classList.add("hidden");

  const slotDisplay = document.getElementById("selected-slot-id");
  if (slotDisplay) slotDisplay.textContent = slotId;

  const bookingSection = document.getElementById("booking-section");
  const stepOtp = document.getElementById("booking-step-otp");
  const otpInput = document.getElementById("otp-input");
  const sendOtpBtn = document.getElementById("send-otp-btn");
  const bookingStatus = document.getElementById("booking-status");

  if (stepOtp) stepOtp.classList.add("hidden");
  if (otpInput) otpInput.value = "";
  if (sendOtpBtn) {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
  if (bookingStatus) {
    bookingStatus.classList.add("hidden");
    bookingStatus.textContent = "";
  }

  confirmationResult = null;

  if (bookingSection) {
    bookingSection.classList.remove("hidden");
    bookingSection.scrollIntoView({ behavior: "smooth" });
  }

  document.querySelectorAll(".slot-card").forEach((card) => {
    if (card.dataset.slotId === slotId) {
      card.style.outline = "3px solid var(--primary)";
      card.style.outlineOffset = "2px";
    } else {
      card.style.outline = "none";
    }
  });
}

async function handleSendOTP() {
  const phoneInput = document.getElementById("phone-input");
  const sendOtpBtn = document.getElementById("send-otp-btn");

  let phoneNumber = phoneInput ? phoneInput.value.trim() : "";

  if (!phoneNumber) {
    showBookingStatus("Please enter your mobile phone number.", "error");
    if (phoneInput) phoneInput.focus();
    return;
  }

  if (!phoneNumber.startsWith("+")) {
    phoneNumber = phoneNumber.length === 10 ? "+91" + phoneNumber : "+" + phoneNumber;
  }

  try {
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Sending OTP...";
    showBookingStatus(`Sending verification code to ${phoneNumber}...`, "info");

    if (!recaptchaVerifier) {
      recaptchaVerifier = setupRecaptcha("recaptcha-container");
    }

    confirmationResult = await sendOTP(phoneNumber, recaptchaVerifier);

    showBookingStatus(`OTP sent successfully to ${phoneNumber}!`, "success");
    sendOtpBtn.textContent = "OTP Sent ✓";

    const stepOtp = document.getElementById("booking-step-otp");
    if (stepOtp) {
      stepOtp.classList.remove("hidden");
      const otpInput = document.getElementById("otp-input");
      if (otpInput) otpInput.focus();
    }
  } catch (err) {
    console.error("[SmartPark] Error sending OTP:", err);
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
    showBookingStatus(`Failed to send OTP: ${err.message || err}`, "error");
  }
}

async function handleVerifyAndPark() {
  const verifyBtn = document.getElementById("verify-park-btn");
  const otpInput = document.getElementById("otp-input");
  const phoneInput = document.getElementById("phone-input");

  const code = otpInput ? otpInput.value.trim() : "";
  let rawPhone = phoneInput ? phoneInput.value.trim() : "";
  if (!rawPhone.startsWith("+")) {
    rawPhone = rawPhone.length === 10 ? "+91" + rawPhone : "+" + rawPhone;
  }

  if (!code || code.length < 6) {
    showBookingStatus("Please enter the 6-digit verification code.", "error");
    if (otpInput) otpInput.focus();
    return;
  }

  if (!confirmationResult) {
    showBookingStatus("No active verification session. Click 'Send OTP' first.", "error");
    return;
  }

  if (!selectedSlotId) {
    showBookingStatus("No slot selected.", "error");
    return;
  }

  const slotIdToLock = selectedSlotId;

  try {
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";
    showBookingStatus("Verifying code and reserving slot...", "info");

    const verifiedPhone = await verifyOTP(confirmationResult, code);
    const finalPhone = verifiedPhone || rawPhone;

    const response = await lockSlot({
      lotId: CURRENT_LOT_ID,
      slotId: slotIdToLock,
      phone: finalPhone,
    });

    const data = response.data;
    if (data && data.success) {
      const bookingSection = document.getElementById("booking-section");
      if (bookingSection) bookingSection.classList.add("hidden");

      const successBanner = document.getElementById("entry-success-banner");
      if (successBanner) {
        successBanner.textContent = `You're parked at ${data.slotId || slotIdToLock}. Use this phone number to exit.`;
        successBanner.classList.remove("hidden");
        successBanner.scrollIntoView({ behavior: "smooth" });
      }

      selectedSlotId = null;
      confirmationResult = null;
      document.querySelectorAll(".slot-card").forEach((card) => (card.style.outline = "none"));
    } else {
      throw new Error("Unable to reserve slot.");
    }
  } catch (err) {
    console.error("[SmartPark] lockSlot failure:", err);

    const errorMsg = err.message || "Failed to reserve slot.";

    const bookingSection = document.getElementById("booking-section");
    if (bookingSection) bookingSection.classList.add("hidden");

    selectedSlotId = null;
    confirmationResult = null;
    document.querySelectorAll(".slot-card").forEach((card) => (card.style.outline = "none"));

    const errorBanner = document.getElementById("entry-error-banner");
    if (errorBanner) {
      errorBanner.textContent = errorMsg;
      errorBanner.classList.remove("hidden");
      errorBanner.scrollIntoView({ behavior: "smooth" });
    }
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify & Park Here";
  }
}

function handleCancelBooking() {
  const bookingSection = document.getElementById("booking-section");
  if (bookingSection) bookingSection.classList.add("hidden");

  selectedSlotId = null;
  confirmationResult = null;
  document.querySelectorAll(".slot-card").forEach((card) => (card.style.outline = "none"));
}

function setupEventListeners() {
  if (gridContainer) {
    gridContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".slot-card");
      if (!card) return;

      if (card.classList.contains("slot-occupied")) {
        return;
      }

      if (card.classList.contains("slot-available")) {
        const slotId = card.dataset.slotId;
        if (slotId) {
          selectSlot(slotId);
        }
      }
    });
  }

  const sendOtpBtn = document.getElementById("send-otp-btn");
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", handleSendOTP);
  }

  const verifyBtn = document.getElementById("verify-park-btn");
  if (verifyBtn) {
    verifyBtn.addEventListener("click", handleVerifyAndPark);
  }

  const cancelBtn = document.getElementById("cancel-booking-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", handleCancelBooking);
  }

  const otpInput = document.getElementById("otp-input");
  if (otpInput) {
    otpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleVerifyAndPark();
      }
    });
  }
}

/**
 * Renders the parking bay grid grouped by floor.
 * Slot documents now use "label" (not "slotId") and "floor" is a string (e.g. "Ground", "Level 1").
 * The Firestore document ID (doc.id) is used as the slot identifier for locking.
 */
function renderGrid(slots) {
  if (!gridContainer) return;

  if (slots.length === 0) {
    gridContainer.innerHTML = `
      <div class="status-box">
        No slots found for this lot. Please run <a href="seed.html">Database Seeder</a> first.
      </div>
    `;
    return;
  }

  const floors = {};
  slots.forEach((slot) => {
    const floor = slot.floor || "Ground";
    if (!floors[floor]) {
      floors[floor] = [];
    }
    floors[floor].push(slot);
  });

  Object.keys(floors).forEach((floor) => {
    floors[floor].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  });

  // Preserve a sensible floor order if present, otherwise alphabetical
  const floorOrder = ["Ground", "Level 1", "Level 2", "Basement"];
  const sortedFloors = Object.keys(floors).sort((a, b) => {
    const ia = floorOrder.indexOf(a);
    const ib = floorOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  let html = "";

  sortedFloors.forEach((floor) => {
    const floorSlots = floors[floor];
    const availableCount = floorSlots.filter((s) => s.status === "available").length;

    html += `
      <section class="floor-section">
        <div class="floor-header">
          <h2>${floor}</h2>
          <span class="floor-badge">${availableCount} / ${floorSlots.length} Available</span>
        </div>
        <div class="slots-grid">
          ${floorSlots
            .map((slot) => {
              const isAvailable = slot.status === "available";
              const isSelected = selectedSlotId === slot.id;
              const cursorStyle = isAvailable ? "cursor: pointer;" : "cursor: not-allowed;";
              const outlineStyle = isSelected ? "outline: 3px solid var(--primary); outline-offset: 2px;" : "";

              return `
                <div 
                  class="slot-card ${isAvailable ? "slot-available" : "slot-occupied"}"
                  data-slot-id="${slot.id}"
                  style="${cursorStyle} ${outlineStyle}"
                  title="${isAvailable ? `Click to reserve slot ${slot.label}` : `Slot ${slot.label} is occupied`}"
                >
                  <div class="slot-name">${slot.label || slot.id}</div>
                  <div class="slot-status">${(slot.status || "UNKNOWN").toUpperCase()}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  });

  gridContainer.innerHTML = html;
}

/**
 * Initializes the real-time Firestore listener on lots/{lotId}/slots (subcollection, not flat).
 */
export function initLiveSlotGrid(lotId = CURRENT_LOT_ID) {
  if (gridContainer) {
    gridContainer.innerHTML = `<div class="loading">Connecting to real-time slot stream...</div>`;
  }

  ensureUIElements();
  setupEventListeners();

  const slotsRef = collection(db, "lots", lotId, "slots");

  const unsubscribe = onSnapshot(
    slotsRef,
    (snapshot) => {
      const slots = [];
      snapshot.forEach((doc) => {
        slots.push({ id: doc.id, ...doc.data() });
      });

      console.log(`[SmartPark] Live sync: ${slots.length} slots loaded.`);
      renderGrid(slots);
    },
    (error) => {
      console.error("[SmartPark] Error listening to slot updates:", error);
      if (gridContainer) {
        gridContainer.innerHTML = `<div class="error status-box">Failed to stream slot data: ${error.message}</div>`;
      }
    }
  );

  return unsubscribe;
}

document.addEventListener("DOMContentLoaded", () => {
  initLiveSlotGrid(CURRENT_LOT_ID);
});