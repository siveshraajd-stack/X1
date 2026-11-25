import nodemailer from 'nodemailer';

let transporter = null;

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function isMailConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function appBaseUrl() {
    const raw = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return raw.replace(/\/+$/, '');
}

function getTransporter() {
    if (transporter) return transporter;
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
}

/**
 * Send an email on behalf of a person (e.g. an employee asking their manager).
 *
 * Most SMTP providers (Gmail, Outlook, SES...) refuse to send as an address
 * you do not own, so by default the message is sent from the company mailbox
 * with the person's name as display name and their address as Reply-To.
 * Set MAIL_SEND_AS_SENDER=true if your provider lets you send as anyone.
 *
 * Never throws: a failed email must not break the request that triggered it.
 */
export async function sendMail({ to, subject, html, text, fromName, senderEmail, replyTo }) {
    const mailbox = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const displayName = String(fromName || 'Keystone').replace(/["\r\n<>]/g, '');
    const useSender = process.env.MAIL_SEND_AS_SENDER === 'true' && senderEmail;
    const from = `"${displayName}${useSender ? '' : ' (via Keystone)'}" <${useSender ? senderEmail : mailbox}>`;

    if (!isMailConfigured()) {
        console.log(`[mail not sent - SMTP not configured] to=${to} subject="${subject}"`);
        return { sent: false, reason: 'SMTP is not configured' };
    }

    try {
        await getTransporter().sendMail({
            from,
            replyTo: replyTo || senderEmail || undefined,
            to,
            subject,
            text,
            html,
        });
        return { sent: true };
    } catch (error) {
        console.error('Email send failed:', error.message);
        return { sent: false, reason: error.message };
    }
}
