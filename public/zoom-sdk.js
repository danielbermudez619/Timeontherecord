// Loads the Zoom Apps SDK from this app's own origin (served out of the
// version-pinned @zoom/appssdk npm package — see server.js) instead of
// appssdk.zoom.us, and exposes it as the same `zoomSdk` global the CDN
// build defined, so app.js is unchanged.
import zoomSdk from '/vendor/zoom-appssdk.js';

window.zoomSdk = zoomSdk;
