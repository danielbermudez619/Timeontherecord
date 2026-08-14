// server.js
// Express server for the Zoom App:
//   - handles the OAuth "deep link" install flow (PKCE) Zoom requires
//   - hosts a small shared-state API so every participant's panel shows
//     the SAME recording timer, keyed by the meeting's UUID
//
// Env vars needed (see .env.example):
//   ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI, PORT

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const cookieSession = require('cookie-session');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  ZOOM_CLIENT_ID,
  ZOOM_CLIENT_SECRET,
  ZOOM_REDIRECT_URI, // e.g. https://your-ngrok-domain.ngrok-free.app/auth
} = process.env;

app.use(
  cookieSession({
    name: 'session',
    secret: ZOOM_CLIENT_SECRET || 'dev-secret-change-me',
    maxAge: 24 * 60 * 60 * 1000,
  })
);

app.use(express.static('public'));
app.use(express.json());

function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* ------------------------------------------------------------------ */
/* OAuth install flow                                                  */
/* ------------------------------------------------------------------ */

app.get('/', (req, res) => {
  if (!req.query.zoomAppLinking && !req.query.code) {
    return res.sendFile(__dirname + '/public/index.html');
  }

  // Zoom re-sends the deep-link launch request (with zoomAppLinking) on
  // every open, not just the first. If we already completed OAuth this
  // session, don't kick off a fresh authorize redirect (that's what was
  // opening a second popup window every time) — just serve the panel.
  if (req.session.accessToken) {
    return res.sendFile(__dirname + '/public/index.html');
  }

  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  req.session.codeVerifier = codeVerifier;

  const state = base64url(crypto.randomBytes(16));
  req.session.state = state;

  const authorizeUrl = new URL('https://zoom.us/oauth/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', ZOOM_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);

  res.redirect(authorizeUrl.toString());
});

app.get('/auth', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.status(400).send('Missing authorization code.');
  if (state !== req.session.state) {
    return res.status(400).send('State mismatch — possible CSRF, aborting.');
  }

  try {
    const tokenRes = await axios.post(
      'https://zoom.us/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ZOOM_REDIRECT_URI,
        code_verifier: req.session.codeVerifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString(
              'base64'
            ),
        },
      }
    );

    req.session.accessToken = tokenRes.data.access_token;
    req.session.refreshToken = tokenRes.data.refresh_token;

    // This window's only job was completing authorization — it isn't the
    // meeting-attached app instance, so render the app here (as before)
    // would just create the confusing floating "not attached to a
    // meeting" duplicate. Close it instead; the docked panel in the
    // meeting is a separate, already-working instance.
    res.send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Authorized</title>
      <style>
        body{background:#14181C;color:#E7ECEF;font-family:Arial,sans-serif;
             display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
        p{font-size:14px;color:#8B9AA5;}
      </style></head>
      <body>
        <p>Authorized. This window will close automatically…</p>
        <script>
          window.close();
          // Some browsers block script-initiated close on windows they
          // didn't open via script — if it's still here after a moment,
          // at least the message above tells the person it's safe to
          // close manually rather than looking broken.
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.status(500).send('OAuth token exchange failed. Check server logs.');
  }
});

/* ------------------------------------------------------------------ */
/* Shared recording-timer state, keyed by meeting UUID                 */
/*                                                                      */
/* In-memory Map for simplicity. Swap for Redis/a DB for a real deploy  */
/* (in-memory state is lost on server restart and won't work across     */
/* multiple server instances behind a load balancer).                   */
/* ------------------------------------------------------------------ */

// meetingUUID -> { status: 'stopped'|'running'|'paused',
//                  accumulatedMs: number,
//                  runStartedAt: number|null (server epoch ms),
//                  updatedAt: number }
const timers = new Map();

function getOrCreate(uuid) {
  if (!timers.has(uuid)) {
    timers.set(uuid, {
      status: 'stopped',
      accumulatedMs: 0,
      runStartedAt: null,
      updatedAt: Date.now(),
    });
  }
  return timers.get(uuid);
}

function snapshot(uuid) {
  const t = getOrCreate(uuid);
  return {
    meetingUUID: uuid,
    status: t.status,
    accumulatedMs: t.accumulatedMs,
    runStartedAt: t.runStartedAt,
    updatedAt: t.updatedAt,
    serverNow: Date.now(),
  };
}

// Apply a recording-state transition. Idempotent: re-applying the same
// action (e.g. two participants both detect "started") is a no-op after
// the first time, so it's safe for every client to report what it sees.
function applyEvent(uuid, action) {
  const t = getOrCreate(uuid);
  const now = Date.now();

  switch (action) {
    case 'started':
    case 'resumed':
      if (t.status !== 'running') {
        t.status = 'running';
        t.runStartedAt = now;
      }
      break;
    case 'paused':
      if (t.status === 'running') {
        t.accumulatedMs += now - t.runStartedAt;
        t.runStartedAt = null;
      }
      t.status = 'paused';
      break;
    case 'stopped':
      if (t.status === 'running') {
        t.accumulatedMs += now - t.runStartedAt;
        t.runStartedAt = null;
      }
      t.status = 'stopped';
      break;
    case 'reset':
      t.status = 'stopped';
      t.accumulatedMs = 0;
      t.runStartedAt = null;
      break;
    default:
      break;
  }
  t.updatedAt = now;
  return snapshot(uuid);
}

// Fetch current state (any participant, on load or on poll).
app.get('/api/timer/:uuid', (req, res) => {
  res.json(snapshot(req.params.uuid));
});

// Report a recording-status change detected by a participant's client,
// or a manual reset click. Every participant's panel calls this the
// same way; the server reconciles.
app.post('/api/timer/:uuid/event', (req, res) => {
  const { action } = req.body || {};
  const allowed = ['started', 'resumed', 'paused', 'stopped', 'reset'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: 'Invalid action: ' + action });
  }
  res.json(applyEvent(req.params.uuid, action));
});

// Optional cleanup endpoint you could call from a "meeting ended" webhook
// to free memory for meetings that will never be queried again.
app.delete('/api/timer/:uuid', (req, res) => {
  timers.delete(req.params.uuid);
  res.json({ deleted: true });
});

app.listen(PORT, () => {
  console.log(`Zoom App server running at http://localhost:${PORT}`);
  console.log('Expose it over HTTPS (e.g. `ngrok http ' + PORT + '`) for Zoom to reach it.');
});
