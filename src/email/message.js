import { escapeHtml } from '../util.js'

/**
 * The emails slauth sends, unless you pass your own `emails` function in the config.
 *
 *   sign-in       a 6-digit code (and a link, with magicLinks on)
 *   email-change  a code to confirm a new address
 *   invite        an invitation to join an organization
 *   new-sign-in   a sign-in from a browser the account hasn't used (newSignInEmails)
 */
export function defaultMessage(kind, { code, link, appName, minutes, orgName, inviter, device, when }) {
  if (kind === 'new-sign-in') {
    return box({
      subject: `New sign-in to ${appName} from ${device}`,
      lines: [`Your <strong>${escapeHtml(appName)}</strong> account was just signed in to from <strong>${escapeHtml(device)}</strong> (${escapeHtml(when)}).`, 'If that was you, there\'s nothing to do.'],
      textLines: [`Your ${appName} account was just signed in to from ${device} (${when}).`, "If that was you, there's nothing to do."],
      link,
      linkLabel: 'See your signed-in devices',
      footer: "If it wasn't you, sign in, end that session from your account page, and turn on two-factor sign-in or a passkey.",
    })
  }
  if (kind === 'email-change') {
    return box({
      subject: `${code} is your code to confirm this email for ${appName}`,
      lines: [`Enter this code in ${escapeHtml(appName)} to use this address from now on:`],
      textLines: [`Enter this code in ${appName} to use this address from now on:`],
      code,
      footer: `It works for ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
    })
  }
  if (kind === 'invite') {
    return box({
      subject: `${inviter ? `${inviter} invited you` : "You're invited"} to join ${orgName} on ${appName}`,
      lines: [`${inviter ? `${escapeHtml(inviter)} invited you` : "You're invited"} to join <strong>${escapeHtml(orgName)}</strong> on ${escapeHtml(appName)}.`],
      textLines: [`${inviter ? `${inviter} invited you` : "You're invited"} to join ${orgName} on ${appName}.`],
      link,
      linkLabel: 'Accept the invitation',
      footer: `Sign in with this email address to accept. The invitation lasts 7 days.`,
    })
  }
  return box({
    subject: `${code} is your ${appName} sign-in code`,
    lines: [`Your <strong>${escapeHtml(appName)}</strong> sign-in code:`],
    textLines: [`Your ${appName} sign-in code is ${code}`],
    code,
    link,
    linkLabel: `Sign in to ${appName}`,
    footer: `It works for ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
  })
}

/** The sign-in email, as slauth 1.0 exported it. */
export function codeMessage({ code, appName, minutes }) {
  return defaultMessage('sign-in', { code, appName, minutes })
}

function box({ subject, lines, textLines = lines, code, link, linkLabel, footer }) {
  const text = [...textLines, code ? `\n${code}` : '', link ? `\n${linkLabel}: ${link}` : '', `\n${footer}`].filter(Boolean).join('\n')
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fdf6ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2b2118">
<div style="max-width:420px;margin:0 auto;background:#fff;border:2px solid #2b2118;border-radius:16px;padding:28px">
${lines.map((l) => `<p style="margin:0 0 8px;font-size:15px">${l}</p>`).join('\n')}
${code ? `<p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:6px">${escapeHtml(code)}</p>` : ''}
${link ? `<p style="margin:8px 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#f59e0b;color:#2b2118;border:2px solid #2b2118;border-radius:10px;padding:10px 16px;font-weight:700;text-decoration:none">${escapeHtml(linkLabel)}</a></p>` : ''}
<p style="margin:0;font-size:13px;color:#6b5d50">${escapeHtml(footer)}</p>
</div></body></html>`
  return { subject, text, html }
}
