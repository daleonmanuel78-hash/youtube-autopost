// Sends notification emails via Resend's HTTPS API instead of SMTP.
// Render's free tier blocks outbound SMTP ports (25, 465, 587) entirely —
// that's a hard platform policy, not something fixable with connection
// settings. Resend works over plain HTTPS, so this sidesteps the block
// completely instead of fighting it.
export async function sendNotificationEmail(subject, bodyLines) {
  if (!process.env.RESEND_API_KEY) {
    console.log('Email notifications not configured (RESEND_API_KEY missing) — skipping.');
    return;
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
        subject,
        text: bodyLines.join('\n'),
      }),
    });
    if (!resp.ok) {
      console.error('Failed to send notification email:', await resp.text());
    }
  } catch (err) {
    // Never let a failed notification email break the actual posting job
    console.error('Failed to send notification email:', err.message);
  }
}
