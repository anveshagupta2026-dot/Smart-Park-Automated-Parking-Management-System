"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { LOTS, formatDate, formatTime, slotKey } from "@/lib/parking-data"

type Session = { lotId: string; floorId: string; slot: string; mobile: string; entryTime: string; active: boolean }
const SESSION_KEY = "smart-park-session"
const OCCUPIED_KEY = "smart-park-occupied"

export function ExitPark() {
  const [step, setStep] = useState<"phone" | "otp" | "bill" | "payment" | "success">("phone")
  const [mobile, setMobile] = useState("")
  const [otp, setOtp] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState("")
  const [exitTime, setExitTime] = useState<Date | null>(null)
  const [lockedAmount, setLockedAmount] = useState(0)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const lot = LOTS.find((x) => x.id === session?.lotId)
  const floor = lot?.floors.find((x) => x.id === session?.floorId)

  function verifyPhone() {
    const saved = typeof window !== "undefined" ? JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Session | null : null
    if (!saved || !saved.active || saved.mobile !== mobile) { setError("No active parking session was found for this mobile number."); return }
    setSession(saved); setError(""); setStep("otp")
  }

  function verifyOtp() {
    if (otp.length !== 6) { setError("Please enter a 6-digit OTP."); return }
    if (!session) return
    const now = new Date(); setExitTime(now)
    const minutes = Math.max(1, Math.ceil((now.getTime() - new Date(session.entryTime).getTime()) / 60000))
    const hours = Math.max(1, Math.ceil(minutes / 60))
    const baseHourly = 20, occupancyFactor = 1.3, peakFactor = 1.2, ceilingHourly = 50
    const hourly = Math.min(baseHourly * occupancyFactor * peakFactor, ceilingHourly)
    setLockedAmount(Math.round(hourly * hours)); setError(""); setStep("bill")
  }

  const duration = useMemo(() => {
    if (!session || !exitTime) return "-"
    const mins = Math.max(1, Math.ceil((exitTime.getTime() - new Date(session.entryTime).getTime()) / 60000))
    const h = Math.floor(mins / 60), m = mins % 60
    return h > 0 ? `${h} hr ${m} min` : `${m} min`
  }, [session, exitTime])

  function pay() {
    const next = attempts + 1; setAttempts(next)
    if (next === 1) { setError(`Payment didn't go through. Your amount is still ₹${lockedAmount} — try again.`); return }
    if (!session) return
    const occupied = JSON.parse(localStorage.getItem(OCCUPIED_KEY) || "{}") as Record<string, boolean>
    const key = slotKey(session.lotId, session.floorId, session.slot)
    delete occupied[key]
    localStorage.setItem(OCCUPIED_KEY, JSON.stringify(occupied))
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, active: false }))
    setError(""); setStep("success")
  }

  return <main className="sp-page"><div className="sp-card">
    {step === "phone" && <><p className="sp-brand">SMART PARK EXIT</p><h1 className="sp-title">Verify to Exit</h1><p className="sp-text">Enter the same mobile number used when entering.</p>
      <label className="sp-detail-label">Mobile Number</label><div className="sp-input-row"><span className="sp-prefix">+91</span><input className="sp-input" type="tel" maxLength={10} placeholder="Enter 10-digit number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} /></div>
      {error && <div className="sp-error">{error}</div>}<button className="sp-btn" disabled={mobile.length !== 10} onClick={verifyPhone}>Send OTP</button></>}

    {step === "otp" && <><p className="sp-brand">SMART PARK EXIT</p><h1 className="sp-title">Verify Exit</h1><p className="sp-text">Enter the 6-digit OTP. Any 6 digits work in this demo.</p><input className="sp-input" type="tel" maxLength={6} placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />{error && <div className="sp-error">{error}</div>}<button className="sp-btn" onClick={verifyOtp}>Verify &amp; View Bill</button></>}

    {step === "bill" && session && lot && floor && <><p className="sp-brand">SMART PARK</p><h1 className="sp-title">Your Bill</h1><p className="sp-text">Your bill is now locked and will not change during payment retries.</p>
      <div className="sp-detail"><span className="sp-detail-label">Lot</span><span className="sp-detail-value">{lot.name}</span></div><div className="sp-detail"><span className="sp-detail-label">Floor</span><span className="sp-detail-value">{floor.name}</span></div><div className="sp-detail"><span className="sp-detail-label">Stall</span><span className="sp-detail-value">{session.slot}</span></div><div className="sp-detail"><span className="sp-detail-label">Duration</span><span className="sp-detail-value">{duration}</span></div>
      <button className="sp-toggle" onClick={() => setShowBreakdown(!showBreakdown)}>See rate calculation</button>
      {showBreakdown && <div className="sp-breakdown"><div><span>Base rate</span><span>₹20 / hr</span></div><div><span>Occupancy ×1.3</span><span>₹26 / hr</span></div><div><span>Peak hour ×1.2</span><span>₹31.20 / hr</span></div><div><span>Rate ceiling</span><span>₹50 / hr maximum</span></div></div>}
      <p className="sp-detail-label sp-center" style={{ marginTop: 14 }}>AMOUNT DUE</p><div className="sp-amount">₹{lockedAmount}</div><button className="sp-btn" onClick={() => setStep("payment")}>Pay ₹{lockedAmount}</button></>}

    {step === "payment" && <><p className="sp-brand">SMART PARK</p><h1 className="sp-title">Pay to Exit</h1><p className="sp-text">Same amount every time — a failed attempt never recalculates your bill.</p><div className="sp-pay-card"><input className="sp-input" defaultValue="4242 4242 4242 4242" /><div className="sp-pay-row"><input className="sp-input" defaultValue="12/28" /><input className="sp-input" defaultValue="123" /></div></div>{error && <div className="sp-error">{error}</div>}<button className="sp-btn" onClick={pay}>{attempts === 0 ? `Pay ₹${lockedAmount}` : `Retry — Pay ₹${lockedAmount}`}</button></>}

    {step === "success" && <div className="sp-center"><div className="sp-success-tick">✓</div><h1 className="sp-title">EXIT CONFIRMED</h1><p className="sp-text">Payment complete. Your parking session is closed and the slot is available again.</p><Link className="sp-btn" href="/">Back to Home</Link></div>}
  </div></main>
}
