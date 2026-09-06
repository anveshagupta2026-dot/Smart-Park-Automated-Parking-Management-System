"use client"

import Link from "next/link"
import { QrDisplay } from "@/components/qr-display"
import { LOTS, INITIAL_OCCUPIED, slotKey } from "@/lib/parking-data"

export default function Home() {
  let total = 0, occupied = 0
  LOTS.forEach((lot) => lot.floors.forEach((floor) => floor.stalls.forEach((stall) => {
    total++
    if ((INITIAL_OCCUPIED as Record<string, boolean>)[slotKey(lot.id, floor.id, stall)]) occupied++
  })))
  return <main className="sp-page"><div className="sp-card">
    <p className="sp-brand">SMART PARK</p>
    <p className="sp-subtitle">Campus Parking · Live Prototype</p>
    <h1 className="sp-title">Find an available parking spot.</h1>
    <p className="sp-text">Scan the QR at the correct parking entrance. The QR automatically opens the correct location — users never choose SJT or Main Campus manually.</p>
    <div className="sp-stats"><div className="sp-stat"><div className="sp-stat-number">{total - occupied}</div><div className="sp-stat-label">Available</div></div><div className="sp-stat"><div className="sp-stat-number">{occupied}</div><div className="sp-stat-label">Occupied</div></div><div className="sp-stat"><div className="sp-stat-number">{total}</div><div className="sp-stat-label">Total</div></div></div>
    <div className="sp-home-note">QR display area — replace the placeholder images in <b>/public</b> with your own generated QR codes.</div>
    <div className="sp-qr-grid">
      {LOTS.map((lot) => <div key={lot.id} className="sp-qr-wrap"><QrDisplay imageSrc={lot.qr} label={lot.name.toUpperCase()} caption={`QR route: /entry/${lot.slug}`} /><Link className="sp-btn" href={`/entry/${lot.slug}`}>Open {lot.name} Demo →</Link></div>)}
    </div>
    <Link className="sp-btn sp-btn-light" href="/exit">Exit Parking →</Link>
  </div></main>
}
