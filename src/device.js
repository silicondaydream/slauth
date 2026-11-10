/**
 * "Chrome on macOS" from a user agent, roughly. Shared by <slauth-account>'s device list
 * and the new-sign-in emails, so both name a device the same way. Coarse on purpose:
 * browser and OS families, never versions or anything finer.
 * @param {string | null | undefined} ua
 */
export function device(ua) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}
