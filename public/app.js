(function () {
  const els = {
    dot: document.getElementById('dot'),
    status: document.getElementById('statusText'),
    elapsed: document.getElementById('elapsed'),
    meta: document.getElementById('meta'),
    resetBtn: document.getElementById('resetBtn'),
    markerInput: document.getElementById('markerInput'),
    markerBtn: document.getElementById('markerBtn'),
    log: document.getElementById('log'),
    notice: document.getElementById('notice'),
    mainUi: document.getElementById('mainUi'),
    notInMeeting: document.getElementById('notInMeeting'),
    contextDebug: document.getElementById('contextDebug'),
  };

  function showNotInMeetingScreen(runningContext){
    els.mainUi.classList.add('hidden');
    els.notInMeeting.classList.add('show');
    els.status.textContent = 'Not attached to a meeting';
    els.contextDebug.textContent = runningContext ? ('Reported context: "' + runningContext + '"') : '';
  }

  /* ---------------- local render state, driven by server snapshots --- */
  let state = { status: 'stopped', accumulatedMs: 0, runStartedAt: null, serverNow: Date.now() };
  let clockOffset = 0;
  const markers = [];
  let meetingUUID = null;
  let lastReportedAction = null;

  function fmt(ms){
    const s = Math.floor(Math.max(0, ms)/1000);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    const p = n => String(n).padStart(2,'0');
    return { main: p(h), sub: p(m)+':'+p(sec) };
  }
  function currentElapsed(){
    if (state.status === 'running' && state.runStartedAt) {
      const serverNowEstimate = Date.now() + clockOffset;
      return state.accumulatedMs + (serverNowEstimate - state.runStartedAt);
    }
    return state.accumulatedMs;
  }
  function render(){
    const { main, sub } = fmt(currentElapsed());
    els.elapsed.innerHTML = main + '<span class="sub">:'+sub+'</span>';
    const isLive = state.status === 'running';
    els.dot.classList.toggle('live', isLive);
    // Only overwrite the status line with recording state once we're
    // actually wired up to a meeting — otherwise leave whatever
    // connection-status message init() has set.
    if (meetingUUID) {
      els.status.textContent = isLive ? 'Recording' : (state.status === 'paused' ? 'Recording paused' : 'Not recording');
    }
    els.markerInput.disabled = !isLive;
    els.markerBtn.disabled = !isLive;
  }
  function renderLog(){
    if(!markers.length){ els.log.innerHTML = '<div class="log-empty">No markers logged yet.</div>'; return; }
    // Build with textContent, not innerHTML — the label is free text the
    // user typed, so string-concatenating it into HTML would allow script
    // injection.
    els.log.replaceChildren(...markers.map((m,i)=>{
      const t = fmt(m.ms);
      const row = document.createElement('div');
      row.className = 'log-row';
      for (const [cls, text] of [['idx', String(i+1).padStart(2,'0')], ['', m.label||'Marker'], ['time', t.main+':'+t.sub]]) {
        const span = document.createElement('span');
        if (cls) span.className = cls;
        span.textContent = text;
        row.appendChild(span);
      }
      return row;
    }));
  }
  function applySnapshot(snap){
    state = snap;
    clockOffset = snap.serverNow - Date.now();
    render();
  }

  // ---- Buttons and the render loop are ALWAYS wired up, regardless of
  // whether the Zoom SDK connects successfully. This is what was broken
  // before: early exits in the Zoom-wiring logic were skipping these. ----
  els.resetBtn.addEventListener('click', () => reportEvent('reset'));
  function logMarker(){
    if (state.status !== 'running') return;
    markers.push({ label: els.markerInput.value.trim(), ms: currentElapsed() });
    els.markerInput.value = ''; renderLog();
  }
  els.markerBtn.addEventListener('click', logMarker);
  els.markerInput.addEventListener('keydown', e => { if(e.key==='Enter') logMarker(); });

  function tick(){ render(); requestAnimationFrame(tick); }
  render(); renderLog(); tick();

  async function reportEvent(action){
    if (!meetingUUID || action === lastReportedAction) return;
    lastReportedAction = action;
    try {
      const res = await fetch('/api/timer/' + encodeURIComponent(meetingUUID) + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const snap = await res.json();
      applySnapshot(snap);
      if (typeof zoomSdk !== 'undefined') {
        zoomSdk.postMessage({ payload: snap }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to report event', e);
    }
  }

  async function refreshFromServer(){
    if (!meetingUUID) return;
    try {
      const res = await fetch('/api/timer/' + encodeURIComponent(meetingUUID));
      applySnapshot(await res.json());
    } catch (e) {
      console.error('Failed to fetch timer state', e);
    }
  }

  // ---- In-client OAuth (replaces the external-browser deep-link flow) ----
  function randomString(len){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  async function initInClientAuth(){
    // Zoom's in-client flow only supports PKCE method "plain", meaning
    // the code_challenge and code_verifier are the same string.
    const verifier = randomString(43);
    const state = randomString(16);

    zoomSdk.addEventListener('onAuthorized', async (event) => {
      try {
        await fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: event.code, state: event.state, verifier }),
        });
      } catch (e) {
        console.warn('In-client token exchange failed', e);
      }
    });

    try {
      // If scopes are already authorized this is silent (no UI at all).
      // If not, Zoom shows an in-client consent prompt — still inside
      // this panel, never a separate window.
      await zoomSdk.authorize({ state, codeChallenge: verifier });
    } catch (e) {
      console.warn('authorize() call failed', e);
    }
  }

  // ---- Zoom Apps SDK wiring, isolated so its failures never block the
  // UI above. Every early-exit path below just sets a status message. ----
  async function initZoom(){
    if (typeof zoomSdk === 'undefined') {
      els.status.textContent = 'Preview mode';
      els.meta.textContent = 'Not running inside Zoom — open this from a live meeting to sync with recording.';
      els.resetBtn.disabled = false; // allow manual testing outside Zoom
      return;
    }

    let configResponse;
    try {
      configResponse = await zoomSdk.config({
        version: '0.16',
        capabilities: [
          'getRunningContext',
          'getMeetingUUID',
          'getRecordingContext',
          'onCloudRecording',
          'getUserContext',
          'connect',
          'postMessage',
          'onMessage',
          'expandApp',
          'showNotification',
          'authorize',
          'onAuthorized',
        ],
      });
    } catch (err) {
      els.status.textContent = 'Zoom connection failed';
      els.meta.textContent = String(err && err.message ? err.message : err);
      return;
    }
    els.notice.textContent = 'Connected to Zoom client v' + (configResponse.clientVersion || '');
    if (configResponse.unsupportedApis && configResponse.unsupportedApis.length) {
      els.notice.textContent += ' — unsupported: ' + configResponse.unsupportedApis.join(', ');
    }

    // config() already returns runningContext directly — use that instead
    // of a second getRunningContext() call, since it tells us definitively
    // whether the capability itself was granted.
    let runningContext = configResponse.runningContext;
    if (!runningContext) {
      try {
        runningContext = (await zoomSdk.getRunningContext()).runningContext;
      } catch (err) {
        els.status.textContent = 'Could not read meeting context';
        els.meta.textContent = String(err && err.message ? err.message : err);
        return;
      }
    }

    if (runningContext !== 'inMeeting') {
      showNotInMeetingScreen(runningContext);
      return;
    }

    try {
      meetingUUID = (await zoomSdk.getMeetingUUID()).meetingUUID;
    } catch (err) {
      els.status.textContent = 'Could not get meeting ID';
      els.meta.textContent = String(err && err.message ? err.message : err);
      return;
    }
    els.resetBtn.disabled = false;

    // In-client OAuth: completes authorization inside this same meeting
    // panel instead of Zoom opening a separate system-browser window (the
    // "not attached to a meeting" duplicate window seen previously). This
    // just satisfies the app's required OAuth scope — it isn't used for
    // any of the timer's actual functionality.
    initInClientAuth();

    try {
      await zoomSdk.connect();
      zoomSdk.onMessage((event) => {
        if (event && event.payload && event.payload.meetingUUID === meetingUUID) {
          applySnapshot(event.payload);
        }
      });
    } catch (e) {
      console.warn('postMessage channel unavailable, falling back to polling only', e);
    }

    await refreshFromServer();
    setInterval(refreshFromServer, 4000);

    try {
      const initialRecording = await zoomSdk.getRecordingContext();
      if (initialRecording.cloudRecordingStatus === 'started') reportEvent('started');
      if (initialRecording.cloudRecordingStatus === 'paused') reportEvent('paused');
    } catch (e) {
      console.warn('Could not read initial recording context', e);
    }

    zoomSdk.onCloudRecording((event) => {
      if (event.action === 'connecting') {
        els.meta.textContent = 'Time on the record';
        return;
      }
      reportEvent(event.action);
      if (event.action === 'stopped') {
        const { main, sub } = fmt(currentElapsed());
        zoomSdk.showNotification({
          type: 'info',
          title: 'Recording stopped',
          message: 'Total recorded time: ' + main + ':' + sub,
        }).catch(() => {});
      }
    });

    els.meta.textContent = 'Synced with cloud recording for everyone in this meeting.';
  }

  initZoom();
})();
