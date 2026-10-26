import type { EmailSender } from '../index.js'
export function consoleEmail(): EmailSender
export function resend(options: { apiKey: string; from: string; fetch?: typeof fetch }): EmailSender
export function cloudflareEmail(binding: { send(message: { to: string; from: string; subject: string; text: string; html: string }): Promise<unknown> }, options: { from: string }): EmailSender
