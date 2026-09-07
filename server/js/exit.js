// js/exit.js
import { functions } from "./firebase-config.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-functions.js";
import { setupRecaptcha, sendOTP, verifyOTP } from "./authService.js";

const CURRENT_LOT_ID = "phoneix-marketcity";
const STRIPE_PUBLISHABLE_KEY = "pk_test_51UChHzL1pibr28o9lx7ORwO9iCKBc8MbC5CcE0qEIJ9XBv9l92sULCO2JhYsbefHzyEXwVPqO09ebKSapNCHQP6800JL6wtr1s";

const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
const elements = stripe.elements();
const cardElement = elements.create("card");

const finalizeExit = httpsCallable(functions, "finalizeExit");
const createPaymentIntent = httpsCallable(functions, "createPaymentIntent");
const confirmPaymentAndRelease = httpsCallable(functions, "confirmPaymentAndRelease");

const phoneInput = document.getElementById("phone-input");
const sendOtpBtn = document.getElementById("send-otp-btn");
const otpStep = document.getElementById("otp-step");
const otpInput = document.getElementById("otp-input");
const verifyOtpBtn = document.getElementById("verify-otp-btn");
const billSummary = document.getElementById("bill-summary");
const billDuration = document.getElementById("bill-duration");
const billAmount = document.getElementById("bill-amount");
const exitStatus = document.getElementById("exit-status");
const payBtn = document.getElementById("pay-btn");
const paymentElementContainer = document.getElementById("payment-element-container");

let confirmationResult = null;
let recaptchaVerifier = null;
let currentSession = { phone: null, amount: 0, clientSecret: null };
let cardMounted = false;

function showStatus(message, isError = false) {
  exitStatus.classList.remove("hidden");
  exitStatus.textContent = message;
  exitStatus.style.background = isError ? "#fee2e2" : "#e0f2fe";
  exitStatus.style.color = isError ? "#991b1b" : "#0369a1";
  exitStatus.style.border = isError ? "1px solid #ef4444" : "1px solid #bae6fd";
}

async function handleSendOTP() {
  let phone = phoneInput.value.trim();
  if (!phone) {
    showStatus("Please enter your mobile phone number.", true);
    return;
  }
  if (!phone.startsWith("+")) {
    phone = phone.length === 10 ? "+91" + phone : "+" + phone;
  }
  try {
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Sending OTP...";
    if (!recaptchaVerifier) recaptchaVerifier = setupRecaptcha("recaptcha-container");
    confirmationResult = await sendOTP(phone, recaptchaVerifier);
    showStatus(`OTP sent to ${phone}.`);
    sendOtpBtn.textContent = "OTP Sent ✓";
    if (otpStep) {
      otpStep.classList.remove("hidden");
      if (otpInput) otpInput.focus();
    }
  } catch (err) {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
    showStatus(`Failed to send OTP: ${err.message || err}`, true);
  }
}

async function handleVerifyOTP() {
  const code = otpInput ? otpInput.value.trim() : "";
  let rawPhone = phoneInput ? phoneInput.value.trim() : "";
  if (!rawPhone.startsWith("+")) {
    rawPhone = rawPhone.length === 10 ? "+91" + rawPhone : "+" + rawPhone;
  }
  if (!code || code.length < 6) {
    showStatus("Please enter the 6-digit code.", true);
    return;
  }
  if (!confirmationResult) {
    showStatus("Click 'Send OTP' first.", true);
    return;
  }
  try {
    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = "Verifying...";
    const verifiedPhone = await verifyOTP(confirmationResult, code);
    const finalPhone = verifiedPhone || rawPhone;

    const res = await finalizeExit({ lotId: CURRENT_LOT_ID, phone: finalPhone });
    const { amount, durationHours, status } = res.data;

    currentSession.phone = finalPhone;
    currentSession.amount = amount;

    billDuration.textContent = `${durationHours || 1} hour(s)`;
    billAmount.textContent = amount;
    billSummary.classList.remove("hidden");
    showStatus(`Bill ready: ₹${amount} (${status}).`);

    if (!cardMounted) {
      cardElement.mount("#payment-element-container");
      cardMounted = true;
    }
  } catch (err) {
    showStatus(`Error: ${err.message || err}`, true);
  } finally {
    verifyOtpBtn.disabled = false;
    verifyOtpBtn.textContent = "Verify";
  }
}

if (sendOtpBtn) sendOtpBtn.addEventListener("click", handleSendOTP);
if (verifyOtpBtn) verifyOtpBtn.addEventListener("click", handleVerifyOTP);

if (payBtn) {
  payBtn.addEventListener("click", async () => {
    if (!currentSession.phone || currentSession.amount <= 0) return;

    payBtn.disabled = true;
    showStatus("Initializing secure Stripe checkout...");

    try {
      const intentRes = await createPaymentIntent({
        lotId: CURRENT_LOT_ID,
        phone: currentSession.phone
      });
      const { clientSecret } = intentRes.data;
      currentSession.clientSecret = clientSecret;

      showStatus("Confirming card payment...");

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement }
      });

      if (error) {
        showStatus(`Card error: ${error.message}`, true);
        payBtn.disabled = false;
        return;
      }

      showStatus("Verifying with server...");

      const confirmRes = await confirmPaymentAndRelease({
        lotId: CURRENT_LOT_ID,
        phone: currentSession.phone,
        paymentIntentId: paymentIntent.id
      });

      if (confirmRes.data.success) {
        showStatus(`Payment Successful! Slot ${confirmRes.data.slotReleased} is released.`);
        billSummary.classList.add("hidden");
      } else {
        showStatus(`Payment not completed: ${confirmRes.data.message}`, true);
        payBtn.disabled = false;
      }
    } catch (err) {
      showStatus(`Payment failed: ${err.message}`, true);
      payBtn.disabled = false;
    }
  });
}