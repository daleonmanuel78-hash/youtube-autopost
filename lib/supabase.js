// Server-side only. Never import this into a component that runs in the browser —
// it uses the secret key, which must never reach client-side JS.
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { realtime: { transport: ws } }
);
