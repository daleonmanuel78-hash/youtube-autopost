// Simple shared-secret check for admin actions (posting, SEO generation, etc).
// Not full user authentication — just enough to stop a random visitor who
// finds your Render URL from triggering real YouTube uploads.
export function checkAdminAuth(req) {
  const provided = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;
  return expected && provided === expected;
}
