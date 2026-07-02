// Email sending utility.
//
// In dev/test (or whenever SMTP is not configured) messages are logged to
// stdout so tokens/links are visible without an SMTP server. When SMTP_* is
// configured the message is delivered via nodemailer over SMTP — this works
// with any provider (Resend, SendGrid, Mailgun, Gmail app-password, etc.).

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';

// A single lazily-created transport is reused across sends. It is only built
// when SMTP is configured; otherwise emails fall back to the stdout stub.
let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE, // true for 465, false for 587/STARTTLS
      ...(config.SMTP_USER && {
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      }),
    });
  }
  return transporter;
}

interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Compact key/value summary printed by the stdout stub. */
  stubTitle: string;
  stubLines: string[];
}

async function deliver(msg: Message): Promise<void> {
  const transport = getTransport();

  if (!transport) {
    // No SMTP configured (dev/test): log the message so links/tokens are visible.
    // eslint-disable-next-line no-console
    console.info(
      [
        '',
        `┌─ [EMAIL STUB] ${msg.stubTitle} ${'─'.repeat(Math.max(0, 40 - msg.stubTitle.length))}`,
        `│ To:      ${msg.to}`,
        ...msg.stubLines.map((l) => `│ ${l}`),
        '└─────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return;
  }

  await transport.sendMail({
    from: config.MAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

// Minimal, provider-agnostic HTML wrapper for a call-to-action email.
function layout(opts: { heading: string; body: string; buttonLabel: string; url: string; footer?: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td style="font-size:18px;font-weight:600;color:#111827;padding-bottom:12px;">${opts.heading}</td></tr>
          <tr><td style="font-size:14px;line-height:22px;color:#374151;padding-bottom:24px;">${opts.body}</td></tr>
          <tr><td>
            <a href="${opts.url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">${opts.buttonLabel}</a>
          </td></tr>
          <tr><td style="font-size:12px;color:#9ca3af;padding-top:24px;word-break:break-all;">Or open this link:<br/>${opts.url}</td></tr>
          ${opts.footer ? `<tr><td style="font-size:12px;color:#9ca3af;padding-top:16px;">${opts.footer}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// ─── Workspace invite ─────────────────────────────────────────────────────────

export interface InviteEmailPayload {
  to: string;
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date;
}

export async function sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
  const subject = `${payload.inviterName} invited you to ${payload.workspaceName}`;
  await deliver({
    to: payload.to,
    subject,
    text: `${payload.inviterName} invited you to join "${payload.workspaceName}".\n\nAccept: ${payload.inviteUrl}\n\nThis invite expires ${payload.expiresAt.toISOString()}.`,
    html: layout({
      heading: `Join ${payload.workspaceName}`,
      body: `<strong>${payload.inviterName}</strong> invited you to join the workspace <strong>${payload.workspaceName}</strong>.`,
      buttonLabel: 'Accept invite',
      url: payload.inviteUrl,
      footer: `This invite expires on ${payload.expiresAt.toUTCString()}.`,
    }),
    stubTitle: 'Workspace Invite',
    stubLines: [
      `Workspace:  ${payload.workspaceName}`,
      `Invited by: ${payload.inviterName}`,
      `Accept URL: ${payload.inviteUrl}`,
      `Expires:    ${payload.expiresAt.toISOString()}`,
    ],
  });
}

// ─── Chat request ───────────────────────────────────────────────────────────

export interface ChatRequestEmailPayload {
  to: string;
  workspaceName: string;
  requesterName: string;
  chatUrl: string;
  preview?: string;
}

export async function sendChatRequestEmail(payload: ChatRequestEmailPayload): Promise<void> {
  const subject = `${payload.requesterName} wants to chat with you`;
  await deliver({
    to: payload.to,
    subject,
    text: `${payload.requesterName} started a chat with you in "${payload.workspaceName}".${payload.preview ? `\n\n"${payload.preview}"` : ''}\n\nOpen: ${payload.chatUrl}`,
    html: layout({
      heading: `New chat request`,
      body: `<strong>${payload.requesterName}</strong> wants to chat with you in <strong>${payload.workspaceName}</strong>.${payload.preview ? `<br/><br/><em>"${payload.preview}"</em>` : ''}`,
      buttonLabel: 'Open chat',
      url: payload.chatUrl,
    }),
    stubTitle: 'Chat Request',
    stubLines: [
      `Workspace: ${payload.workspaceName}`,
      `From:      ${payload.requesterName}`,
      `Open chat: ${payload.chatUrl}`,
      ...(payload.preview ? [`Message:   ${payload.preview}`] : []),
    ],
  });
}
