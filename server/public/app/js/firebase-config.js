// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMN7r0b0Wq8uJ6feZC6ROGEpcM7Rbq6KA",
  authDomain: "smart-park-3b9a8.firebaseapp.com",
  projectId: "smart-park-3b9a8",
  storageBucket: "smart-park-3b9a8.firebasestorage.app",
  messagingSenderId: "1095221997691",
  appId: "1:1095221997691:web:83099b4a9aa9bc74ce72de"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);
