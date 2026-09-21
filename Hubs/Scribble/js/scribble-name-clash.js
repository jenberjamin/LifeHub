/* ═══════════════════════════════════════════════════
   SCRIBBLE — NAME CLASH MODAL
   js/scribble-name-clash.js

   One dialog, used by both the landing page and the
   project page, so a refused name reads the same
   wherever you hit it.

   The point of it is the WHERE. A name being "already
   taken" by something you cannot see — sitting in the
   bin, or shelved in the archive — is the confusing
   case, and the one most likely to happen, since that
   is exactly where old work goes. So the dialog always
   names the place, and offers to take you there.

   Classic script, not a module: scribble-app.js and
   scribble-project-app.js are both classic and call this
   directly. Styles are injected here so it works on any
   page without touching a stylesheet.

   Use:
     showNameClash({
        kind:    'project' | 'module' | 'section' | 'file',
        typed:   'what the user typed',
        clash:   { name, status },     // status: live|archived|bin
        onEdit:  function () { ... },  // focus the field again
        advice:  'override the guidance line',   // optional
        okLabel: 'Got it'                        // optional
     });

   advice/okLabel exist for the moves and links, where there is no
   field to go back to — "Choose another name" reads as nonsense when
   the thing you did was drag a file into a folder.
═══════════════════════════════════════════════════ */

(function () {

    const PLACE = {
        live:     { label: 'already in use',      where: null },
        archived: { label: 'in the Archive',      where: 'Scribble-archive.html' },
        bin:      { label: 'in the Recycle Bin',  where: 'Scribble-recycle-bin.html' }
    };

    const ADVICE = {
        live:     'Pick a different name.',
        archived: 'It is shelved, not gone. Rename this one, or restore the ' +
                  'archived copy first if you meant to carry on with it.',
        bin:      'It is still in the bin, so the name is not free yet. Rename ' +
                  'this one, or empty that item from the bin to release it.'
    };

    let host = null;

    window.showNameClash = function (opts) {
        closeNameClash();

        const kind   = opts.kind  || 'item';
        const typed  = opts.typed || '';
        const clash  = opts.clash || { name: typed, status: 'live' };
        const status = PLACE[clash.status] ? clash.status : 'live';
        const place  = PLACE[status];

        /* Files are identified by name AND extension, so show the
           extension — otherwise "Notes is taken" reads as wrong when
           the clash is specifically with Notes.txt. */
        const shown = (kind === 'file' && clash.type)
            ? clash.name + '.' + clash.type
            : clash.name;

        host = document.createElement('div');
        host.id = 'scribble-name-clash';
        host.innerHTML =
            '<div class="snc-backdrop"></div>' +
            '<div class="snc-card" role="alertdialog" aria-modal="true" aria-labelledby="snc-title">' +
              '<div class="snc-top">' +
                '<i class="fa-solid fa-circle-exclamation snc-icon"></i>' +
                '<h2 id="snc-title">That name is taken</h2>' +
              '</div>' +
              '<p class="snc-body">' +
                'A ' + esc(kind) + ' named <b>' + esc(shown) + '</b> is ' +
                '<span class="snc-place snc-' + status + '">' + esc(place.label) + '</span>.' +
              '</p>' +
              '<p class="snc-advice">' + esc(opts.advice || ADVICE[status]) + '</p>' +
              '<div class="snc-actions">' +
                '<button type="button" class="snc-primary" id="snc-edit">' +
                  esc(opts.okLabel || 'Choose another name') + '</button>' +
                (place.where
                    ? '<button type="button" class="snc-ghost" id="snc-go">Go there</button>'
                    : '') +
              '</div>' +
            '</div>';

        const css = document.createElement('style');
        css.id = 'scribble-name-clash-css';
        css.textContent = STYLES;
        document.head.appendChild(css);
        document.body.appendChild(host);

        const edit = host.querySelector('#snc-edit');
        edit.addEventListener('click', function () {
            closeNameClash();
            if (typeof opts.onEdit === 'function') opts.onEdit();
        });

        const go = host.querySelector('#snc-go');
        if (go) go.addEventListener('click', function () {
            window.location.href = place.where;
        });

        host.querySelector('.snc-backdrop').addEventListener('click', function () {
            closeNameClash();
            if (typeof opts.onEdit === 'function') opts.onEdit();
        });

        document.addEventListener('keydown', onKey);
        edit.focus();
    };

    function onKey(e) {
        if (e.key !== 'Escape' && e.key !== 'Enter') return;
        const btn = host && host.querySelector('#snc-edit');
        if (btn) btn.click();
    }

    window.closeNameClash = function () {
        if (!host) return;
        document.removeEventListener('keydown', onKey);
        host.remove();
        const css = document.getElementById('scribble-name-clash-css');
        if (css) css.remove();
        host = null;
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const STYLES = [
        '#scribble-name-clash{position:fixed;inset:0;z-index:100000;display:flex;',
          'align-items:center;justify-content:center;',
          'font-family:"Roboto Condensed",system-ui,-apple-system,Segoe UI,sans-serif;}',
        '#scribble-name-clash .snc-backdrop{position:absolute;inset:0;background:rgba(30,30,26,.45);}',
        '#scribble-name-clash .snc-card{position:relative;width:min(92vw,400px);background:#fff;',
          'border-radius:8px;padding:22px 22px 18px;',
          'box-shadow:0 4px 20px rgba(0,0,0,.11),0 20px 60px rgba(0,0,0,.18);',
          'animation:snc-in .16s ease-out;}',
        '@keyframes snc-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}',
        '#scribble-name-clash .snc-top{display:flex;align-items:center;gap:9px;margin-bottom:12px;}',
        '#scribble-name-clash .snc-icon{color:#E05A4E;font-size:15px;}',
        '#scribble-name-clash h2{margin:0;font-size:14.5px;font-weight:600;color:#4A4A4A;letter-spacing:.3px;}',
        '#scribble-name-clash .snc-body{margin:0 0 9px;font-size:12.5px;line-height:1.6;color:#4A4A4A;',
          'overflow-wrap:anywhere;}',
        '#scribble-name-clash .snc-body b{font-weight:600;}',
        '#scribble-name-clash .snc-place{font-weight:600;}',
        '#scribble-name-clash .snc-live{color:#E05A4E;}',
        '#scribble-name-clash .snc-archived{color:#B08A5C;}',
        '#scribble-name-clash .snc-bin{color:#B05C5C;}',
        '#scribble-name-clash .snc-advice{margin:0 0 18px;font-size:11.5px;line-height:1.6;color:#9A9A9A;}',
        '#scribble-name-clash .snc-actions{display:flex;gap:8px;}',
        '#scribble-name-clash button{flex:1;padding:10px 12px;border-radius:6px;cursor:pointer;',
          'font-family:inherit;font-size:10px;letter-spacing:2px;text-transform:uppercase;',
          'transition:opacity .2s,background .2s;}',
        '#scribble-name-clash .snc-primary{background:#5C5C52;color:#fff;border:none;}',
        '#scribble-name-clash .snc-primary:hover{opacity:.88;}',
        '#scribble-name-clash .snc-ghost{background:none;color:#9A9A9A;border:1px solid rgba(0,0,0,.12);}',
        '#scribble-name-clash .snc-ghost:hover{color:#4A4A4A;background:rgba(0,0,0,.03);}',
        '#scribble-name-clash button:focus-visible{outline:2px solid #5C5C52;outline-offset:2px;}'
    ].join('');

})();
