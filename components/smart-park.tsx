"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { LOTS, slotKey, INITIAL_OCCUPIED, formatDate, formatTime } from "@/lib/parking-data"

type Session = {
  lotId: string
  floorId: string
  slot: string
  mobile: string
  entryTime: string
  active: boolean
}

const SESSION_KEY = "smart-park-session"
const OCCUPIED_KEY = "smart-park-occupied"

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try { return JSON.parse(localStorage.getItem(key) || "") as T } catch { return fallback }
}

export function SmartPark({ lotId }: { lotId: string }) {
  const selectedLot = LOTS.find((lot) => lot.slug === lotId || lot.id === lotId)
  const [step, setStep] = useState<"selectFloor" | "map" | "lock" | "phone" | "otp" | "ticket">("selectFloor")
  const [occupied, setOccupied] = useState<Record<string, boolean>>(INITIAL_OCCUPIED)
  const [selectedFloorId, setSelectedFloorId] = useState("")
  const [selectedSlot, setSelectedSlot] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [entryTime, setEntryTime] = useState<Date | null>(null)
  const [lockSeconds, setLockSeconds] = useState(180)

  const selectedFloor = selectedLot?.floors.find((floor) => floor.id === selectedFloorId)
  const activeKey = selectedLot && selectedFloor && selectedSlot ? slotKey(selectedLot.id, selectedFloor.id, selectedSlot) : ""

  useEffect(() => {
    setOccupied(readJson<Record<string, boolean>>(OCCUPIED_KEY, INITIAL_OCCUPIED))
  }, [])

  useEffect(() => {
    if (step !== "lock") return
    setLockSeconds(180)
    const timer = window.setInterval(() => setLockSeconds((s) => s - 1), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step === "lock" && lockSeconds <= 0) {
      setSelectedSlot("")
      setStep("map")
    }
  }, [lockSeconds, step])

  const counts = useMemo(() => {
    if (!selectedFloor || !selectedLot) return { available: 0, occupied: 0 }
    let available = 0, occupiedCount = 0
    selectedFloor.stalls.forEach((stall) => {
      if (occupied[slotKey(selectedLot.id, selectedFloor.id, stall)]) occupiedCount++
      else available++
    })
    return { available, occupied: occupiedCount }
  }, [selectedFloor, selectedLot, occupied])

  function chooseSlot(stall: string) {
    if (!selectedLot || !selectedFloor) return
    if (occupied[slotKey(selectedLot.id, selectedFloor.id, stall)]) return
    setSelectedSlot(stall)
  }

  function confirmEntry() {
    if (!selectedLot || !selectedFloor || !selectedSlot || !activeKey) return
    if (otp.length !== 6) return alert("Please enter a 6-digit OTP")
    const now = new Date()
    const next = { ...occupied, [activeKey]: true }
    setOccupied(next)
    localStorage.setItem(OCCUPIED_KEY, JSON.stringify(next))
    const session: Session = {
      lotId: selectedLot.id,
      floorId: selectedFloor.id,
      slot: selectedSlot,
      mobile: mobileNumber,
      entryTime: now.toISOString(),
      active: true,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setEntryTime(now)
    setOtp("")
    setStep("ticket")
  }

  function ParkingMap({ active = false }: { active?: boolean }) {
    if (!selectedLot || !selectedFloor) return null
    const stalls = selectedFloor.stalls
    const half = Math.ceil(stalls.length / 2)
    const renderSlot = (stall: string) => {
      const key = slotKey(selectedLot.id, selectedFloor.id, stall)
      let className = "sp-slot available"
      if (occupied[key]) className = "sp-slot occupied"
      if (stall === selectedSlot) className = active ? "sp-slot active" : "sp-slot selected"
      return <div key={stall} className={className} onClick={() => !active && chooseSlot(stall)}>{stall}</div>
    }
    return <div className="sp-map">
      <div className="sp-map-label">{selectedLot.name}</div>
      <div className="sp-map-label">{selectedFloor.name}</div>
      <div className="sp-arrow">ENTRANCE ↓</div>
      <div className="sp-row">{stalls.slice(0, half).map(renderSlot)}</div>
      <div className="sp-driveway">◄ DRIVEWAY ►</div>
      <div className="sp-row">{stalls.slice(half).map(renderSlot)}</div>
      <div className="sp-arrow">EXIT →</div>
      <div className="sp-legend">
        <span><i className="sp-dot" style={{ backgroundColor: "#fce7f3" }} /> Available</span>
        <span><i className="sp-dot" style={{ backgroundColor: "#4b5563" }} /> Occupied</span>
        <span><i className="sp-dot" style={{ backgroundColor: "#ec4899" }} /> Selected</span>
        <span><i className="sp-dot" style={{ backgroundColor: "#db2777" }} /> Your spot</span>
      </div>
    </div>
  }

  if (!selectedLot) return <main className="sp-page"><div className="sp-card sp-center"><p className="sp-brand">SMART PARK</p><h1 className="sp-title">Location Not Found</h1><p className="sp-text">This QR code does not match a known parking location.</p><Link className="sp-btn" href="/">Go to Home</Link></div></main>

  const timerText = `${Math.max(0, Math.floor(lockSeconds / 60))}:${String(Math.max(0, lockSeconds % 60)).padStart(2, "0")}`

  return <main className="sp-page"><div className="sp-card">
    {step === "selectFloor" && <>
      <p className="sp-brand">SMART PARK</p>
      <div className="sp-location"><div className="sp-detail-label">📍 LOCATION DETECTED BY QR</div><div className="sp-location-slot" style={{ fontSize: 22 }}>{selectedLot.name}</div></div>
      <h1 className="sp-title">Select a Floor</h1><p className="sp-text">Choose the floor you want to park on.</p>
      {selectedLot.floors.map((floor) => <button key={floor.id} className="sp-option" onClick={() => { setSelectedFloorId(floor.id); setSelectedSlot(""); setStep("map") }}>{floor.name} · {floor.stalls.length} stalls</button>)}
    </>}

    {step === "map" && selectedFloor && <>
      <p className="sp-brand">SMART PARK</p><h1 className="sp-title">Select an Available Slot</h1>
      <div className="sp-status"><span><b>Available:</b> {counts.available}</span><span><b>Occupied:</b> {counts.occupied}</span><span><b>Selected:</b> {selectedSlot || "None"}</span></div>
      <ParkingMap />
      <button className="sp-btn" disabled={!selectedSlot} onClick={() => setStep("lock")}>Continue →</button>
      <button className="sp-btn sp-btn-light" onClick={() => setStep("selectFloor")}>← Back</button>
    </>}

    {step === "lock" && selectedFloor && <>
      <p className="sp-brand">SMART PARK</p><h1 className="sp-title">Stall Locked</h1>
      <p className="sp-text">Your selected stall is reserved while you confirm your parking.</p>
      <div className="sp-location"><div className="sp-detail-label">LOCKED SLOT</div><div className="sp-location-slot">{selectedSlot}</div><div className="sp-text" style={{ margin: "6px 0 0" }}>{selectedLot.name} · {selectedFloor.name}</div></div>
      <div className="sp-timer">{timerText}</div><p className="sp-text sp-center">Time remaining to complete confirmation</p>
      <button className="sp-btn" onClick={() => setStep("phone")}>Confirm This Stall →</button>
      <button className="sp-btn sp-btn-light" onClick={() => { setSelectedSlot(""); setStep("map") }}>Choose Another Stall</button>
    </>}

    {step === "phone" && selectedFloor && <>
      <p className="sp-brand">SMART PARK</p><h1 className="sp-title">Confirm Your Parking</h1>
      <div className="sp-location"><div className="sp-detail-label">SELECTED SLOT</div><div className="sp-location-slot">{selectedSlot}</div><div className="sp-text" style={{ margin: "6px 0 0" }}>{selectedLot.name} · {selectedFloor.name}</div></div>
      <label className="sp-detail-label">Mobile Number</label><div className="sp-input-row"><span className="sp-prefix">+91</span><input className="sp-input" type="tel" placeholder="Enter 10-digit number" maxLength={10} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))} /></div>
      <button className="sp-btn" disabled={mobileNumber.length !== 10} onClick={() => setStep("otp")}>Send OTP</button>
    </>}

    {step === "otp" && <>
      <p className="sp-brand">SMART PARK</p><h1 className="sp-title">Verify Your Phone Number</h1><p className="sp-text">Enter the 6-digit OTP sent to +91 {mobileNumber}. Any 6 digits work in this demo.</p>
      <input className="sp-input" type="tel" placeholder="6-digit OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
      <button className="sp-btn" onClick={confirmEntry}>Verify &amp; Generate Ticket</button>
    </>}

    {step === "ticket" && selectedFloor && <>
      <p className="sp-brand">SMART PARK</p><div className="sp-center"><span className="sp-badge">PARKING CONFIRMED</span></div>
      <div className="sp-location"><div className="sp-detail-label">YOUR PARKING LOCATION</div><div className="sp-text" style={{ margin: "6px 0 0" }}>📍 {selectedLot.name} · {selectedFloor.name}</div><div className="sp-location-slot">{selectedSlot}</div></div>
      <p className="sp-arrow">YOU ARE PARKING HERE ↓</p><ParkingMap active />
      <div className="sp-detail"><span className="sp-detail-label">Mobile</span><span className="sp-detail-value">+91 {mobileNumber}</span></div>
      <div className="sp-detail"><span className="sp-detail-label">Entry Time</span><span className="sp-detail-value">{formatTime(entryTime)} · {formatDate(entryTime)}</span></div>
      <div className="sp-detail"><span className="sp-detail-label">Status</span><span className="sp-detail-value" style={{ color: "#db2777" }}>ACTIVE</span></div>
      <Link className="sp-btn" href="/exit">I&apos;m Leaving →</Link>
    </>}
  </div></main>
}
