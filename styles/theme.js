// Two full palettes — light (default) and dark. Everything else in the app
// reads colors through the useTheme() hook (lib/ThemeContext.js) rather than
// importing this directly, so the whole UI can swap live.
export const lightColors = {
  bg: '#F7F6F3',
  sidebarBg: '#15161B',
  sidebarBgHover: '#1E2027',
  sidebarText: '#C9CBD3',
  sidebarTextDim: '#71737E',
  cardBg: '#FFFFFF',
  border: '#E7E5DF',
  text: '#1A1B1F',
  textDim: '#6B6D76',
  accent: '#E8492E',
  accentDim: '#FCE4DE',
  statusPublic: '#1F9D55',
  statusPublicBg: '#E7F7EC',
  statusPrivate: '#6B7280',
  statusPrivateBg: '#F1F1F2',
  statusScheduled: '#2563EB',
  statusScheduledBg: '#E7EEFD',
  statusDraft: '#D97706',
  statusDraftBg: '#FDF1DF',
  statusFailed: '#DC2626',
  statusFailedBg: '#FCE8E8',
};

export const darkColors = {
  bg: '#121316',
  sidebarBg: '#0E0F12',
  sidebarBgHover: '#1E2027',
  sidebarText: '#C9CBD3',
  sidebarTextDim: '#71737E',
  cardBg: '#1C1D22',
  border: '#2A2C34',
  text: '#F0EFEA',
  textDim: '#9A9CA5',
  accent: '#E8492E',
  accentDim: 'rgba(232, 73, 46, 0.18)',
  statusPublic: '#34D399',
  statusPublicBg: 'rgba(52, 211, 153, 0.15)',
  statusPrivate: '#9CA3AF',
  statusPrivateBg: 'rgba(156, 163, 175, 0.15)',
  statusScheduled: '#60A5FA',
  statusScheduledBg: 'rgba(96, 165, 250, 0.15)',
  statusDraft: '#FBBF24',
  statusDraftBg: 'rgba(251, 191, 36, 0.15)',
  statusFailed: '#F87171',
  statusFailedBg: 'rgba(248, 113, 113, 0.15)',
};

export const font = {
  display: "'Space Grotesk', sans-serif",
  body: "'Inter', sans-serif",
};

// Kept for any code that still imports the old static shape directly —
// defaults to light. Prefer useTheme() in new/updated components.
export const theme = { colors: lightColors, font };
