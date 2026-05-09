// ==UserScript==
// @name         MeldGeluidsoverlast — Eindhoven Airport 1-tap melder
// @namespace    https://meldgeluidsoverlast.nl/
// @version      1.8.0
// @description  MeldGeluidsoverlast — 1-tap geluidsmelding bij Eindhoven Airport. Subcause via ?sub=N (1=Slaapverstoring, 2=Binnen, 3=Buiten, 7=Grondgeluid). Random delays, progressbar, Tampermonkey-detectie. Na succesvolle melding terug naar PWA-launcher.
// @match        https://ein.flighttracking.casper.aero/portal/*
// @match        https://mrcncpt.github.io/klacht-eindhoven/*
// @match        https://meldgeluidsoverlast.nl/*
// @match        https://www.meldgeluidsoverlast.nl/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @updateURL    https://www.meldgeluidsoverlast.nl/klacht-eindhoven.user.js
// @downloadURL  https://www.meldgeluidsoverlast.nl/klacht-eindhoven.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Op de install/landing-pagina (github.io): alleen een vlag zetten zodat install.html ziet dat Tampermonkey + dit script geinstalleerd zijn. Geen klacht-logica daar.
    if (location.host === 'mrcncpt.github.io' || /(^|\.)meldgeluidsoverlast\.nl$/.test(location.host)) {
        var ping = function () {
            if (!document.body) { setTimeout(ping, 30); return; }
            try {
                document.body.dataset.tmMgoScript = '1.8.0';
                document.body.dataset.tmKlachtScript = '1.8.0';
                document.dispatchEvent(new CustomEvent('tm-mgo-loaded', { detail: { version: '1.8.0' } }));
                document.dispatchEvent(new CustomEvent('tm-klacht-loaded', { detail: { version: '1.8.0' } }));
            } catch (e) {}
        };
        ping();
        return;
    }

    if (window.__klachtRan) return;
    window.__klachtRan = true;

    var SETTINGS = {
        type: 'COMPLAINT',
        complaintType: 'SPECIFIC',
        causeValue: '2',
        subcauseValue: '2',
        wantFeedback: false,
        useCurrentTime: true,
        autoSubmit: true
    };

    var FLAG = 'casperKlachtAuto';
    var TIMEKEY = 'casperKlachtTime';
    var SUBKEY = 'casperKlachtSub';
    var bodyId = (document.body && document.body.id) || '';

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function delay(min, max, fn) { setTimeout(fn, rand(min, max)); }

    var STEPS = {
        'complaint-1': { num: 1, label: 'Type kiezen', pct: 12 },
        'complaint-2': { num: 2, label: 'Specifieke melding', pct: 37 },
        'complaint-specific': { num: 3, label: 'Datum & tijd', pct: 62 },
        'complaint-last': { num: 4, label: 'Oorzaak & verzenden', pct: 87 }
    };

    var SUBCAUSE_LABELS = {
        '1': 'Slaapverstoring',
        '2': 'Geluid in huis',
        '3': 'Geluid buiten',
        '7': 'Grondgeluid'
    };

    function showBanner(pct, label, color) {
        var b = document.getElementById('__klacht_banner');
        if (!b) {
            b = document.createElement('div');
            b.id = '__klacht_banner';
            b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;font-family:-apple-system,sans-serif;color:#fff;background:#161d2f;border-bottom:1px solid #243150;';
            b.innerHTML = '<div style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700"><span id="__kbtxt">MeldGeluidsoverlast</span><span id="__kbpct" style="font-size:12px;color:#9aa6bd">0%</span></div><div style="height:4px;background:#0a0f1c"><div id="__kbbar" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#ffb800);transition:width .4s ease"></div></div>';
            document.body.appendChild(b);
        }
        if (color) b.style.background = color;
        var t = document.getElementById('__kbtxt');
        var p = document.getElementById('__kbpct');
        var bar = document.getElementById('__kbbar');
        if (t) t.textContent = 'Meld — ' + label;
        if (p) p.textContent = pct + '%';
        if (bar) bar.style.width = pct + '%';
    }

    var hasTrigger = /[?&]klachtnu(=|&|$)/i.test(location.search) ||
                     location.hash.toLowerCase().indexOf('klachtnu') !== -1;

    if (hasTrigger) {
        sessionStorage.setItem(FLAG, '1');
        var ms = location.search.match(/[?&]sub=(\d+)/i);
        if (ms) sessionStorage.setItem(SUBKEY, ms[1]);
        var m = location.search.match(/[?&]tijd=([0-2]?\d:[0-5]\d)/i);
        if (m) sessionStorage.setItem(TIMEKEY, m[1]);
        else if (SETTINGS.useCurrentTime) {
            var now = new Date();
            sessionStorage.setItem(TIMEKEY,
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0'));
        }
        var alreadyOnStep1 = (location.pathname === '/portal/' || location.pathname === '/portal') &&
                              location.search === '?p=complaint-1' && !location.hash;
        if (!alreadyOnStep1) {
            location.replace('/portal/?p=complaint-1');
            return;
        }
    }

    if (sessionStorage.getItem(FLAG) !== '1') return;

    // Read subcause from sessionStorage (set by trigger)
    var subFromStorage = sessionStorage.getItem(SUBKEY);
    if (subFromStorage && SUBCAUSE_LABELS[subFromStorage]) {
        SETTINGS.subcauseValue = subFromStorage;
    }

    var step = STEPS[bodyId];
    if (step) {
        var subLbl = SUBCAUSE_LABELS[SETTINGS.subcauseValue] || '';
        showBanner(step.pct, 'Stap ' + step.num + '/4 — ' + step.label + (subLbl ? ' (' + subLbl + ')' : ''));
    } else {
        showBanner(0, '…', '#ef4444');
    }

    function wait(test, cb, tries) {
        if (typeof tries === 'undefined') tries = 100;
        try { if (test()) { cb(); return; } } catch (e) {}
        if (tries > 0) setTimeout(function () { wait(test, cb, tries - 1); }, rand(120, 200));
        else { showBanner(0, 'Timeout op ' + bodyId + ' — herlaad de pagina', '#ef4444'); }
    }

    function handlerBound(selector) {
        if (typeof jQuery === 'undefined') return false;
        var el = document.querySelector(selector);
        if (!el) return false;
        try {
            var events = jQuery._data && jQuery._data(el, 'events');
            return !!(events && events.click && events.click.length > 0);
        } catch (e) { return false; }
    }

    function clearFlag() {
        sessionStorage.removeItem(FLAG);
        sessionStorage.removeItem(TIMEKEY);
        sessionStorage.removeItem(SUBKEY);
    }

    function clickBtn(selector) {
        if (typeof jQuery !== 'undefined' && jQuery(selector).length) {
            jQuery(selector).trigger('click');
        } else {
            var b = document.querySelector(selector);
            if (b) b.click();
        }
    }

    if (bodyId === 'complaint-1') {
        delay(400, 1100, function () {
            wait(function () {
                return document.querySelector('input[name=type]') && handlerBound('#c1_next');
            }, function () {
                var radio = document.querySelector('input[name=type][value=' + SETTINGS.type + ']');
                if (radio) radio.click();
                delay(250, 600, function () { clickBtn('#c1_next'); });
            });
        });

    } else if (bodyId === 'complaint-2') {
        delay(350, 900, function () {
            wait(function () {
                return document.querySelector('input[name=complaintType]') && handlerBound('#c2_next');
            }, function () {
                var radio = document.querySelector('input[name=complaintType][value=' + SETTINGS.complaintType + ']');
                if (radio) radio.click();
                delay(250, 600, function () { clickBtn('#c2_next'); });
            });
        });

    } else if (bodyId === 'complaint-specific') {
        delay(400, 1000, function () {
            wait(function () {
                return document.querySelector('input[name=time]') &&
                       document.querySelector('input[name=date]') &&
                       handlerBound('#cs_next');
            }, function () {
                var now = new Date();
                var d = document.querySelector('input[name=date]');
                d.value = now.getFullYear() + '-' +
                          String(now.getMonth() + 1).padStart(2, '0') + '-' +
                          String(now.getDate()).padStart(2, '0');
                d.dispatchEvent(new Event('input', { bubbles: true }));
                d.dispatchEvent(new Event('change', { bubbles: true }));

                delay(150, 400, function () {
                    var time = sessionStorage.getItem(TIMEKEY);
                    if (!time) {
                        time = String(now.getHours()).padStart(2, '0') + ':' +
                               String(now.getMinutes()).padStart(2, '0');
                    }
                    var t = document.querySelector('input[name=time]');
                    t.value = time;
                    t.dispatchEvent(new Event('input', { bubbles: true }));
                    t.dispatchEvent(new Event('change', { bubbles: true }));

                    delay(300, 700, function () { clickBtn('#cs_next'); });
                });
            });
        });

    } else if (bodyId === 'complaint-last') {
        delay(450, 1000, function () {
            wait(function () {
                return document.querySelector('select[name=cause]') && handlerBound('#cl_next');
            }, function () {
                var cause = document.querySelector('select[name=cause]');
                cause.value = SETTINGS.causeValue;
                cause.dispatchEvent(new Event('change', { bubbles: true }));

                delay(250, 600, function () {
                    wait(function () {
                        var sub = document.querySelector('select[name=subcause]');
                        return sub && sub.options.length > 1;
                    }, function () {
                        var sub = document.querySelector('select[name=subcause]');
                        sub.value = SETTINGS.subcauseValue;
                        sub.dispatchEvent(new Event('change', { bubbles: true }));

                        if (SETTINGS.wantFeedback) {
                            var fb = document.querySelector('input[name=feedback]');
                            if (fb && !fb.checked) fb.click();
                        }

                        if (SETTINGS.autoSubmit) {
                            delay(400, 900, function () {
                                clickBtn('#cl_next');
                                clearFlag();
                                showBanner(100, 'Melding verstuurd ✓ — terug naar app...', '#16a34a');
                                // Navigeer na 2 seconden terug naar de PWA-launcher zodat user direct opnieuw kan klagen
                                setTimeout(function () {
                                    var subToType = { '1': 'slaap', '2': 'binnen', '3': 'buiten' };
                                    var t = subToType[SETTINGS.subcauseValue];
                                    if (t) {
                                        // Default naar live site; alleen terug naar github.io als gebruiker daar vandaan kwam (dev)
                                        var ref = document.referrer || '';
                                        var base = /mrcncpt\.github\.io/.test(ref)
                                            ? 'https://mrcncpt.github.io/klacht-eindhoven/'
                                            : 'https://www.meldgeluidsoverlast.nl/';
                                        location.replace(base + t + '.html?done=1');
                                    } else {
                                        try { window.close(); } catch (e) {}
                                        try { history.back(); } catch (e) {}
                                    }
                                }, 2000);
                            });
                        } else {
                            clearFlag();
                            showBanner(100, 'Klaar — controleer en verstuur de melding', '#f59e0b');
                        }
                    });
                });
            });
        });

    } else if (bodyId === 'login' || /\?p=login/.test(location.href) || document.querySelector('input[type=password]')) {
        clearFlag();
        showBanner(0, 'Log eerst in en tap opnieuw op icoon', '#ffb800');
    }
})();
