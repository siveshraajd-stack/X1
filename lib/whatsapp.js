// WhatsApp messages through the WhatsApp Business Cloud API (Meta).
// Optional: when it is not configured nothing is sent and the app keeps working
// (the in-app notification and the email still go out). Never throws.
//
// .env:
//   WHATSAPP_TOKEN="..."                 permanent access token
//   WHATSAPP_PHONE_NUMBER_ID="..."       sender phone number id
//   WHATSAPP_DEFAULT_COUNTRY_CODE="91"   used when a stored number has no country code
//   WHATSAPP_TEMPLATE_NAME=""            (optional) approved template with ONE body variable {{1}}.
//                                        Needed to message people who have not written to you in the last 24h.
//   WHATSAPP_TEMPLATE_LANG="en"

export function isWhatsAppConfigured() {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** "+91 98765-43210" / "9876543210" -> "919876543210". Returns null when it does not look like a phone number. */
export function normalizeWhatsAppNumber(raw) {
    // A number that starts with the country code never starts with 0, so leading zeros (0, 00) are dialling prefixes
    const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return null;
    const cc = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    const full = digits.length === 10 ? cc + digits : digits;
    return full.length >= 11 && full.length <= 15 ? full : null;
}

export async function sendWhatsApp({ to, text }) {
    const number = normalizeWhatsAppNumber(to);
    if (!number) return { sent: false, reason: 'No valid phone number' };
    if (!isWhatsAppConfigured()) {
        console.log(`[whatsapp not sent - not configured] to=${number}`);
        return { sent: false, reason: 'WhatsApp is not configured' };
    }
    const body = String(text ?? '').replace(/\s*\n\s*/g, ' | ').slice(0, 1000); // template variables cannot hold new lines
    const template = process.env.WHATSAPP_TEMPLATE_NAME;
    const payload = template
        ? {
              messaging_product: 'whatsapp',
              to: number,
              type: 'template',
              template: {
                  name: template,
                  language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
                  components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
              },
          }
        : { messaging_product: 'whatsapp', to: number, type: 'text', text: { body: String(text ?? '').slice(0, 4000) } };
    try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            console.error('WhatsApp send failed:', res.status, err.slice(0, 300));
            return { sent: false, reason: `WhatsApp API ${res.status}` };
        }
        return { sent: true };
    } catch (error) {
        console.error('WhatsApp send failed:', error.message);
        return { sent: false, reason: error.message };
    }
}
