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
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
    // Render's network can't route to Gmail's IPv6 address, and without
    // forcing IPv4 the connection attempt hangs for a long time before
    // failing — that hang was blocking the whole daily-post request from
    // ever responding, making video posts look "stuck" even after they'd
    // actually already succeeded.
    family: 4,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
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
