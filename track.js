/**
 * MeldGeluidsoverlast — anonymous client-side tracker.
 *
 * Privacy: geen cookies, geen fingerprinting, alleen geanonimiseerde page view tracking
 * naar de eigen server. AVG-compliant zonder cookie-banner.
 *
 * Embed in HTML pagina's: <script src="track.js" defer></script>
 *
 * Custom event vanuit code: window.mgTrack('melding', 'binnen')
 */
(function () {
  'use strict';

  // Skip in dev / standalone PWA mode (anders telt elke localhost-test mee)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  // Skip Do-Not-Track headers
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes') return;

  var TRACK_URL = '/api/track';

  function send(params) {
    try {
      var url = TRACK_URL + '?' + Object.keys(params)
        .filter(function (k) { return params[k]; })
        .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
        .join('&');
      // Use sendBeacon if available (fire-and-forget, doesn't block page unload)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        // Fallback: fetch with keepalive
        fetch(url, { method: 'GET', keepalive: true, mode: 'cors', credentials: 'omit' })
          .catch(function () {});
      }
    } catch (e) {}
  }

  // === Page view ===
  function trackPageView() {
    var page = location.pathname;
    if (page === '' || page === '/') page = '/';
    var ref = '';
    try {
      if (document.referrer) {
        var refUrl = new URL(document.referrer);
        if (refUrl.hostname && refUrl.hostname !== location.hostname &&
            !/meldgeluidsoverlast\.nl$/.test(refUrl.hostname)) {
          ref = refUrl.hostname;
        }
      }
    } catch (e) {}
    send({ p: page, r: ref });
  }

  // === Public API for custom events ===
  window.mgTrack = function (eventName, type) {
    if (!eventName) return;
    send({ e: eventName, t: type || '' });
  };

  // === Run on page load ===
  if (document.readyState === 'complete') {
    setTimeout(trackPageView, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(trackPageView, 100);
    });
  }
})();
