import Link from 'next/link';
import { supabaseAdmin } from '../lib/supabase';

export async function getServerSideProps() {
  const { data: channels, error } = await supabaseAdmin
    .from('channels')
    .select('id, name, youtube_channel_id, thumbnail_url')
    .order('created_at', { ascending: false });

  return { props: { channels: channels || [], error: error?.message || null } };
}

export default function Home({ channels, error }) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 40, maxWidth: 720, margin: '0 auto' }}>
      <h1>Connected YouTube channels</h1>

      {error && <p style={{ color: 'red' }}>Error loading channels: {error}</p>}

      {channels.length === 0 && <p>No channels connected yet.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {channels.map((c) => (
          <li key={c.id} style={{ marginBottom: 8 }}>
            <Link
              href={`/channels/${c.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                border: '1px solid #ddd',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {c.thumbnail_url && (
                <img src={c.thumbnail_url} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{c.youtube_channel_id}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <a
        href="/api/auth/connect"
        style={{
          display: 'inline-block',
          marginTop: 16,
          padding: '10px 20px',
          background: '#111',
          color: '#fff',
          borderRadius: 6,
          textDecoration: 'none',
        }}
      >
        + Add channel
      </a>
    </div>
  );
}
