// js/authService.js — Google Sign-In only.
import { auth } from "./firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const provider = new GoogleAuthProvider();
export async function signInWithGoogle() { const r = await signInWithPopup(auth, provider); return r.user; }
export function getCurrentUser() { return auth.currentUser; }
export function watchAuthState(cb) { return onAuthStateChanged(auth, cb); }
export async function signOutUser() { await signOut(auth); }
