// Talks to GitHub's API to enable/disable the scheduled workflows — this is
// what the Live Mode toggle in the Admin Panel controls. Requires a GitHub
// Personal Access Token with 'repo' and 'workflow' scopes.

const OWNER = process.env.GITHUB_OWNER || 'daleonmanuel78-hash';
const REPO = process.env.GITHUB_REPO || 'youtube-autopost';

// All three run together under Live Mode — posting, SEO generation, and
// analytics refresh are treated as one pipeline, not controlled separately.
const WORKFLOW_FILES = ['daily-post.yml', 'generate-seo.yml', 'refresh-analytics.yml'];

// Environment variables pasted into a dashboard UI (Render, etc.) sometimes
// pick up stray surrounding quotes or whitespace from copy-paste — this has
// bitten several credentials in this project already. Stripping defensively
// here means a slightly messy stored value still works correctly, instead
// of producing a confusing "Bad credentials" error that looks like the
// token itself is wrong when it's actually just wrapped in extra characters.
function cleanToken(raw) {
  return (raw || '').trim().replace(/^["']+|["']+$/g, '');
}

function headers() {
  return {
    Authorization: `Bearer ${cleanToken(process.env.GITHUB_TOKEN)}`,
    Accept: 'application/vnd.github+json',
  };
}

// Uses daily-post.yml as the representative status for the toggle's
// displayed ON/OFF state — in practice all three are always kept in sync
// with each other since setWorkflowEnabled always changes all of them together.
export async function getWorkflowState() {
  const resp = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILES[0]}`,
    { headers: headers() }
  );
  if (!resp.ok) throw new Error(`GitHub API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.state; // 'active' | 'disabled_manually' | etc.
}

export async function setWorkflowEnabled(enabled) {
  const action = enabled ? 'enable' : 'disable';
  for (const file of WORKFLOW_FILES) {
    const resp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${file}/${action}`,
      { method: 'PUT', headers: headers() }
    );
    if (!resp.ok) throw new Error(`GitHub API error ${resp.status} on ${file}: ${await resp.text()}`);
  }
}
