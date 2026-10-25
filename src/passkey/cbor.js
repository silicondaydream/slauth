/**
 * Just enough CBOR (RFC 8949) to read what authenticators send: integers, byte and
 * text strings, arrays, maps, booleans, null and floats. Definite lengths only, which
 * is all WebAuthn uses.
 */

/**
 * Decodes one item from `bytes` starting at `offset`.
 * @param {Uint8Array} bytes
 * @returns {{ value: any, offset: number }}  the item and where the next one starts
 */
export function decodeCbor(bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = offset

  const need = (n) => {
    if (at + n > bytes.length) throw new Error('CBOR: ran out of bytes.')
  }

  const length = (info) => {
    if (info < 24) return info
    if (info === 24) return need(1), view.getUint8(at++)
    if (info === 25) return need(2), (at += 2), view.getUint16(at - 2)
    if (info === 26) return need(4), (at += 4), view.getUint32(at - 4)
    if (info === 27) {
      need(8)
      const big = view.getBigUint64(at)
      at += 8
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR: number too large.')
      return Number(big)
    }
    throw new Error('CBOR: indefinite lengths are not supported.')
  }

  const item = (depth) => {
    if (depth > 16) throw new Error('CBOR: nested too deeply.')
    need(1)
    const first = view.getUint8(at++)
    const major = first >> 5
    const info = first & 31
    switch (major) {
      case 0:
        return length(info)
      case 1:
        return -1 - length(info)
      case 2: {
        const n = length(info)
        need(n)
        at += n
        return bytes.slice(at - n, at)
      }
      case 3: {
        const n = length(info)
        need(n)
        at += n
        return new TextDecoder().decode(bytes.subarray(at - n, at))
      }
      case 4: {
        const n = length(info)
        const out = []
        for (let i = 0; i < n; i++) out.push(item(depth + 1))
        return out
      }
      case 5: {
        const n = length(info)
        const out = new Map()
        for (let i = 0; i < n; i++) {
          const key = item(depth + 1)
          out.set(key, item(depth + 1))
        }
        return out
      }
      case 6:
        // A tag: skip it and read what it wraps.
        length(info)
        return item(depth + 1)
      case 7:
        if (info === 20) return false
        if (info === 21) return true
        if (info === 22 || info === 23) return null
        if (info === 25) return need(2), (at += 2), halfFloat(view.getUint16(at - 2))
        if (info === 26) return need(4), (at += 4), view.getFloat32(at - 4)
        if (info === 27) return need(8), (at += 8), view.getFloat64(at - 8)
        throw new Error('CBOR: unsupported simple value.')
    }
  }

  const value = item(0)
  return { value, offset: at }
}

function halfFloat(bits) {
  const exp = (bits >> 10) & 0x1f
  const frac = bits & 0x3ff
  const sign = bits & 0x8000 ? -1 : 1
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024)
  if (exp === 31) return frac ? NaN : sign * Infinity
  return sign * 2 ** (exp - 15) * (1 + frac / 1024)
}
