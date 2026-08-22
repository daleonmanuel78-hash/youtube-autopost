import nodemailer from 'nodemailer';

// Sends a plain-text status email after each daily-post run (scheduled or
// manual) so you can monitor Live Mode without checking the dashboard.
// Uses Gmail's SMTP with an App Password — not your real Google password.
export async function sendNotificationEmail(subject, bodyLines) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.log('Email notifications not configured (EMAIL_USER/EMAIL_APP_PASSWORD missing) — skipping.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const to = process.env.NOTIFY_EMAIL || 'dudasmanuel78@gmail.com';

  try {
    await transporter.sendMail({
      from: `YT AutoPosting System <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: bodyLines.join('\n'),
    });
  } catch (err) {
    // Never let a failed notification email break the actual posting job
    console.error('Failed to send notification email:', err.message);
  }
}
