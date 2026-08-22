import { supabaseAdmin } from './supabase';

// Records one row per admin job run — powers the notification bell.
// Called from daily-post, generate-seo, and refresh-analytics after each run.
export async function insertNotification(type, status, title, summaryLines) {
  try {
    await supabaseAdmin.from('job_notifications').insert({
      type,
      status,
      title,
      summary: summaryLines || [],
    });
  } catch (err) {
    // Never let a notification failure break the actual job it's reporting on
    console.error('Failed to insert notification:', err.message);
  }
}
