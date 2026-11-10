/**
 * A small QR code encoder for the two-factor setup screen: byte mode, error correction
 * level M, the best of the eight masks. <slauth-account> imports it only when someone
 * sets up two-factor, so nobody else downloads it. Follows ISO/IEC 18004; the layout
 * helpers mirror Project Nayuki's reference implementation (MIT).
 */

// Error correction codewords per block, and the number of blocks, at level M (by version).
const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

const bit = (value, i) => ((value >>> i) & 1) !== 0

/** Modules left for data and error correction once the fixed patterns are drawn. */
function rawModules(version) {
  let n = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (version >= 7) n -= 36
  }
  return n
}
const dataCodewords = (version) => Math.floor(rawModules(version) / 8) - ECC[version] * BLOCKS[version]

/* ---------- Reed-Solomon over GF(2^8), polynomial 0x11d ---------- */

function multiply(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function divisor(degree) {
  const result = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = multiply(root, 0x02)
  }
  return result
}

function remainder(data, div) {
  const result = div.map(() => 0)
  for (const byte of data) {
    const factor = byte ^ result.shift()
    result.push(0)
    div.forEach((coef, i) => (result[i] ^= multiply(coef, factor)))
  }
  return result
}

/** Splits the data into blocks, adds each block's error correction, and interleaves them. */
function interleave(data, version) {
  const count = BLOCKS[version]
  const ecc = ECC[version]
  const raw = Math.floor(rawModules(version) / 8)
  const short = count - (raw % count)
  const shortLength = Math.floor(raw / count)
  const div = divisor(ecc)
  const blocks = []
  for (let i = 0, k = 0; i < count; i++) {
    const block = data.slice(k, k + shortLength - ecc + (i < short ? 0 : 1))
    k += block.length
    const check = remainder(block, div)
    if (i < short) block.push(0)
    blocks.push(block.concat(check))
  }
  const out = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLength - ecc || j >= short) out.push(block[i])
    })
  }
  return out
}

/* ---------- the matrix ---------- */

/**
 * The QR code for `text` as rows of booleans (true = dark), without the quiet zone.
 * @param {string} text
 * @returns {boolean[][]}
 */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text)
  let version = 1
  while (4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) {
    if (++version > 40) throw new Error('Too long for a QR code.')
  }

  // Byte mode, the length, the bytes, a terminator, then padding.
  const bits = []
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const capacity = dataCodewords(version) * 8
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  const codewords = interleave(data, version)

  const size = version * 4 + 17
  const dark = Array.from({ length: size }, () => new Array(size).fill(false))
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x, y, on) => {
    dark[y][x] = on
    fixed[y][x] = true
  }

  // Timing patterns, finders, alignment patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
      }
    }
  }
  const align = alignment(version, size)
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)
      if (corner) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
  const format = (mask) => {
    // Level M is 0b00.
    const value = mask
    let rem = value
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const f = ((value << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) set(8, i, bit(f, i))
    set(8, 7, bit(f, 6))
    set(8, 8, bit(f, 7))
    set(7, 8, bit(f, 8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i))
    set(8, size - 8, true)
  }
  format(0)
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const v = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit(v, i))
      set(b, a, bit(v, i))
    }
  }

  // The codewords, in the zigzag order, two columns at a time.
  let n = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
        if (!fixed[y][x] && n < codewords.length * 8) {
          dark[y][x] = bit(codewords[n >>> 3], 7 - (n & 7))
          n++
        }
      }
    }
  }

  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[m](x, y)) dark[y][x] = !dark[y][x]
  }
  let best = 0
  let lowest = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m)
    format(m)
    const score = penalty(dark)
    if (score < lowest) [best, lowest] = [m, score]
    applyMask(m)
  }
  applyMask(best)
  format(best)
  return dark
}

function alignment(version, size) {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos)
  return out
}

/** The spec's four penalty rules, so the chosen mask is easy to scan. */
function penalty(dark) {
  const size = dark.length
  const lines = []
  for (let i = 0; i < size; i++) {
    lines.push(dark[i].map(Number).join(''))
    lines.push(dark.map((row) => Number(row[i])).join(''))
  }
  let score = 0
  for (const line of lines) {
    for (const run of line.match(/0{5,}|1{5,}/g) ?? []) score += run.length - 2
    score += 40 * ((line.match(/(?=10111010000|00001011101)/g) ?? []).length)
  }
  let total = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (dark[y][x]) total++
      if (x < size - 1 && y < size - 1 && dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) score += 3
    }
  }
  return score + Math.floor(Math.abs(total * 20 - size * size * 10) / (size * size)) * 10
}

/**
 * The QR code as an SVG string: black on white with the 4-module quiet zone, whatever
 * the page's theme (inverted codes trip up some scanners).
 * @param {string} text
 * @param {{ label?: string }} [options]
 */
export function qrSvg(text, { label = 'QR code' } = {}) {
  const dark = qrMatrix(text)
  const size = dark.length + 8
  let path = ''
  dark.forEach((row, y) => row.forEach((on, x) => on && (path += `M${x + 4} ${y + 4}h1v1h-1z`)))
  const safe = label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}
