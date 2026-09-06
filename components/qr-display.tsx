"use client"

// ==========================================================
// QrDisplay - a reusable box to SHOW a QR code image.
// There is NO camera here. This is just a place to display
// (or later swap in) your own printed QR code image.
//
// To use your own QR code, drop an image into /public and
// pass its path as `imageSrc`, e.g. imageSrc="/entry-qr.png".
// If the image is missing, a "[ QR CODE IMAGE HERE ]"
// placeholder is shown instead, so it is easy to replace.
// ==========================================================

import { useState } from "react"

export function QrDisplay({
  imageSrc,
  label = "SCAN TO ENTER",
  caption = "Scan this QR code to open Smart Park",
}) {
  const [failed, setFailed] = useState(false)
  const showImage = imageSrc && !failed

  return (
    <div className="sp-qr">
      <div className="sp-qr-label">{label}</div>

      <div className="sp-qr-box">
        {showImage ? (
          // Real QR image (replace the file in /public to change it)
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sp-qr-img" src={imageSrc || "/placeholder.svg"} alt={label} onError={() => setFailed(true)} />
        ) : (
          // Fallback placeholder shown until a real image exists
          <div className="sp-qr-placeholder">[ QR CODE IMAGE HERE ]</div>
        )}
      </div>

      <div className="sp-qr-caption">{caption}</div>
    </div>
  )
}
