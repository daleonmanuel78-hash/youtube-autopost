import { getChannelsWithCounts } from '../lib/channelsWithCounts';
import AppShell from '../components/AppShell';
import { theme } from '../styles/theme';

export async function getServerSideProps() {
  const channels = await getChannelsWithCounts();
  return { props: { channels } };
}

export default function Home({ channels }) {
  const c = theme.colors;
  return (
    <AppShell channels={channels}>
      <div style={{ maxWidth: 640, margin: '120px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontFamily: theme.font.display, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {channels.length === 0 ? 'No channels connected yet' : 'Pick a channel from the sidebar'}
        </div>
        <div style={{ color: c.textDim, fontSize: 14 }}>
          {channels.length === 0
            ? 'Click "+ Add channel" in the sidebar to connect your first YouTube channel.'
            : 'Each channel has its own dashboard — videos, status, and analytics.'}
        </div>
      </div>
    </AppShell>
  );
}
