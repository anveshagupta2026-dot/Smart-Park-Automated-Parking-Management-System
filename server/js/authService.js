// js/authService.js
// SIMULATED for hackathon demo — real Firebase Phone Auth requires reCAPTCHA Enterprise,
// which is not reliably testable on localhost within our timeframe.

const SIMULATED_OTP_CODE = "123456";

export function setupRecaptcha(containerId) {
  return null;
}

export async function sendOTP(phoneNumber, recaptchaVerifier) {
  if (!phoneNumber) {
    throw new Error("Phone number is required to send OTP.");
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  console.log(`[SIMULATED] OTP for ${phoneNumber} is: ${SIMULATED_OTP_CODE}`);
  return {
    confirm: async (code) => {
      if (code !== SIMULATED_OTP_CODE) {
        throw new Error("Invalid verification code.");
      }
      return { user: { phoneNumber } };
    }
  };
}

export async function verifyOTP(confirmationResult, code) {
  if (!confirmationResult || typeof confirmationResult.confirm !== "function") {
    throw new Error("Invalid confirmation result object provided to verifyOTP.");
  }
  if (!code) {
    throw new Error("Verification code is required.");
  }
  const userCredential = await confirmationResult.confirm(code);
  return userCredential.user.phoneNumber;
}

export function getCurrentUser() {
  return null;
}