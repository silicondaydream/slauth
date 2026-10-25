/** The sign-in email every sender uses, unless you pass your own `message`. */
export function codeMessage({ code, appName, minutes }) {
  const subject = `${code} is your ${appName} sign-in code`
  const text = `Your ${appName} sign-in code is ${code}\n\nIt works for ${minutes} minutes. If you didn't ask for it, you can ignore this email.`
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fdf6ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2b2118">
<div style="max-width:420px;margin:0 auto;background:#fff;border:2px solid #2b2118;border-radius:16px;padding:28px">
<p style="margin:0 0 8px;font-size:15px">Your <strong>${escapeHtml(appName)}</strong> sign-in code:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:6px">${code}</p>
<p style="margin:0;font-size:13px;color:#6b5d50">It works for ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>
</div></body></html>`
  return { subject, text, html }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
