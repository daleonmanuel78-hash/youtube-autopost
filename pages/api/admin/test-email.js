import { checkAdminAuth } from '../../../lib/adminAuth';

// Standalone diagnostic — sends a test email via Resend and reports the
// EXACT result directly in the response, no log-digging required.
export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({
      success: false,
      reason: 'RESEND_API_KEY is not set on this server.',
      notifyEmailSet: !!process.env.NOTIFY_EMAIL,
    });
  }

  const to = process.env.NOTIFY_EMAIL || 'dudasmanuel78@gmail.com';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'YT AutoPosting System <onboarding@resend.dev>',
        to: [to],
        subject: 'YT AutoPosting: test email',
        text: 'If you received this, email notifications are working correctly.',
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(200).json({ success: false, errorMessage: data.message || JSON.stringify(data), sentTo: to });
    }
    return res.status(200).json({ success: true, messageId: data.id, sentTo: to });
  } catch (err) {
    return res.status(200).json({ success: false, errorMessage: err.message, sentTo: to });
  }
}
