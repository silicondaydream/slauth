import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { qrMatrix, qrSvg } from './qr.js'

/** Paints the matrix (with its quiet zone) as RGBA pixels and reads it back with jsQR. */
function scan(text) {
  const dark = qrMatrix(text)
  const scale = 4
  const size = (dark.length + 8) * scale
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < dark.length; y++) {
    for (let x = 0; x < dark.length; x++) {
      if (!dark[y][x]) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
        }
      }
    }
  }
  return { result: jsQR(pixels, size, size), version: (dark.length - 17) / 4 }
}

describe('QR codes', () => {
  it('encodes an otpauth link that a scanner reads back', () => {
    const uri = 'otpauth://totp/Test%20App:me%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Test%20App&algorithm=SHA1&digits=6&period=30'
    const { result } = scan(uri)
    expect(result?.data).toBe(uri)
  })

  it('reads back at every size, including the ones with version blocks', () => {
    const versions = new Set()
    for (const length of [1, 14, 20, 60, 100, 154, 250, 400, 700, 1000]) {
      const text = Array.from({ length }, (_, i) => 'abcXYZ019:/?&=%'[i % 15]).join('')
      const { result, version } = scan(text)
      versions.add(version)
      expect(result?.data, `length ${length}, version ${version}`).toBe(text)
    }
    expect([...versions].some((v) => v >= 7)).toBe(true)
  })

  it('handles UTF-8', () => {
    expect(scan('Sloth café 🦥').result?.data).toBe('Sloth café 🦥')
  })

  it('refuses text too long for any QR code', () => {
    expect(() => qrMatrix('x'.repeat(3000))).toThrow()
  })

  it('makes an SVG with a quiet zone and an escaped label', () => {
    const svg = qrSvg('hello', { label: 'Scan "me" <now>' })
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 29 29"/)
    expect(svg).toContain('aria-label="Scan &quot;me&quot; &lt;now&gt;"')
  })
})
