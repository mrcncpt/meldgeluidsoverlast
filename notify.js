/**
 * MeldGeluidsoverlast — Vliegtuig-notificaties
 *
 * Checkt via de OpenSky Network API of er vliegtuigen in de buurt zijn
 * en stuurt een browser-notificatie zodat de gebruiker snel kan melden.
 *
 * Alles draait client-side. Voorkeur wordt opgeslagen in localStorage.
 */
(function () {
  'use strict';

  // --- Config ---
  var STORAGE_KEY = 'mgNotify';
  var CHECK_INTERVAL = 45000;        // 45 sec (OpenSky free: max 10 req/min)
  var COOLDOWN = 3 * 60 * 1000;      // 3 min tussen notificaties
  var RADIUS_KM = 8;                 // straal rond gebruiker
  var MIN_ALTITUDE_M = 15;           // filter grondverkeer (taxiën ~0-10m)
  var MAX_ALTITUDE_M = 3500;         // alleen laagvliegers
  // Eindhoven Airport als fallback
  var DEFAULT_LAT = 51.4484;
  var DEFAULT_LON = 5.3745;

  // --- State ---
  var timer = null;
  var lastNotifyTime = 0;
  var userLat = null;
  var userLon = null;

  // --- DOM refs ---
  var toggle = document.getElementById('notifyToggle');
  var card = document.getElementById('notifyCard');
  var statusEl = document.getElementById('notifyStatus');
  var testBtn = document.getElementById('notifyTest');

  if (!toggle || !card) return;

  // --- Helpers ---
  function getPrefs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function savePrefs(obj) {
    var current = getPrefs();
    for (var k in obj) current[k] = obj[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  function kmToDeg(km) {
    return km / 111.32;
  }

  function boundingBox(lat, lon, km) {
    var d = kmToDeg(km);
    return {
      lamin: (lat - d).toFixed(4),
      lamax: (lat + d).toFixed(4),
      lomin: (lon - d).toFixed(4),
      lomax: (lon + d).toFixed(4)
    };
  }

  function setStatus(html) {
    if (statusEl) {
      statusEl.innerHTML = html;
      statusEl.style.display = html ? '' : 'none';
    }
  }

  // --- Location ---
  function getLocation(cb) {
    var prefs = getPrefs();
    if (prefs.lat && prefs.lon) {
      userLat = prefs.lat;
      userLon = prefs.lon;
      cb();
      return;
    }

    if (!navigator.geolocation) {
      userLat = DEFAULT_LAT;
      userLon = DEFAULT_LON;
      savePrefs({ lat: userLat, lon: userLon });
      cb();
      return;
    }

    setStatus('Locatie ophalen...');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
        savePrefs({ lat: userLat, lon: userLon });
        cb();
      },
      function () {
        userLat = DEFAULT_LAT;
        userLon = DEFAULT_LON;
        savePrefs({ lat: userLat, lon: userLon });
        cb();
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }

  // --- OpenSky API ---
  function checkFlights() {
    if (!userLat || !userLon) return;

    var box = boundingBox(userLat, userLon, RADIUS_KM);
    var apiUrl = 'https://opensky-network.org/api/states/all'
      + '?lamin=' + box.lamin
      + '&lamax=' + box.lamax
      + '&lomin=' + box.lomin
      + '&lomax=' + box.lomax;

    // OpenSky blokkeert CORS direct — we gebruiken altijd /api/opensky
    // (lokaal: proxy.py, productie: opensky.php via .htaccess rewrite)
    var url = '/api/opensky?' + apiUrl.split('?')[1];

    console.log('[MG] Fetching:', url);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);

    fetch(url, { signal: controller.signal })
      .then(function (r) {
        console.log('[MG] Response status:', r.status);
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        var states = data.states || [];
        console.log('[MG] Vliegtuigen gevonden:', states.length);
        // Filter: alleen vliegtuigen op lage hoogte (niet grondverkeer)
        var low = states.filter(function (s) {
          var alt = s[7]; // baro_altitude in meters
          if (alt === null) alt = s[13]; // geo_altitude
          return alt !== null && alt >= MIN_ALTITUDE_M && alt <= MAX_ALTITUDE_M;
        });
        console.log('[MG] Laagvliegers:', low.length);

        updateStatusDisplay(low.length, states.length);

        if (low.length > 0) {
          sendNotification(low);
        }
      })
      .catch(function (err) {
        console.error('[MG] Fetch error:', err);
        setStatus('Kon vliegtuigdata niet ophalen. Volgende check over 45s.');
      })
      .finally(function () { clearTimeout(timeout); });
  }

  function updateStatusDisplay(lowCount, totalCount) {
    if (lowCount > 0) {
      setStatus(
        '<span class="live-dot"></span>'
        + '<span class="count">' + lowCount + '</span> laagvliegend'
        + (lowCount === 1 ? ' vliegtuig' : ' vliegtuigen')
        + ' in de buurt'
        + (totalCount > lowCount ? ' (' + totalCount + ' totaal)' : '')
      );
    } else if (totalCount > 0) {
      setStatus(
        totalCount + ' vliegtuig' + (totalCount === 1 ? '' : 'en')
        + ' in de buurt, geen op lage hoogte'
      );
    } else {
      setStatus('Geen vliegtuigen gedetecteerd in de buurt');
    }
  }

  // --- Notification ---
  function sendNotification(planes) {
    var now = Date.now();
    if (now - lastNotifyTime < COOLDOWN) return;
    lastNotifyTime = now;

    var count = planes.length;
    var title = count + ' vliegtuig' + (count === 1 ? '' : 'en') + ' boven je';
    var body = 'Laagvliegend verkeer gedetecteerd. Tap om een melding in te dienen.';

    // Kies de laagste
    var lowest = planes.reduce(function (a, b) {
      var altA = a[7] || a[13] || 9999;
      var altB = b[7] || b[13] || 9999;
      return altA < altB ? a : b;
    });
    var alt = Math.round(lowest[7] || lowest[13] || 0);
    var callsign = (lowest[1] || '').trim();
    if (callsign) {
      body = callsign + ' op ' + alt + 'm hoogte. Tap om te melden.';
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var n = new Notification(title, {
      body: body,
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiNmZmI4MDAiLz48cGF0aCBmaWxsPSIjMWExMzAwIiBkPSJNMzIgMTNsNCAxOCAxNCA2LTE0IDQtNCAxMi00LTEyLTE0LTQgMTQtNnoiLz48L3N2Zz4=',
      tag: 'mg-flight',
      renotify: true
    });

    n.onclick = function () {
      window.focus();
      n.close();
    };
  }

  // --- Start / Stop ---
  function startWatching() {
    stopWatching();
    setStatus('Locatie ophalen...');
    getLocation(function () {
      setStatus('Vliegtuigen checken...');
      checkFlights();
      timer = setInterval(checkFlights, CHECK_INTERVAL);
    });
  }

  function stopWatching() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    setStatus('');
  }

  // --- Permission ---
  function requestPermission(cb) {
    if (!('Notification' in window)) {
      cb(false);
      return;
    }
    if (Notification.permission === 'granted') {
      cb(true);
      return;
    }
    if (Notification.permission === 'denied') {
      cb(false);
      return;
    }
    Notification.requestPermission().then(function (perm) {
      cb(perm === 'granted');
    });
  }

  // --- Toggle handler ---
  function onToggle() {
    console.log('[MG] Toggle changed:', toggle.checked);
    console.log('[MG] Notification support:', 'Notification' in window);
    console.log('[MG] Notification permission:', 'Notification' in window ? Notification.permission : 'n/a');

    if (toggle.checked) {
      requestPermission(function (granted) {
        console.log('[MG] Permission result:', granted);
        if (granted) {
          savePrefs({ enabled: true });
          card.classList.add('active');
          if (testBtn) testBtn.classList.remove('hidden');
          startWatching();
        } else {
          toggle.checked = false;
          setStatus('Notificaties zijn geblokkeerd in je browser. Klik op het 🔒 icoon in de adresbalk → Meldingen → Toestaan.');
        }
      });
    } else {
      savePrefs({ enabled: false });
      card.classList.remove('active');
      if (testBtn) testBtn.classList.add('hidden');
      stopWatching();
    }
  }

  toggle.addEventListener('change', onToggle);

  // Test knop
  if (testBtn) {
    testBtn.addEventListener('click', function () {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        setStatus('Sta eerst notificaties toe door de toggle aan te zetten.');
        return;
      }
      var n = new Notification('1 vliegtuig boven je', {
        body: 'TEST123 op 280m hoogte. Tap om te melden.',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiNmZmI4MDAiLz48cGF0aCBmaWxsPSIjMWExMzAwIiBkPSJNMzIgMTNsNCAxOCAxNCA2LTE0IDQtNCAxMi00LTEyLTE0LTQgMTQtNnoiLz48L3N2Zz4=',
        tag: 'mg-flight-test'
      });
      n.onclick = function () { window.focus(); n.close(); };
      setStatus('Test-notificatie verstuurd!');
    });
  }

  // --- Init: herstel vorige voorkeur ---
  var prefs = getPrefs();
  if (prefs.enabled) {
    toggle.checked = true;
    card.classList.add('active');
    if ('Notification' in window && Notification.permission === 'granted') {
      if (testBtn) testBtn.classList.remove('hidden');
      startWatching();
    } else {
      toggle.checked = false;
      savePrefs({ enabled: false });
      card.classList.remove('active');
    }
  }
})();
                                                                                                                                                                                                  