/* ============================================================
   LifeHub — Sleep tracker pickers

   Chrome draws the panels for <select> and <input type="time">
   outside the page, so no amount of CSS reaches them — that white
   list of hours is browser chrome, not markup. The only way to
   style them is to not use them.

   So: the native controls STAY in the DOM and stay authoritative.
   Everything already written against them keeps working untouched —
   saveSleepLog() reads .value, initAutoSave() restores .value, the
   Alexa listener writes .value. This file only draws a styled face
   over the top and keeps the two in sync.

   Load AFTER tracker-sleep.js.
   ============================================================ */
(function () {
  'use strict';

  /* Native .value stays the source of truth, so anything that sets it
     from code has to announce itself. dispatching both events matches
     what a real user interaction fires. */
  function commit(el) {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* One open panel at a time, page-wide. */
  let openPanel = null;
  function closeOpen() {
    if (openPanel) { openPanel.close(); openPanel = null; }
  }
  document.addEventListener('mousedown', (e) => {
    if (openPanel && !e.target.closest('.pk-wrap')) closeOpen();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPanel) { e.stopPropagation(); closeOpen(); }
  });

  /* ══════════════════════════════════════════════════════════
     SELECT
     ══════════════════════════════════════════════════════════ */
  function enhanceSelect(sel) {
    const wrap = document.createElement('div');
    wrap.className = 'pk-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('pk-native');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pk-face';
    btn.innerHTML = '<span class="pk-val"></span>' +
      '<svg class="pk-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'pk-menu';
    menu.setAttribute('role', 'listbox');

    [...sel.options].forEach((opt, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pk-opt';
      row.textContent = opt.textContent;
      row.dataset.i = i;
      row.addEventListener('click', () => {
        sel.selectedIndex = i;
        commit(sel);
        sync();
        closeOpen();
      });
      menu.appendChild(row);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function sync() {
      const opt = sel.options[sel.selectedIndex];
      btn.querySelector('.pk-val').textContent = opt ? opt.textContent : '';
      [...menu.children].forEach((r, i) =>
        r.classList.toggle('is-on', i === sel.selectedIndex));
    }

    const api = {
      close() { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    };

    btn.addEventListener('click', () => {
      const wasOpen = wrap.classList.contains('is-open');
      closeOpen();
      if (wasOpen) return;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      openPanel = api;
    });

    /* Anything that writes sel.value from code — the Alexa listener,
       the draft restore — lands here and repaints the face. */
    sel.addEventListener('change', sync);
    sync();
  }

  /* ══════════════════════════════════════════════════════════
     TIME
     ══════════════════════════════════════════════════════════ */
  function pad(n) { return String(n).padStart(2, '0'); }

  function enhanceTime(input) {
    const wrap = document.createElement('div');
    wrap.className = 'pk-wrap pk-time';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add('pk-native');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pk-face';
    btn.innerHTML = '<span class="pk-val"></span>' +
      '<svg class="pk-clock" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/></svg>';

    const panel = document.createElement('div');
    panel.className = 'pk-menu pk-cols';

    const colH = document.createElement('div'); colH.className = 'pk-col';
    const colM = document.createElement('div'); colM.className = 'pk-col';
    const colP = document.createElement('div'); colP.className = 'pk-col pk-col-ap';

    /* 12-hour face, because that is how the times get read back on the
       page and spoken by Alexa. The input underneath stays 24-hour. */
    for (let h = 1; h <= 12; h++)  colH.appendChild(cell(pad(h), 'h', h));
    for (let m = 0; m < 60; m++)   colM.appendChild(cell(pad(m), 'm', m));
    ['AM', 'PM'].forEach(p => colP.appendChild(cell(p, 'p', p)));

    function cell(label, kind, value) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-cell';
      b.textContent = label;
      b.dataset.kind = kind;
      b.dataset.value = value;
      b.addEventListener('click', () => { setPart(kind, value); });
      return b;
    }

    panel.appendChild(colH);
    panel.appendChild(colM);
    panel.appendChild(colP);
    wrap.appendChild(btn);
    wrap.appendChild(panel);

    /* Current state, read from the input each time it opens so an
       Alexa-set or draft-restored value is what the panel highlights. */
    function parts() {
      const m = /^(\d{1,2}):(\d{2})$/.exec(input.value || '');
      if (!m) return { h: null, m: null, p: null };
      const H = +m[1];
      return {
        h: (H % 12 === 0) ? 12 : H % 12,
        m: +m[2],
        p: H < 12 ? 'AM' : 'PM'
      };
    }

    function setPart(kind, value) {
      const cur = parts();
      /* Picking one part of an unset field shouldn't produce a blank —
         default the others so the first tap already yields a time. */
      let h = cur.h === null ? 12 : cur.h;
      let mm = cur.m === null ? 0 : cur.m;
      let p = cur.p === null ? 'PM' : cur.p;

      if (kind === 'h') h = value;
      if (kind === 'm') mm = value;
      if (kind === 'p') p = value;

      let H = h % 12;
      if (p === 'PM') H += 12;

      input.value = pad(H) + ':' + pad(mm);
      commit(input);
      sync();
    }

    function sync() {
      const cur = parts();
      btn.querySelector('.pk-val').textContent =
        cur.h === null ? '--:-- --' : cur.h + ':' + pad(cur.m) + ' ' + cur.p.toLowerCase();
      wrap.classList.toggle('is-empty', cur.h === null);

      [...panel.querySelectorAll('.pk-cell')].forEach(c => {
        const k = c.dataset.kind;
        const v = k === 'p' ? c.dataset.value : +c.dataset.value;
        c.classList.toggle('is-on', cur[k] !== null && cur[k] === v);
      });
    }

    /* A 60-row minute column is only usable if it opens on the current
       value rather than at zero. */
    function scrollToSelected() {
      [colH, colM].forEach(col => {
        const on = col.querySelector('.is-on');
        if (on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2;
      });
    }

    const api = {
      close() { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    };

    btn.addEventListener('click', () => {
      const wasOpen = wrap.classList.contains('is-open');
      closeOpen();
      if (wasOpen) return;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      openPanel = api;
      sync();
      scrollToSelected();
    });

    input.addEventListener('change', sync);
    sync();
  }

  /* ══════════════════════════════════════════════════════════ */
  function init() {
    document.querySelectorAll('select.pill-select').forEach(enhanceSelect);
    document.querySelectorAll('input.pill-input[type="time"]').forEach(enhanceTime);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
