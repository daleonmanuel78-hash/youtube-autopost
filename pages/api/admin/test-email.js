import { checkAdminAuth } from '../../../lib/adminAuth';
import nodemailer from 'nodemailer';

// Standalone diagnostic — sends a test email and reports the EXACT result
// (success or the real error) directly in the response, so we don't have to
// dig through Render's log viewer to see what's actually happening.
export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return res.status(200).json({
      success: false,
      reason: 'EMAIL_USER or EMAIL_APP_PASSWORD is not set on this server.',
      emailUserSet: !!process.env.EMAIL_USER,
      emailPasswordSet: !!process.env.EMAIL_APP_PASSWORD,
      notifyEmailSet: !!process.env.NOTIFY_EMAIL,
    });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
    family: 4,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });

  const to = process.env.NOTIFY_EMAIL || 'dudasmanuel78@gmail.com';

  try {
    const info = await transporter.sendMail({
      from: `YT AutoPosting System <${process.env.EMAIL_USER}>`,
      to,
      subject: 'YT AutoPosting: test email',
      text: 'If you received this, email notifications are working correctly.',
    });
    return res.status(200).json({ success: true, messageId: info.messageId, sentTo: to });
  } catch (err) {
    return res.status(200).json({
      success: false,
      errorMessage: err.message,
      errorCode: err.code || null,
      sentFrom: process.env.EMAIL_USER,
      sentTo: to,
    });
  }
}
