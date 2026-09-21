/* ═══════════════════════════════════════════════════
   SCRIBBLE — EXPORT MODULE (PHASE 6)
   Lets any file — regardless of its native type (html,
   js, css, json, txt, custom, colour) — be downloaded as
   plain text, a Word-compatible document, or a print-ready
   PDF. Called from the editor toolbar and the item Action
   Menu (context menu).
═══════════════════════════════════════════════════ */

window.SCRIBBLE_EXPORT = (function() {

    var _target = null; // the file object currently queued for export

    // ADD THIS ↓↓↓
    var NATIVE_FORMATS = {
        html: { label: 'HTML', ext: 'html', icon: 'fa-regular fa-file-code' },
        js:   { label: 'JS',   ext: 'js',   icon: 'fa-regular fa-file-code' },
        css:  { label: 'CSS',  ext: 'css',  icon: 'fa-regular fa-file-code' },
        json: { label: 'JSON', ext: 'json', icon: 'fa-regular fa-file-code' }
    };
    // Code files store RAW plain text (real <, >, & characters) — never
    // safe to pass straight into innerHTML like rich-text files can.
    var CODE_TYPES = { html:1, htm:1, js:1, css:1, json:1 };

    function buildFormatOptions(file) {
        var opts = [];
        if (file.type && file.type !== 'txt' && file.type !== 'colour') {
            var known = NATIVE_FORMATS[file.type];
            opts.push({
                key:   'native',
                label: known ? known.label : file.type.toUpperCase(),
                ext:   known ? known.ext   : file.type,
                icon:  known ? known.icon  : 'fa-regular fa-file-code'
            });
        }
        opts.push({ key: 'txt',  label: 'Text', ext: 'txt', icon: 'fa-regular fa-file-lines' });
        opts.push({ key: 'word', label: 'Word', ext: 'doc', icon: 'fa-regular fa-file-word'  });
        opts.push({ key: 'pdf',  label: 'PDF',  ext: 'pdf', icon: 'fa-regular fa-file-pdf'   });
        return opts;
    }

    /* ═══════════════════════════════════════════════════
       ENTRY POINT
       Call with a file object: { id, name, type, colour?, content? }
       If content is missing/stale it is pulled from EDITOR_FB.
    ═══════════════════════════════════════════════════ */
    function openExportModal(fileObj) {
        if (!fileObj) return;
        closeExportModal();
        _target = fileObj;

        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'export-modal-overlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeExportModal();
        });

        var box = document.createElement('div');
        box.className = 'modal-box';
        box.style.width = '380px';
        box.innerHTML =
            '<div class="modal-title"><i class="fa-solid fa-file-export" style="font-size:18px;color:var(--sub)"></i>Export "' + esc(fileObj.name) + '"</div>' +
            '<div class="modal-field-label">Choose a format</div>' +
            '<div class="export-format-grid">' + buildFormatOptionsHtml(fileObj) + '</div>' +
            '<div id="export-status" class="export-status" style="display:none;"></div>' +
            '<div class="modal-footer"><button class="modal-btn" onclick="window.SCRIBBLE_EXPORT.closeExportModal()">CANCEL</button></div>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function buildFormatOptionsHtml(file) {
        return buildFormatOptions(file).map(function(o) {
            return '<div class="export-format-opt" onclick="window.SCRIBBLE_EXPORT.runExport(\'' + o.key + '\')">' +
                '<i class="' + o.icon + ' export-format-icon"></i>' +
                '<span class="export-format-label">' + esc(o.label) + '</span>' +
                '<span class="export-format-ext">.' + esc(o.ext) + '</span></div>';
        }).join('');
    }

    function closeExportModal() {
        var el = document.getElementById('export-modal-overlay');
        if (el) el.remove();
        _target = null;
    }

    /* ═══════════════════════════════════════════════════
       RUN EXPORT
    ═══════════════════════════════════════════════════ */
    async function runExport(format) {
        var file = _target;
        if (!file) return;

        var statusEl = document.getElementById('export-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = 'Preparing export…';
        }

        var isColour = file.type === 'colour';
        var content  = isColour ? null : file.content;

        // Content wasn't opened/loaded yet (e.g. exporting straight from the
        // Action Menu without opening the file first) — fetch it.
        if (!isColour && (content == null || content === 'Loading...')) {
            if (window.EDITOR_FB && typeof window.EDITOR_FB.getFileContent === 'function') {
                /* _overridePid added 2026-09-17 — exporting a symlink-opened
                   file straight from the Action Menu read the URL project
                   instead of the one holding it, so the download came out
                   empty. The file object already carries the right id. */
                try { content = await window.EDITOR_FB.getFileContent(file.id, file._overridePid); }
                catch (e) { content = ''; }
            } else {
                content = '';
            }
        }

        var payload = isColour ? buildColourPayload(file) : buildDocPayload(content || '', !!CODE_TYPES[file.type]);

        closeExportModal();
        logExport(file, format);

        if (format === 'native') return downloadNative(file, payload);
        if (format === 'txt')    return downloadTxt(file, payload);
        if (format === 'word')   return downloadWord(file, payload);
        if (format === 'pdf')    return downloadPdf(file, payload);
    }

    // Best-effort — a logging hiccup should never block the actual download.
    function logExport(file, format) {
        if (!window.PROJECT_FB || typeof window.PROJECT_FB.logItemAction !== 'function') return;
        /* Same 2026-09-17 fix — the export line belongs in the log of the
           project that actually holds the file. */
        var pid = file._overridePid || window._projectId;
        if (!pid || !file.id) return;
        var labels = { native: (NATIVE_FORMATS[file.type] ? NATIVE_FORMATS[file.type].label : (file.type || '').toUpperCase()), txt: 'Text', word: 'Word', pdf: 'PDF' };
        var label = labels[format] || format;
        window.PROJECT_FB.logItemAction(pid, file.id, 'Exported as ' + label + '.').catch(function() {});
    }

    /* ═══════════════════════════════════════════════════
       CONTENT BUILDERS
    ═══════════════════════════════════════════════════ */

    // Colour files store a hex value directly on the item rather than going
    // through the rich-text content field, so they need their own payload.
    function buildColourPayload(file) {
        var hex = file.colour || '#000000';
        return {
            plainText: file.name + '\nColour: ' + hex.toUpperCase(),
            html:
                '<div style="font-family:Georgia,serif;">' +
                '<h2 style="margin:0 0 12px;">' + esc(file.name) + '</h2>' +
                '<div style="width:160px;height:160px;border:1px solid #ccc;border-radius:8px;background:' + esc(hex) + ';margin-bottom:12px;"></div>' +
                '<p style="font-size:14px;color:#333;">Hex value: <b>' + esc(hex.toUpperCase()) + '</b></p>' +
                '</div>'
        };
    }

    // Every other file type (html/js/css/json/txt/custom) shares the same
    // rich-text contenteditable content, so they all export the same way.
    function buildDocPayload(contentRaw, isCode) {
        if (isCode) {
            // Never touch innerHTML for code — the content IS the plain
            // text already. For Word/PDF, escape it and wrap in <pre> so
            // it shows as literal code there too, instead of being parsed.
            var plain = contentRaw || '';
            var htmlSafe = '<pre style="white-space:pre-wrap;font-family:\'Courier New\',monospace;font-size:11pt;">' + esc(plain) + '</pre>';
            return { plainText: plain, html: htmlSafe };
        }
        var html = contentRaw && contentRaw.trim() ? contentRaw : '<p></p>';
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        return { plainText: htmlToPlainText(tmp), html: html };
    }

    // Walks the DOM and inserts newlines at block-level boundaries so a
    // plain-text export reads like the editor did, not a run-on wall of text.
    function htmlToPlainText(root) {
        var BLOCK = { P:1, DIV:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, LI:1, BLOCKQUOTE:1, TR:1 };
        var lines = [];
        var current = '';

        function walk(node) {
            node.childNodes.forEach(function(child) {
                if (child.nodeType === 3) {
                    current += child.textContent;
                } else if (child.nodeType === 1) {
                    if (child.tagName === 'BR') {
                        if (current !== '') { lines.push(current); current = ''; }
                        return;
                    }
                    walk(child);
                    if (BLOCK[child.tagName]) { lines.push(current); current = ''; }
                }
            });
        }

        walk(root);
        if (current.trim()) lines.push(current);
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    /* ═══════════════════════════════════════════════════
       DOWNLOAD HELPERS
    ═══════════════════════════════════════════════════ */
    function triggerDownload(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function baseName(file) {
        return (file.name || 'export').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
    }


    function downloadNative(file, payload) {
        var known = NATIVE_FORMATS[file.type];
        var ext  = known ? known.ext : file.type;
        var mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' }[file.type] || 'text/plain';
        var blob = new Blob([payload.plainText], { type: mime + ';charset=utf-8' });
        triggerDownload(blob, baseName(file) + '.' + ext);
    }


    function downloadTxt(file, payload) {
        var blob = new Blob([payload.plainText], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, baseName(file) + '.txt');
    }

    // Classic HTML-in-a-.doc trick: Word opens this natively and keeps bold,
    // italic, highlight colours, headings and tables intact.
    function downloadWord(file, payload) {
        var htmlDoc =
            '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
            '<head><meta charset="utf-8"><title>' + esc(file.name) + '</title>' +
            '<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a1a;} h1,h2,h3,h4,h5,h6{font-family:Georgia,serif;} table{border-collapse:collapse;} td,th{border:1px solid #999;padding:4px 8px;}</style>' +
            '</head><body>' + payload.html + '</body></html>';
        var blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword' });
        triggerDownload(blob, baseName(file) + '.doc');
    }

    // Renders the file's real formatted content in a hidden print frame, then
    // hands off to the browser's native print dialog so the person can save
    // it as a PDF with accurate fonts, colours and layout — no extra library.
    function downloadPdf(file, payload) {
        var iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        var doc = iframe.contentWindow.document;
        doc.open();
        doc.write(
            '<html><head><meta charset="utf-8"><title>' + esc(file.name) + '</title>' +
            '<style>' +
            '@page { margin: 24mm 20mm; }' +
            'body{font-family:Georgia,serif;font-size:12pt;line-height:1.5;color:#1a1a1a;margin:0;padding:0;}' +
            'h1,h2,h3,h4,h5,h6{font-family:"Roboto Condensed",Arial,sans-serif;}' +
            'table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:6px;}' +
            '</style></head><body>' + payload.html + '</body></html>'
        );
        doc.close();

        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(function() { iframe.remove(); }, 1000);
        }, 250);
    }

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeExportModal();
    });

    return {
        openExportModal: openExportModal,
        closeExportModal: closeExportModal,
        runExport: runExport
    };

})();
