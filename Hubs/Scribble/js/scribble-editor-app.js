/* ═══════════════════════════════════════════════════
   SCRIBBLE
═══════════════════════════════════════════════════ */

window.EDITOR_APP = (function() {
    var openFiles = []; 
    var activeFileId = null;
    var autoSaveTimer = null;
    var _confirmCallback = null;
    var _draggedId = null;
    var _tabCtxMenu = null;
    var _searchMatches = [];
    var _searchCurrent = -1;
    var overlayEl, minimizedTabEl, tabsContainerEl, textareaEl, countEl, lineNumbersEl;
    var CODE_TYPES = { html:1, htm:1, js:1, css:1, json:1 };
    var highlightTimer = null;
    var validateTimer  = null;
    var _codeIssues = [];
    var _codeProblemsExpanded = false;
    var _sideNotesOpen = false;
    var _sideNotes = [];      // array of { id, text, done }
    var _notesSaveTimer = null;
    var _codeUndoStack = [];
    var _codeRedoStack = [];
    var MAX_LIVE_HIGHLIGHT_CHARS = 30000;
    function _isCodeFile(f) { return !!(f && CODE_TYPES[f.type]); }

    /* ── WHICH PROJECT DOES THIS FILE LIVE IN? ───────────────────
       Added 2026-09-17.

       A file opened through a symlink is resolved to the REAL
       document before it reaches the editor, and carries
       _overridePid pointing at the source project — see the SYMLINK
       RESOLUTION block in openFile() over in scribble-project-app.js.
       window._projectId is the project in the URL, which for a linked
       file is the wrong one.

       getFileContent, saveFileContent, saveVersion and listVersions
       all take an overridePid and the save path passed it correctly.
       Side notes, the internal-link copier and the exporter did not,
       and all three had the same consequence: reading and writing a
       document in a project that does not contain it. */
    function _fileProjectId(f) {
        return (f && f._overridePid) || window._projectId;
    }

    // One-time migration for files saved BEFORE code-mode existed — their
    // stored content is old rich-text markup (<p>&lt;tag&gt;</p> per line)
    // instead of plain raw text. Detected by the exact signature our old
    // paste/rich-text handler always produced; safe to parse as HTML here
    // specifically BECAUSE that old format already escaped every real "<"
    // in the code as "&lt;" when it was first saved.
    function _migrateLegacyCodeContent(raw) {
        // Just check for the old <p>-wrapped shape — don't require &lt; too.
        // CSS/JS files often have zero < or > characters to ever need
        // escaping in the first place, so that extra condition was letting
        // legacy CSS/JS slip through unconverted.
        if (!raw || raw.indexOf('<p') !== 0) return raw;
        var tmp = document.createElement('div');
        tmp.innerHTML = raw;
        return _plainTextForCounting(tmp);
    }
    function isActiveFileCode() {

        var f = openFiles.find(function(x) { return x.id === activeFileId; });

        return _isCodeFile(f);

    }

    function getActiveFileType() {

        var f = openFiles.find(function(x) { return x.id === activeFileId; });

        return f ? f.type : null;

    }

    function _escName(s) {

        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    }

    function initElements() {

    if (!overlayEl) overlayEl = document.getElementById('editor-overlay');

    if (!minimizedTabEl) minimizedTabEl = document.getElementById('editor-minimized-tab');

    if (!tabsContainerEl) tabsContainerEl = document.getElementById('editor-tabs');

    if (!textareaEl) textareaEl = document.getElementById('editor-textarea');

    if (!countEl) countEl = document.getElementById('open-file-count');

    if (!lineNumbersEl) lineNumbersEl = document.getElementById('line-numbers');

    initTheme(); // ← add this

}

    function openFileInEditor(fileObj) {

        initElements();

        

        var existing = openFiles.find(f => f.id === fileObj.id);

        if (!existing) {

            fileObj.content = "Loading..."; 

            openFiles.push(fileObj);

            

            if (window.EDITOR_FB) {
                window.EDITOR_FB.getFileContent(fileObj.id, fileObj._overridePid).then(function(text) {

                    var f = openFiles.find(x => x.id === fileObj.id);

                    if (f) {

                        f.content = text;

                        if (activeFileId === fileObj.id) {

                            if (_isCodeFile(f)) {
                                textareaEl.textContent = _migrateLegacyCodeContent(text);
                                _codeUndoStack = [{ text: textareaEl.innerText, caret: null }];
                                _codeRedoStack = [];
                                highlightCode();
                                validateCode();
                            } else {

                                textareaEl.innerHTML = text;

                            }

                            _restoreEditorStyle(f);

                            updateLineNumbers();

                        }

                    }

                });

            }
        }

        activeFileId = fileObj.id;

        maximizeEditor();

        renderTabs();

        loadActiveContent();

    }

    function renderTabs() {

        if (openFiles.length === 0) {

            closeAllFiles();

            return;

        }

        var html = '';

        openFiles.forEach(function(f) {

            var isActive = (f.id === activeFileId) ? 'active' : '';

            html += '<div class="editor-tab ' + isActive + '" draggable="true" data-id="' + f.id + '" onclick="window.EDITOR_APP.switchTab(\'' + f.id + '\')" oncontextmenu="event.preventDefault();window.EDITOR_APP.showTabMenu(event,\'' + f.id + '\')">' +

        (f._symlinkDisplayName
            ? '<i class="fa-solid fa-link" style="font-size:9px;opacity:0.6;"></i> ' + _escName(f._symlinkDisplayName)
            : '<i class="fa-regular fa-file"></i> ' + _escName(f.name)) + 

        ' <span class="editor-tab-close" onclick="event.stopPropagation(); window.EDITOR_APP.closeTab(\'' + f.id + '\')"><i class="fa-solid fa-xmark"></i></span>' +

        '</div>';

        });

        tabsContainerEl.innerHTML = html;

        countEl.innerText = openFiles.length;

        initDragTabs();

        /* Every tab mutation — open, close, switch, reorder — funnels
           through here, so this single line keeps the cross-page strip
           in step without hooking four separate call sites.
           Names and ids only; content is never written to storage. */
        if (window.SCRIBBLE_TABS) {
            /* Virtual files excluded 2026-09-17 — a version preview is a
               snapshot in memory, not a document anyone can reopen. See
               openVersionPreview(). */
            window.SCRIBBLE_TABS.save(
                openFiles.filter(function(f) { return !f._virtual; }),
                activeFileId, window._projectId);
        }

    }

    function switchTab(id) {

        hideTabMenu();

        forceSave(); 

        activeFileId = id;

        renderTabs();

        loadActiveContent();
    }

    function closeTab(id) {

    var f = openFiles.find(f => f.id === id);

    var name = f ? f.name : 'this file';

    showConfirm(

        'Close ' + name + '?',

        'Your work is auto-saved.',

        function() {

            forceSave();

            openFiles = openFiles.filter(f => f.id !== id);

            if (openFiles.length > 0) {

                if (activeFileId === id) {

                    activeFileId = openFiles[openFiles.length - 1].id;

                }

                renderTabs();

                loadActiveContent();
            } else {

                _closeAllSilent();

            }

        }

    );

}

    function loadActiveContent() {
    var f = openFiles.find(x => x.id === activeFileId);

    // Kill any pending highlight/validate cycle from the PREVIOUS file —

    // this is exactly the bug that caused the JSON/HTML dancing before:

    // a stale timer firing later against whatever file is now active.

    clearTimeout(highlightTimer);

    clearTimeout(validateTimer);

    var winEl = document.querySelector('.editor-window');

    if (f) {

        var codeMode = _isCodeFile(f);

        if (winEl) winEl.classList.toggle('code-mode', codeMode);

        if (codeMode) {
            textareaEl.textContent = _migrateLegacyCodeContent(f.content || '');
        } else {

            textareaEl.innerHTML = f.content || '';
            _restoreEditorStyle(f);

        }

        updateLineNumbers();

        refreshVersionIndicator();

        if (codeMode) {
            _codeUndoStack = [{ text: textareaEl.innerText, caret: null }];
            _codeRedoStack = [];
            highlightCode(); validateCode();
        }
        else { hideCodeProblemsBar(); }

        if (_sideNotesOpen) _loadSideNotes();

       }

    }

    function handleInput() {

    var f = openFiles.find(x => x.id === activeFileId);

    if (f) {

        if (_isCodeFile(f)) {

            f.content = textareaEl.innerText;

        } else if (_searchMatches.length > 0) {
            // Save a clean clone — never persist <mark> tags

            var clone = textareaEl.cloneNode(true);

            clone.querySelectorAll('mark.s-hl').forEach(function(m) {

                m.parentNode.replaceChild(document.createTextNode(m.textContent), m);

            });

            f.content = clone.innerHTML;

            // Marks are now stale — reset nav

            _searchMatches = [];

            _searchCurrent = -1;

            _updateSearchNav();

            var r = document.getElementById('search-result');

            if (r) { r.textContent = 'Re-run search'; r.style.color = '#B0AEAB'; }

        } else {

            f.content = textareaEl.innerHTML;

        }

    }

        updateLineNumbers();

    clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(forceSave, 2000);

    if (f && _isCodeFile(f)) {
        if (f.content && f.content.length > MAX_LIVE_HIGHLIGHT_CHARS) {
            // Large file — re-coloring/re-checking on every edit is what
            // was locking up the tab. Skip it; typing stays fast, coloring
            // just won't live-update until you reopen the file.
            _codeIssues = [{ type: 'warning', line: null,
                message: 'Large file (' + f.content.length + ' chars) — live coloring & checking paused for performance.' }];
            _updateCodeProblemsBar();
        } else {
            clearTimeout(highlightTimer);
            clearTimeout(validateTimer);
            highlightTimer = setTimeout(highlightCode, 450);
            validateTimer  = setTimeout(validateCode, 350);
        }
    }

    }

    function forceSave() {

        if (!activeFileId) return;

        var f = openFiles.find(x => x.id === activeFileId);

        if (f && window.EDITOR_FB) {

            window.EDITOR_FB.saveFileContent(f.id, f.content, f._overridePid).then(function(ok) {

                _showSaveStatus(ok);

            });

        }

    }

    function _showSaveStatus(success) {

        var el = document.getElementById('editor-save-status');

        if (!el) return;

        el.style.display = success ? 'none' : 'flex';

    }

    function exportActiveFile() {

        var f = openFiles.find(x => x.id === activeFileId);

        if (!f) return;

        forceSave(); // make sure the export includes the latest edits

        if (window.SCRIBBLE_EXPORT) window.SCRIBBLE_EXPORT.openExportModal(f);

    }

    // Block-level tags whose boundary counts as one line break. Walking the

    // DOM and inserting exactly one '\n' per boundary avoids a browser quirk:

    // textareaEl.innerText renders each block's CSS margin as an *extra*

    // blank line, so a single Enter (which inserts one <p>) was being counted

    // as two lines whenever that block has a non-zero margin (e.g. the

    // `#editor-textarea p { margin: 2px 0; }` rule) — hence the gutter

    // jumping by 2 per keystroke instead of 1.

    var LINE_BLOCK_TAGS = { P:1, DIV:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, LI:1, BLOCKQUOTE:1, TR:1 };

    function _plainTextForCounting(root) {

        var lines = [];

        var current = '';

        function walk(node) {

            node.childNodes.forEach(function(child) {

                if (child.nodeType === 3) {

                    current += child.textContent;

                } else if (child.nodeType === 1) {

                    if (child.tagName === 'BR') {

                        // Only flush if there's real unflushed text — an empty

                        // <br> (the placeholder a fresh blank paragraph gets)

                        // would otherwise get pushed here AND again when its

                        // parent <p> closes right after, double-counting it.

                        if (current !== '') { lines.push(current); current = ''; }

                        return;

                    }

                    walk(child);

                    if (LINE_BLOCK_TAGS[child.tagName]) { lines.push(current); current = ''; }

                }

            });

        }

        walk(root);

        lines.push(current);

        return lines.join('\n');

    }

    function updateLineNumbers() {

    if (!textareaEl || !lineNumbersEl) return;

    var text = _plainTextForCounting(textareaEl);

    if (text.endsWith('\n')) text = text.slice(0, -1);

    var lines = text.split('\n').length || 1;

    var html = '';

    for (var i = 1; i <= lines; i++) {

        html += '<div>' + i + '</div>';

    }

    lineNumbersEl.innerHTML = html;

    // status bar

    var words = (text.trim().match(/\S+/g) || []).length;

    var chars = text.length;

    var bytes = new Blob([text]).size;

    var size  = bytes < 1024

        ? bytes + ' B'

        : bytes < 1048576

            ? (bytes / 1024).toFixed(1) + ' KB'

            : (bytes / 1048576).toFixed(2) + ' MB';

    var lcEl = document.getElementById('editor-line-count');

    var wcEl = document.getElementById('editor-word-count');

    var ccEl = document.getElementById('editor-char-count');

    var szEl = document.getElementById('editor-file-size');

    if (lcEl) lcEl.innerText = lines + (lines === 1 ? ' line'  : ' lines');

    if (wcEl) wcEl.innerText = words + (words === 1 ? ' word'  : ' words');

    if (ccEl) ccEl.innerText = chars + (chars === 1 ? ' char'  : ' chars');

    if (szEl) szEl.innerText = size;

}

    function minimizeEditor() {

        overlayEl.style.display = 'none';

        minimizedTabEl.style.display = 'flex';

    }

    function maximizeEditor() {

        overlayEl.style.display = 'flex';

        minimizedTabEl.style.display = 'none';

    }

    function closeAllFiles() {

    if (openFiles.length === 0) { _closeAllSilent(); return; }

    showConfirm(

        'Close all files?',

        'All ' + openFiles.length + ' open file' + (openFiles.length > 1 ? 's' : '') + ' will be closed.',

        function() { _closeAllSilent(); }

    );

}

function _closeAllSilent() {

    forceSave();

    /* renderTabs() short-circuits on an empty list and never reaches
       its save, so the strip would otherwise keep showing tabs that
       are no longer open anywhere. */
    if (window.SCRIBBLE_TABS) window.SCRIBBLE_TABS.clear();

    openFiles = [];

    activeFileId = null;

    overlayEl.style.display = 'none';

    minimizedTabEl.style.display = 'none';

    }

    function toggleWrap() {

    textareaEl.classList.toggle('wrap');

    textareaEl.dispatchEvent(new Event('input'));

}

function toggleTheme() {

    var win = document.querySelector('.editor-window');

    var isDark = win.classList.toggle('dark');

    var btn = document.getElementById('theme-toggle-btn');

    if (btn) btn.innerHTML = isDark

        ? '<i class="fa-solid fa-sun"></i>'

        : '<i class="fa-solid fa-moon"></i>';

    localStorage.setItem('scribble-editor-theme', isDark ? 'dark' : 'light');

}

function initTheme() {

    if (localStorage.getItem('scribble-editor-theme') === 'dark') {

        document.querySelector('.editor-window').classList.add('dark');

        var btn = document.getElementById('theme-toggle-btn');

        if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i>';

    }

}

function showConfirm(title, message, onAccept, actionLabel) {

    var backdrop = document.getElementById('editor-confirm-backdrop');

    document.getElementById('editor-confirm-title').innerText = title;

    document.getElementById('editor-confirm-message').innerText = message;

    document.getElementById('editor-confirm-action-btn').innerText = actionLabel || 'Close';

    _confirmCallback = onAccept;

    backdrop.style.display = 'flex';

}

function cancelConfirm() {

    document.getElementById('editor-confirm-backdrop').style.display = 'none';

    _confirmCallback = null;

}

function acceptConfirm() {

    document.getElementById('editor-confirm-backdrop').style.display = 'none';

    if (typeof _confirmCallback === 'function') _confirmCallback();

    _confirmCallback = null;

}

function initDragTabs() {

    var tabs = tabsContainerEl.querySelectorAll('.editor-tab');

    tabs.forEach(function(tab) {

        tab.addEventListener('dragstart', function(e) {

            _draggedId = this.dataset.id;

            e.dataTransfer.effectAllowed = 'move';

            setTimeout(() => this.classList.add('dragging'), 0);

        });

        tab.addEventListener('dragend', function() {

            this.classList.remove('dragging');

            tabs.forEach(t => t.classList.remove('drag-over'));

        });

        tab.addEventListener('dragover', function(e) {

            e.preventDefault();

            e.dataTransfer.dropEffect = 'move';

            tabs.forEach(t => t.classList.remove('drag-over'));

            if (this.dataset.id !== _draggedId) this.classList.add('drag-over');

        });

        tab.addEventListener('dragleave', function() {

            this.classList.remove('drag-over');

        });

        tab.addEventListener('drop', function(e) {

            e.preventDefault();

            var targetId = this.dataset.id;

            if (!_draggedId || _draggedId === targetId) return;

            var fromIndex = openFiles.findIndex(f => f.id === _draggedId);

            var toIndex   = openFiles.findIndex(f => f.id === targetId);

            var moved = openFiles.splice(fromIndex, 1)[0];

            openFiles.splice(toIndex, 0, moved);

            _draggedId = null;

            renderTabs();

        });

    });

}

function format(command, value) {

    document.execCommand(command, false, value || null);

    textareaEl.focus();

}

function applyFont(fontName) {

    textareaEl.style.fontFamily = fontName;

    lineNumbersEl.style.fontFamily = fontName;

    document.execCommand('fontName', false, fontName);

    textareaEl.focus();

    /* .style sets the CONTAINER's attribute, but saving stores
       textareaEl.innerHTML — the children only. The container's own font
       was never written anywhere, which is why it reset on every reload.
       Persist it as file metadata instead. */
    _persistEditorStyle({ fontFamily: fontName });

}

/* Font and size are per-file display settings, not content — they live
   as fields on the file document alongside `content`. */
function _persistEditorStyle(patch) {
    var f = openFiles.find(function(x) { return x.id === activeFileId; });
    if (!f) return;
    Object.assign(f, patch);
    if (window.EDITOR_FB && typeof window.EDITOR_FB.saveEditorStyle === 'function') {
        window.EDITOR_FB.saveEditorStyle(activeFileId, patch, f._overridePid)
            .catch(function() {});
    }
}

/* Reapplied whenever a file opens, so the choice survives a refresh. */
function _restoreEditorStyle(f) {
    if (!textareaEl || !f) return;

    var fam = f.fontFamily || '';
    var px  = f.fontSize ? (f.fontSize + 'px') : '';

    textareaEl.style.fontFamily = fam;
    if (lineNumbersEl) lineNumbersEl.style.fontFamily = fam;

    if (px) {
        textareaEl.style.fontSize = px;
        if (lineNumbersEl) lineNumbersEl.style.fontSize = px;
        var win = document.querySelector('.editor-window');
        if (win) win.style.setProperty('--editor-font-size', px);
    }
}

function insertBulletList() {

    var sel = window.getSelection();

    if (!sel || !sel.rangeCount) return;

    if (sel.isCollapsed) {

        // Bound the selection to just the current line first,

        // so execCommand can't swallow everything after the cursor

        sel.modify('move', 'backward', 'lineboundary');

        sel.modify('extend', 'forward', 'lineboundary');

    }

    document.execCommand('insertUnorderedList');

    updateLineNumbers();

    handleInput();

    textareaEl.focus();

}

function insertNumberedList() {

    var sel = window.getSelection();

    if (!sel || !sel.rangeCount) return;

    if (sel.isCollapsed) {

        sel.modify('move', 'backward', 'lineboundary');

        sel.modify('extend', 'forward', 'lineboundary');

    }

    document.execCommand('insertOrderedList');

    updateLineNumbers();

    handleInput();

    textareaEl.focus();

}

function insertTaskList() {

    var selection = window.getSelection();

    var selectedText = selection ? selection.toString() : '';

    if (selectedText) {

        var items = selectedText

            .split('\n')

            .filter(function(l) { return l.trim(); })

            .map(function(line) {

                return '<li class="task-item"><input type="checkbox" class="task-checkbox">&nbsp;' + line + '</li>';

            })

            .join('');

        document.execCommand('insertHTML', false, '<ul class="task-list">' + items + '</ul>');

    } else {

        document.execCommand('insertHTML', false,

            '<ul class="task-list"><li class="task-item"><input type="checkbox" class="task-checkbox">&nbsp;</li></ul>'

        );

    }

    // explicitly park the cursor inside the last task item so backspace finds it

    var allLists = textareaEl.querySelectorAll('.task-list');

    var lastList = allLists[allLists.length - 1];

    if (lastList) {

        var lastItem = lastList.lastElementChild;

        if (lastItem) {

            var range = document.createRange();

            range.selectNodeContents(lastItem);

            range.collapse(false);

            var sel = window.getSelection();

            sel.removeAllRanges();

            sel.addRange(range);

        }

    }

    textareaEl.focus();

}

function applyFontSize(size) {

    var px = size + 'px';

    textareaEl.style.fontSize = px;

    lineNumbersEl.style.fontSize = px;

    // update the CSS variable so line number div heights recalculate

    document.querySelector('.editor-window').style.setProperty('--editor-font-size', px);

    _persistEditorStyle({ fontSize: size });

    updateLineNumbers();

    textareaEl.focus();

}

function toggleHighlightPicker(e) {

    e.stopPropagation();

    var grid = document.getElementById('highlight-picker-grid');

    grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';

}

function applyHighlight(color) {

    document.getElementById('highlight-picker-grid').style.display = 'none';

    // update the icon tint to show last used color

    var icon = document.getElementById('highlight-icon');

    if (icon) {

        icon.style.color = color === 'transparent' ? '#B0AEAB' : color;

        icon.style['-webkit-text-stroke'] = color === 'transparent' ? 'none' : '1px #ccc';

    }

    document.execCommand('hiliteColor', false, color);

    textareaEl.focus();

}

function showTabMenu(e, id) {

    hideTabMenu();

    var f    = openFiles.find(function(f) { return f.id === id; });

    if (!f) return;

    var idx      = openFiles.findIndex(function(f) { return f.id === id; });

    var canLeft  = idx > 0;

    var canRight = idx < openFiles.length - 1;

    var hasOthers = openFiles.length > 1;

    var menu = document.createElement('div');

    menu.className = 'tab-ctx-menu';

    menu.innerHTML =

        '<div class="tab-ctx-header"><i class="fa-regular fa-file"></i> ' + f.name + '</div>' +

        '<div class="tab-ctx-divider"></div>' +

        '<div class="tab-ctx-item" onclick="window.EDITOR_APP.hideTabMenu();window.EDITOR_APP.closeTab(\'' + id + '\')">' +

            '<i class="fa-solid fa-xmark"></i> Close Tab</div>' +

        '<div class="tab-ctx-item' + (!hasOthers ? ' disabled' : '') + '" onclick="window.EDITOR_APP.closeOtherTabs(\'' + id + '\')">' +

            '<i class="fa-solid fa-table-columns"></i> Close Others</div>' +

        '<div class="tab-ctx-item" onclick="window.EDITOR_APP.hideTabMenu();window.EDITOR_APP.closeAllFiles()">' +

            '<i class="fa-solid fa-rectangle-xmark"></i> Close All</div>' +

        '<div class="tab-ctx-divider"></div>' +

        '<div class="tab-ctx-item' + (!canLeft  ? ' disabled' : '') + '" onclick="window.EDITOR_APP.moveTabLeft(\'' + id + '\')">' +

            '<i class="fa-solid fa-arrow-left"></i> Move Left</div>' +

        '<div class="tab-ctx-item' + (!canRight ? ' disabled' : '') + '" onclick="window.EDITOR_APP.moveTabRight(\'' + id + '\')">' +

            '<i class="fa-solid fa-arrow-right"></i> Move Right</div>';

    document.body.appendChild(menu);

    // smart positioning so it never clips off screen

    var x = e.clientX, y = e.clientY;

    if (x + 190 > window.innerWidth)  x = window.innerWidth  - 196;

    if (y + 180 > window.innerHeight) y = window.innerHeight - 186;

    menu.style.left = x + 'px';

    menu.style.top  = y + 'px';

    _tabCtxMenu = menu;

}

function hideTabMenu() {

    if (_tabCtxMenu) { _tabCtxMenu.remove(); _tabCtxMenu = null; }

}

function closeOtherTabs(id) {

    hideTabMenu();

    var others = openFiles.filter(function(f) { return f.id !== id; });

    if (!others.length) return;

    showConfirm(

        'Close other tabs?',

        'Your work is auto-saved. Close ' + others.length + ' other file' + (others.length > 1 ? 's' : '') + '?',

        function() {

            openFiles = openFiles.filter(function(f) { return f.id === id; });

            activeFileId = id;

            renderTabs();

            loadActiveContent();

            _syncFileMode();

        }

    );

}

function moveTabLeft(id) {

    hideTabMenu();

    var idx = openFiles.findIndex(function(f) { return f.id === id; });

    if (idx <= 0) return;

    var moved = openFiles.splice(idx, 1)[0];

    openFiles.splice(idx - 1, 0, moved);

    renderTabs();

}

function moveTabRight(id) {

    hideTabMenu();

    var idx = openFiles.findIndex(function(f) { return f.id === id; });

    if (idx >= openFiles.length - 1) return;

    var moved = openFiles.splice(idx, 1)[0];

    openFiles.splice(idx + 1, 0, moved);

    renderTabs();

}

var _styleLabels = {

    'h1': 'Title', 'h2': 'Subtitle', 'h3': 'Heading',

    'h4': 'Subheading', 'h5': 'Section', 'h6': 'Subsection',

    'blockquote': 'Quote', 'p': 'Body'

};

function applyTextStyle(tag) {

    document.execCommand('formatBlock', false, tag);

    var label = document.getElementById('style-picker-label');

    if (label) label.innerText = _styleLabels[tag] || 'Body';

    document.querySelectorAll('.style-picker-item').forEach(function(item) {

        item.classList.toggle('active', item.dataset.tag === tag);

    });

    var dropdown = document.getElementById('style-picker-dropdown');

    if (dropdown) dropdown.style.display = 'none';

    textareaEl.focus();

}

function toggleStylePicker(e) {

    e.stopPropagation();

    var dropdown = document.getElementById('style-picker-dropdown');

    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';

}

function formatCode() {

    var text = textareaEl.innerText || '';

    var cleaned = text

        .split('\n')

        .map(function(l) { return l.trimEnd(); })

        .join('\n')

        .replace(/\n{3,}/g, '\n\n')

        .trim();

    textareaEl.innerHTML = cleaned.split('\n').map(function(line) {

        return '<p>' + (line || '<br>') + '</p>';

    }).join('');

    updateLineNumbers();

    handleInput();

    showLintPanel([{ type: 'success', line: 0, message: 'Text cleaned up — trailing spaces and extra blank lines removed.' }]);

}

function lintCode() {

    var text    = textareaEl.innerText || '';

    var results = [];

    // 1. Double spaces

    var doubleSpaces = (text.match(/  +/g) || []).length;

    if (doubleSpaces) {

        results.push({ type: 'warning', line: 0,

            message: doubleSpaces + ' double space(s) found — run Auto-Format to clean.' });

    }

    // 2. Repeated consecutive words (e.g. "the the", "is is")

    var repeats = text.match(/\b(\w+)\s+\1\b/gi) || [];

    repeats.forEach(function(r) {

        results.push({ type: 'error', line: 0, message: 'Repeated word detected: "' + r + '"' });

    });

    // 3. Sentences over 50 words (hard to read)

    var sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; });

    sentences.forEach(function(s) {

        var wc = s.trim().split(/\s+/).length;

        if (wc > 50) {

            results.push({ type: 'warning', line: 0,

                message: 'Long sentence (' + wc + ' words) — consider breaking it up.' });

        }

    });

    // 4. Lowercase letter after a sentence-ending punctuation

    var lowerAfterPeriod = (text.match(/[.!?]\s+[a-z]/g) || []).length;

    if (lowerAfterPeriod) {

        results.push({ type: 'warning', line: 0,

            message: lowerAfterPeriod + ' sentence(s) may start with a lowercase letter.' });

    }

    // 5. Basic word + sentence count summary

    var wordCount     = (text.trim().match(/\S+/g) || []).length;

    var sentenceCount = sentences.length;

    results.push({ type: 'info', line: 0,

        message: wordCount + ' words · ' + sentenceCount + ' sentences' });

    if (results.length === 1) results.unshift({ type: 'success', line: 0, message: 'No writing issues found!' });

    showLintPanel(results);

}

function showLintPanel(results) {

    var panel = document.getElementById('lint-panel');

    if (!panel) return;

    var icons = { error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', success: 'fa-circle-check', info: 'fa-circle-info' };

    panel.innerHTML =

        '<div class="lint-panel-header"><span>Diagnostics</span>' +

        '<button class="lint-close" onclick="document.getElementById(\'lint-panel\').style.display=\'none\'"><i class="fa-solid fa-xmark"></i></button></div>' +

        results.map(function(r) {

            var lineStr = r.line > 0 ? 'Line ' + r.line + (r.col ? ':' + r.col : '') + ' — ' : '';

            return '<div class="lint-item lint-' + r.type + '"><i class="fa-solid ' + (icons[r.type] || 'fa-circle-info') + ' lint-icon"></i><span>' + lineStr + r.message + '</span></div>';

        }).join('');

    panel.style.display = 'block';

}

/* ══════════════════════════════════════════════════════
   GRAMMAR CHECK — THE ONE THING THAT LEAVES THE DEVICE
   ══════════════════════════════════════════════════════
   Added 2026-09-17.

   checkGrammar() POSTs the WHOLE document to
   api.languagetool.org — a third party, over HTTPS, and
   nothing to do with Firebase. It has always done this and
   nothing in the interface ever said so.

   Everything else in Scribble is either local or goes to
   your own Firestore, so the reasonable assumption about a
   button in this toolbar is that your writing stays put.
   This one is the exception, and an exception is worth one
   question.

   Asked ONCE and remembered. A prompt on every check would
   train you to click straight through it, which is worse
   than not asking at all.

   To be asked again:
     localStorage.removeItem('scribble-grammar-consent')
   To switch the feature off entirely, remove its toolbar
   button — nothing else calls this.
══════════════════════════════════════════════════════ */
var GRAMMAR_CONSENT_KEY = 'scribble-grammar-consent';

function _grammarConsent() {
    try {
        if (localStorage.getItem(GRAMMAR_CONSENT_KEY) === 'yes') return true;
    } catch (e) {
        /* Storage blocked (private window). Ask every time rather than
           never — the wrong default here sends text without consent. */
    }

    var ok = confirm(
        'Grammar check sends this document to LanguageTool.\n\n' +
        'The full text of this file leaves your device over HTTPS and is ' +
        'checked by languagetool.org, which is a third party. Nothing ' +
        'else in Scribble sends your writing anywhere.\n\n' +
        'Send it? You will only be asked once.'
    );
    if (!ok) return false;

    try { localStorage.setItem(GRAMMAR_CONSENT_KEY, 'yes'); } catch (e) {}
    return true;
}

async function checkGrammar() {

    var text = textareaEl.innerText || '';

    if (!text.trim()) {

        showLintPanel([{ type: 'info', line: 0, message: 'Nothing to check — write something first!' }]);

        return;

    }

    /* Asked before a single byte goes out, and after the empty-text
       check so an accidental click on a blank file never prompts. */
    if (!_grammarConsent()) {
        showLintPanel([{ type: 'info', line: 0,
            message: 'Not sent. Grammar check needs to upload the document to languagetool.org.' }]);
        return;
    }

    // Show loading state

    var btn = document.getElementById('grammar-check-btn');

    if (btn) { btn.classList.add('tool-btn-active'); btn.title = 'Checking…'; }

    showLintPanel([{ type: 'info', line: 0, message: 'Checking grammar via LanguageTool…' }]);

    try {

        var response = await fetch('https://api.languagetool.org/v2/check', {

            method: 'POST',

            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

            body: 'text=' + encodeURIComponent(text) + '&language=en-US'

        });

        if (!response.ok) throw new Error('Server error ' + response.status);

        var data = await response.json();

        var matches = data.matches || [];

        var results = [];

        if (!matches.length) {

            results.push({ type: 'success', line: 0, message: 'No grammar issues found — great writing!' });

        } else {

            matches.forEach(function(m) {

                var suggestions = m.replacements && m.replacements.length

                    ? '  →  ' + m.replacements.slice(0, 3).map(function(r) { return '"' + r.value + '"'; }).join(', ')

                    : '';

                var snippet = m.context && m.context.text

                    ? '  [near: "' + m.context.text.trim().substring(0, 50) + (m.context.text.length > 50 ? '…' : '') + '"]'

                    : '';

                var issueType = m.rule && m.rule.issueType === 'misspelling' ? 'error' : 'warning';

                results.push({ type: issueType, line: 0, message: m.message + suggestions + snippet });

            });

            results.push({ type: 'info', line: 0, message: matches.length + ' issue(s) found' });

        }

        showLintPanel(results);

    } catch(err) {

        showLintPanel([{ type: 'error', line: 0, message: 'Grammar check failed — check your connection and try again.' }]);

    } finally {

        if (btn) { btn.classList.remove('tool-btn-active'); btn.title = 'Grammar Check'; }

    }

}

function openSearch() {

    var panel = document.getElementById('search-panel');

    if (!panel) return;

    panel.style.display = 'flex';

    var input = document.getElementById('search-input');

    if (input) {

        input.focus();

        input.select();

        input.style.height = 'auto';

        input.style.height = input.scrollHeight + 'px';

    }

}

function closeSearch() {

    var panel = document.getElementById('search-panel');

    if (panel) panel.style.display = 'none';

    _clearSearchHighlights();

    _searchMatches = [];

    _searchCurrent = -1;

    textareaEl.focus();

}

function _clearSearchHighlights() {

    textareaEl.querySelectorAll('mark.s-hl').forEach(function(m) {

        var parent = m.parentNode;

        while (m.firstChild) parent.insertBefore(m.firstChild, m);

        parent.removeChild(m);

    });

    textareaEl.normalize();

}

function runSearch() {

    _clearSearchHighlights();

    _searchMatches = [];

    _searchCurrent = -1;

    var query         = document.getElementById('search-input').value;

    var caseSensitive = document.getElementById('search-case-btn').classList.contains('active');

    var wholeWord     = document.getElementById('search-word-btn').classList.contains('active');

    var useRegex      = document.getElementById('search-regex-btn').classList.contains('active');

    var resultEl      = document.getElementById('search-result');

    if (!query) {

        if (resultEl) { resultEl.textContent = ''; resultEl.style.color = ''; }

        _updateSearchNav();

        return;

    }

    // Step 1: Build flat text + segment map in one walk.

    // This is the key fix — we see the WHOLE document as one string,

    // so multiline queries can match across paragraph boundaries.

    var flatText = '';

    var segments = []; // { node, start, end }

    (function walk(node) {

        if (node.nodeType === 3) { // text node

            segments.push({ node: node, start: flatText.length, end: flatText.length + node.textContent.length });

            flatText += node.textContent;

        } else if (node.nodeType === 1) {

            if (node.nodeName === 'BR') { flatText += '\n'; return; }

            Array.from(node.childNodes).forEach(walk);

            if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(node.nodeName) && node !== textareaEl) {

                flatText += '\n';

            }

        }

    })(textareaEl);

    // Step 2: Build the regex against the full flat string

    var isML  = query.indexOf('\n') !== -1;

    var flags = 'g' + (caseSensitive ? '' : 'i');

    var pattern;

    try {

        if (useRegex) {

            pattern = new RegExp(query, flags);

        } else {

            var esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (wholeWord && !isML) esc = '\\b' + esc + '\\b';

            pattern = new RegExp(esc, flags);

        }

    } catch(e) {

        if (resultEl) { resultEl.textContent = 'Invalid regex'; resultEl.style.color = '#C0392B'; }

        return;

    }

    // Step 3: Find all match ranges in the flat string

    var ranges = [];

    var m;

    pattern.lastIndex = 0;

    while ((m = pattern.exec(flatText)) !== null) {

        ranges.push([m.index, m.index + m[0].length]);

        if (m[0].length === 0) pattern.lastIndex++;

    }

    if (!ranges.length) {

        if (resultEl) { resultEl.textContent = 'No results'; resultEl.style.color = '#C0392B'; }

        _updateSearchNav();

        return;

    }

    // Step 4: Wrap each range in the DOM.

    // Process from last to first so earlier positions aren't shifted by splits.

    ranges.slice().reverse().forEach(function(range) {

        var mStart = range[0], mEnd = range[1];

        var firstMark = null;

        // Find text nodes that overlap this range

        var overlaps = segments.filter(function(s) {

            return s.end > mStart && s.start < mEnd;

        });

        // Process overlaps in reverse so tail-splits don't shift siblings

        overlaps.slice().reverse().forEach(function(seg) {

            var node = seg.node;

            if (!node.parentNode) return;

            var lStart = Math.max(0, mStart - seg.start);

            var lEnd   = Math.min(node.textContent.length, mEnd - seg.start);

            if (lStart >= lEnd) return;

            if (lEnd < node.textContent.length) node.splitText(lEnd);

            var matchNode = lStart > 0 ? node.splitText(lStart) : node;

            var mark = document.createElement('mark');

            mark.className = 's-hl';

            matchNode.parentNode.insertBefore(mark, matchNode);

            mark.appendChild(matchNode);

            firstMark = mark; // last assigned = earliest in document (we're going in reverse)

        });

        if (firstMark) _searchMatches.unshift(firstMark);

    });

    if (resultEl) { resultEl.textContent = ''; resultEl.style.color = ''; }

    if (_searchMatches.length > 0) { _searchCurrent = 0; _highlightCurrent(); }

    _updateSearchNav();

}

function _highlightCurrent() {

    _searchMatches.forEach(function(m, i) {

        m.classList.toggle('s-hl-current', i === _searchCurrent);

    });

    if (_searchMatches[_searchCurrent]) {

        _searchMatches[_searchCurrent].scrollIntoView({ block: 'center' });

    }

    var resultEl = document.getElementById('search-result');

    if (resultEl && _searchMatches.length > 0) {

        resultEl.textContent = (_searchCurrent + 1) + ' of ' + _searchMatches.length;

        resultEl.style.color = '';

    }

}

function searchNext() {

    if (!_searchMatches.length) return;

    _searchCurrent = (_searchCurrent + 1) % _searchMatches.length;

    _highlightCurrent();

}

function searchPrev() {

    if (!_searchMatches.length) return;

    _searchCurrent = (_searchCurrent - 1 + _searchMatches.length) % _searchMatches.length;

    _highlightCurrent();

}

function toggleSearchOption(btnId) {

    var btn = document.getElementById(btnId);

    if (btn) btn.classList.toggle('active');

    runSearch();

}

function toggleSearchReplace() {

    var row = document.getElementById('search-replace-row');

    var btn = document.getElementById('search-expand-btn');

    if (!row || !btn) return;

    var isOpen = row.style.display !== 'none';

    row.style.display = isOpen ? 'none' : 'flex';

    btn.classList.toggle('active', !isOpen);

}

function replaceOne() {

    if (_searchCurrent < 0 || !_searchMatches[_searchCurrent]) return;

    var replacement = document.getElementById('replace-input').value || '';

    var mark = _searchMatches[_searchCurrent];

    if (!mark || !mark.parentNode) return;

    // Clear selection first — prevents contenteditable from

    // double-writing at the old cursor position AND the mark

    var sel = window.getSelection();

    sel.removeAllRanges();

    // Swap the mark for a plain text node

    var textNode = document.createTextNode(replacement);

    mark.parentNode.replaceChild(textNode, mark);

    // Park cursor right after the replaced text

    var range = document.createRange();

    range.setStartAfter(textNode);

    range.collapse(true);

    sel.addRange(range);

    _searchMatches.splice(_searchCurrent, 1);

    if (!_searchMatches.length) {

        _searchCurrent = -1;

        var resultEl = document.getElementById('search-result');

        if (resultEl) { resultEl.textContent = 'Replaced'; resultEl.style.color = '#1dda59'; }

    } else {

        _searchCurrent = _searchCurrent % _searchMatches.length;

        _highlightCurrent();

    }

    handleInput();

    _updateSearchNav();

}

function replaceAll() {

    var replacement = document.getElementById('replace-input').value || '';

    _searchMatches.forEach(function(mark) {

        if (mark.parentNode) mark.parentNode.replaceChild(document.createTextNode(replacement), mark);

    });

    _searchMatches = [];

    _searchCurrent = -1;

    var resultEl = document.getElementById('search-result');

    if (resultEl) { resultEl.textContent = ''; resultEl.style.color = ''; }

    handleInput();

    _updateSearchNav();

}

function _updateSearchNav() {

    var has = _searchMatches.length > 0;

    var p = document.getElementById('search-prev-btn');

    var n = document.getElementById('search-next-btn');

    if (p) p.disabled = !has;

    if (n) n.disabled = !has;

}

function toggleLineNumbers() {

    var gutter = document.getElementById('line-numbers');

    var btn    = document.getElementById('line-numbers-btn');

    if (!gutter) return;

    var hidden = gutter.style.display === 'none';

    gutter.style.display = hidden ? '' : 'none';

    if (btn) btn.classList.toggle('tool-btn-active', !hidden);

}

function _countLines() {

    var t = textareaEl.innerText || '';

    if (t.endsWith('\n')) t = t.slice(0, -1);

    return t.split('\n').length || 1;

}

function openGotoLine() {

    var panel = document.getElementById('gotoline-panel');

    if (!panel) return;

    panel.style.display = 'flex';

    var input = document.getElementById('gotoline-input');

    if (input) { input.value = ''; input.focus(); }

    var hint = document.getElementById('gotoline-hint');

    if (hint) hint.textContent = 'of ' + _countLines() + ' lines';

}

function closeGotoLine() {

    var panel = document.getElementById('gotoline-panel');

    if (panel) panel.style.display = 'none';

    textareaEl.focus();

}

function previewGotoLine(val) {

    var total = _countLines();

    var hint  = document.getElementById('gotoline-hint');

    if (!hint) return;

    var n = parseInt(val, 10);

    if (!n || n < 1)    hint.textContent = 'of ' + total + ' lines';

    else if (n > total) hint.textContent = 'of ' + total + ' lines — max is ' + total;

    else                hint.textContent = 'of ' + total + ' lines';

}

function commitGotoLine() {

    var input = document.getElementById('gotoline-input');

    if (!input) return;

    // Use exact same counting as the gutter

    var rawText = textareaEl.innerText || '';

    if (rawText.endsWith('\n')) rawText = rawText.slice(0, -1);

    var lines  = rawText.split('\n');

    var total  = lines.length;

    var target = parseInt(input.value, 10);

    if (!target || target < 1) target = 1;

    if (target > total) target = total;

    // Char offset of the target line start within innerText

    var targetOffset = 0;

    for (var i = 0; i < target - 1; i++) targetOffset += lines[i].length + 1;

    // Walk the DOM mirroring how innerText builds its string:

    // text nodes → their text, BR → \n, block boundaries → \n (except before first block)

    var BLOCK = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|DETAILS)$/;

    var acc = 0, resultNode = null, resultOff = 0, firstBlock = true;

    (function walk(node) {

        if (resultNode) return;

        if (node.nodeType === Node.TEXT_NODE) {

            var len = node.textContent.length;

            if (acc + len >= targetOffset) {

                resultNode = node;

                resultOff  = targetOffset - acc;

            } else {

                acc += len;

            }

        } else if (node.nodeType === Node.ELEMENT_NODE) {

            if (node.nodeName === 'BR') {

                if (acc >= targetOffset) { resultNode = node; resultOff = 0; }

                else acc += 1;

                return;

            }

            // Block children of the editor each get a \n separator (after the first)

            if (BLOCK.test(node.nodeName) && node.parentNode === textareaEl) {

                if (!firstBlock) {

                    if (acc >= targetOffset) { resultNode = node; resultOff = 0; return; }

                    acc += 1;

                }

                firstBlock = false;

            }

            // Don't walk into non-editable summaries

            if (node.getAttribute && node.getAttribute('contenteditable') === 'false') return;

            Array.from(node.childNodes).forEach(walk);

        }

    })(textareaEl);

    // Fallback to last child if nothing found

    if (!resultNode) resultNode = textareaEl.lastElementChild || textareaEl;

    // Place cursor + scroll

    var sel = window.getSelection();

    var rng = document.createRange();

    try {

        if (resultNode.nodeType === Node.TEXT_NODE) {

            rng.setStart(resultNode, Math.min(resultOff, resultNode.length));

        } else if (resultNode !== textareaEl) {

            rng.setStartBefore(resultNode);

        } else {

            rng.setStart(resultNode, 0);

        }

        rng.collapse(true);

        sel.removeAllRanges();

        sel.addRange(rng);

        var scrollEl = resultNode.nodeType === Node.TEXT_NODE

            ? resultNode.parentElement : resultNode;

        if (scrollEl && scrollEl !== textareaEl) {

            scrollEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

        }

    } catch(e) {}

    closeGotoLine();

}

function toggleToolbar() {

    var row = document.querySelector('.toolbar-row-format');

    var btn = document.getElementById('toolbar-minimize-btn');

    if (!row || !btn) return;

    row.classList.toggle('toolbar-collapsed');

    btn.classList.toggle('collapsed');

    btn.title = row.classList.contains('toolbar-collapsed') ? 'Expand Toolbar' : 'Minimize Toolbar';

}

function toggleSpellCheck() {

    var isOn = textareaEl.spellcheck;

    textareaEl.spellcheck = !isOn;

    var btn = document.getElementById('spell-check-btn');

    if (btn) btn.classList.toggle('tool-btn-active', !isOn);

    textareaEl.focus();

}

function smartClearFormat() {

    var sel = window.getSelection();

    if (!sel || !sel.rangeCount) return;

    var range = sel.getRangeAt(0);

    // No selection — just remove inline formatting on current block

    if (range.collapsed) {

        document.execCommand('removeFormat');

        document.execCommand('formatBlock', false, 'p');

        _syncStyleLabel('p');

        textareaEl.focus();

        return;

    }

    // Use execCommand only — never deleteContents, preserves undo stack

    document.execCommand('removeFormat');

    document.execCommand('formatBlock', false, 'p');

    _syncStyleLabel('p');

    updateLineNumbers();

    textareaEl.focus();

}

function _syncStyleLabel(tag) {

    var label = document.getElementById('style-picker-label');

    if (label) label.innerText = _styleLabels[tag] || 'Body';

    document.querySelectorAll('.style-picker-item').forEach(function(item) {

        item.classList.toggle('active', item.dataset.tag === tag);

    });

}

function insertFoldable() {

    var selection = window.getSelection();

    var selectedText = selection ? selection.toString().trim() : '';

    var lines   = selectedText ? selectedText.split('\n') : [];

    var summary = lines.length > 0 ? lines[0] : 'Section';

    var body    = lines.length > 1 ? lines.slice(1).join('<br>') : '<br>';

    document.execCommand('insertHTML', false,

        '<details class="fold-block" open>' +

            '<summary class="fold-summary" contenteditable="false">' + summary + '</summary>' +

            '<div class="fold-content">' + body + '</div>' +

        '</details>'

    );

    // park cursor inside the fold content

    var folds = textareaEl.querySelectorAll('.fold-block');

    var last  = folds[folds.length - 1];

    if (last) {

        var content = last.querySelector('.fold-content');

        if (content) {

            var range = document.createRange();

            range.selectNodeContents(content);

            range.collapse(false);

            var sel = window.getSelection();

            sel.removeAllRanges();

            sel.addRange(range);

        }

    }

    updateLineNumbers();

    textareaEl.focus();

}

function toggleAllFolds() {

    var folds = textareaEl.querySelectorAll('.fold-block');

    if (!folds.length) return;

    var anyOpen = Array.from(folds).some(function(d) { return d.open; });

    folds.forEach(function(d) {

        d.open = !anyOpen;

    });

    _updateFoldToggleBtn(!anyOpen);

}

function _updateFoldToggleBtn(allOpen) {

    var btn = document.getElementById('fold-toggle-btn');

    if (!btn) return;

    if (allOpen) {

        btn.innerHTML = '<i class="fa-solid fa-angles-up"></i>';

        btn.title = 'Collapse All Folds';

    } else {

        btn.innerHTML = '<i class="fa-solid fa-angles-down"></i>';

        btn.title = 'Expand All Folds';

    }

}

function toggleColPicker(e) {

    e.stopPropagation();

    var grid = document.getElementById('col-picker-grid');

    grid.style.display = grid.style.display === 'none' ? 'flex' : 'none';

}

function insertColumns(n) {

    n = parseInt(n, 10) || 2;

    document.getElementById('col-picker-grid').style.display = 'none';

    var cells = '';

    for (var i = 0; i < n; i++) {

        cells += '<div class="col-cell" contenteditable="true"><p><br></p></div>';

    }

    document.execCommand('insertHTML', false,

        '<div class="col-block" contenteditable="false">' + cells + '</div>'

    );

    // Park cursor inside the first cell

    var blocks = textareaEl.querySelectorAll('.col-block');

    var last   = blocks[blocks.length - 1];

    if (last) {

        var firstCell = last.querySelector('.col-cell');

        if (firstCell) {

            var range = document.createRange();

            range.selectNodeContents(firstCell);

            range.collapse(false);

            var sel = window.getSelection();

            sel.removeAllRanges();

            sel.addRange(range);

        }

    }

    updateLineNumbers();

    textareaEl.focus();

}

function toggleTablePicker(e) {

    e.stopPropagation();

    var wrap = document.getElementById('table-picker-grid');

    var isOpen = wrap.style.display !== 'none';

    if (isOpen) {

        wrap.style.display = 'none';

    } else {

        _buildTableGrid();

        // Reset active state every time it opens

        document.querySelectorAll('#table-picker-cells .tpg-cell').forEach(function(c) {

            c.classList.remove('active');

        });

        var hint = document.getElementById('table-picker-hint');

        if (hint) hint.textContent = 'Insert Table';

        wrap.style.display = 'block';

    }

}

function _buildTableGrid() {

    var cells = document.getElementById('table-picker-cells');

    if (!cells || cells.dataset.built) return; // only build the DOM once

    var MAX = 5, html = '';

    for (var r = 1; r <= MAX; r++) {

        for (var c = 1; c <= MAX; c++) {

            html += '<div class="tpg-cell" data-r="' + r + '" data-c="' + c + '" ' +

                'onmouseenter="window.EDITOR_APP.hoverTableCell(' + r + ',' + c + ')" ' +

                'onclick="window.EDITOR_APP.insertTable(' + r + ',' + c + ')"></div>';

        }

    }

    cells.innerHTML = html;

    cells.dataset.built = '1';

}

function hoverTableCell(row, col) {

    document.querySelectorAll('#table-picker-cells .tpg-cell').forEach(function(cell) {

        cell.classList.toggle('active',

            parseInt(cell.dataset.r) <= row && parseInt(cell.dataset.c) <= col);

    });

    var hint = document.getElementById('table-picker-hint');

    if (hint) hint.textContent = row + ' × ' + col + ' — Insert Table';

}

function insertTable(rows, cols) {

    document.getElementById('table-picker-grid').style.display = 'none';

    var html = '<table class="tbl-block" contenteditable="false"><tbody>';

    for (var r = 0; r < rows; r++) {

        html += '<tr>';

        for (var c = 0; c < cols; c++) {

            var tag = r === 0 ? 'th' : 'td';

            html += '<' + tag + ' class="tbl-cell" contenteditable="true"><p><br></p></' + tag + '>';

        }

        html += '</tr>';

    }

    html += '</tbody></table>';

    document.execCommand('insertHTML', false, html);

    // Park cursor in the first cell

    var tables = textareaEl.querySelectorAll('.tbl-block');

    var last   = tables[tables.length - 1];

    if (last) {

        var firstCell = last.querySelector('.tbl-cell');

        if (firstCell) {

            var range = document.createRange();

            range.selectNodeContents(firstCell);

            range.collapse(false);

            var sel = window.getSelection();

            sel.removeAllRanges();

            sel.addRange(range);

        }

    }

    updateLineNumbers();

    textareaEl.focus();

}

// ═══════════════════════════════════════════════════

// TABLE CONTEXT MENU

// ═══════════════════════════════════════════════════

var _tableCtxMenu = null;

var _tableCtxCell = null;

function _getTable(cell) { return cell.closest('.tbl-block'); }

function _getCellColIndex(cell) { return Array.from(cell.parentElement.cells).indexOf(cell); }

function showTableMenu(e, cell) {

    hideTableMenu();

    _tableCtxCell = cell;

    var table   = _getTable(cell);

    var colIdx  = _getCellColIndex(cell);

    var rowIdx  = cell.parentElement.rowIndex;

    var cols    = table.rows[0] ? table.rows[0].cells.length : 1;

    var canColL = colIdx > 0;

    var canColR = colIdx < cols - 1;

    var canRowU = rowIdx > 0;

    var canRowD = rowIdx < table.rows.length - 1;

    var di = function(disabled) { return disabled ? ' disabled' : ''; };

    var menu = document.createElement('div');

    menu.className = 'table-ctx-menu';

    menu.innerHTML =

        '<div class="table-ctx-label">Column</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAddColLeft()">' +

            '<i class="fa-solid fa-left-right"></i> Add column to the left</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAddColRight()">' +

            '<i class="fa-solid fa-right-long"></i> Add column to the right</div>' +

        '<div class="table-ctx-item' + di(!canColL) + '" onclick="window.EDITOR_APP.tableMoveColLeft()">' +

            '<i class="fa-solid fa-arrow-left"></i> Move column left</div>' +

        '<div class="table-ctx-item' + di(!canColR) + '" onclick="window.EDITOR_APP.tableMoveColRight()">' +

            '<i class="fa-solid fa-arrow-right"></i> Move column right</div>' +

        '<div class="table-ctx-divider"></div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAlignCol(\'left\')">' +

            '<i class="fa-solid fa-align-left"></i> Align left</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAlignCol(\'center\')">' +

            '<i class="fa-solid fa-align-center"></i> Align center</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAlignCol(\'right\')">' +

            '<i class="fa-solid fa-align-right"></i> Align right</div>' +

        '<div class="table-ctx-divider"></div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableDuplicateCol()">' +

            '<i class="fa-regular fa-copy"></i> Duplicate column</div>' +

        '<div class="table-ctx-item danger" onclick="window.EDITOR_APP.tableDeleteCol()">' +

            '<i class="fa-solid fa-trash-can"></i> Delete column</div>' +

        '<div class="table-ctx-divider"></div>' +

        '<div class="table-ctx-label">Row</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAddRowAbove()">' +

            '<i class="fa-solid fa-arrow-up"></i> Add row above</div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableAddRowBelow()">' +

            '<i class="fa-solid fa-arrow-down"></i> Add row below</div>' +

        '<div class="table-ctx-item' + di(!canRowU) + '" onclick="window.EDITOR_APP.tableMoveRowUp()">' +

            '<i class="fa-solid fa-arrow-up"></i> Move row up</div>' +

        '<div class="table-ctx-item' + di(!canRowD) + '" onclick="window.EDITOR_APP.tableMoveRowDown()">' +

            '<i class="fa-solid fa-arrow-down"></i> Move row down</div>' +

        '<div class="table-ctx-divider"></div>' +

        '<div class="table-ctx-item" onclick="window.EDITOR_APP.tableDuplicateRow()">' +

            '<i class="fa-regular fa-copy"></i> Duplicate row</div>' +

        '<div class="table-ctx-item danger" onclick="window.EDITOR_APP.tableDeleteRow()">' +

            '<i class="fa-solid fa-trash-can"></i> Delete row</div>' +

        '<div class="table-ctx-divider"></div>' +

        '<div class="table-ctx-item danger" onclick="window.EDITOR_APP.tableDeleteWhole()">' +

            '<i class="fa-solid fa-table"></i> Delete table</div>';

    document.body.appendChild(menu);

    var x = e.clientX, y = e.clientY;

    var mh = menu.offsetHeight || 460;

    if (x + 230 > window.innerWidth)  x = window.innerWidth  - 234;

    if (y + mh  > window.innerHeight) y = window.innerHeight - mh - 8;

    menu.style.left = x + 'px';

    menu.style.top  = y + 'px';

    _tableCtxMenu = menu;

}

function hideTableMenu() {

    if (_tableCtxMenu) { _tableCtxMenu.remove(); _tableCtxMenu = null; }

}

// ── Column operations ────────────────────────────

function tableAddColLeft() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    Array.from(table.rows).forEach(function(row, ri) {

        var c = document.createElement(ri === 0 ? 'th' : 'td');

        c.className = 'tbl-cell'; c.contentEditable = 'true'; c.innerHTML = '<p><br></p>';

        row.insertBefore(c, row.cells[colIdx]);

    });

    handleInput();

}

function tableAddColRight() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    Array.from(table.rows).forEach(function(row, ri) {

        var c = document.createElement(ri === 0 ? 'th' : 'td');

        c.className = 'tbl-cell'; c.contentEditable = 'true'; c.innerHTML = '<p><br></p>';

        row.insertBefore(c, row.cells[colIdx + 1] || null);

    });

    handleInput();

}

function tableMoveColLeft() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    if (colIdx <= 0) return;

    Array.from(table.rows).forEach(function(row) {

        row.insertBefore(row.cells[colIdx], row.cells[colIdx - 1]);

    });

    handleInput();

}

function tableMoveColRight() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    Array.from(table.rows).forEach(function(row) {

        if (colIdx + 1 < row.cells.length) row.insertBefore(row.cells[colIdx + 1], row.cells[colIdx]);

    });

    handleInput();

}

function tableAlignCol(align) {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    Array.from(table.rows).forEach(function(row) {

        if (row.cells[colIdx]) row.cells[colIdx].style.textAlign = align;

    });

    handleInput();

}

function tableDuplicateCol() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    Array.from(table.rows).forEach(function(row, ri) {

        var src = row.cells[colIdx];

        var c   = document.createElement(ri === 0 ? 'th' : 'td');

        c.className = 'tbl-cell'; c.contentEditable = 'true';

        c.style.textAlign = src.style.textAlign;

        c.innerHTML = src.innerHTML;

        row.insertBefore(c, row.cells[colIdx + 1] || null);

    });

    handleInput();

}

function tableDeleteCol() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), colIdx = _getCellColIndex(cell);

    if (table.rows[0] && table.rows[0].cells.length <= 1) { table.remove(); }

    else { Array.from(table.rows).forEach(function(row) { row.deleteCell(colIdx); }); }

    handleInput();

}

// ── Row operations ───────────────────────────────

function _makeEmptyRow(cols) {

    var tr = document.createElement('tr');

    for (var i = 0; i < cols; i++) {

        var td = document.createElement('td');

        td.className = 'tbl-cell'; td.contentEditable = 'true'; td.innerHTML = '<p><br></p>';

        tr.appendChild(td);

    }

    return tr;

}

function tableAddRowAbove() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var row = cell.parentElement, table = _getTable(cell);

    table.tBodies[0].insertBefore(_makeEmptyRow(row.cells.length), row);

    handleInput();

}

function tableAddRowBelow() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var row = cell.parentElement, table = _getTable(cell);

    var next = row.nextElementSibling;

    if (next) table.tBodies[0].insertBefore(_makeEmptyRow(row.cells.length), next);

    else      table.tBodies[0].appendChild(_makeEmptyRow(row.cells.length));

    handleInput();

}

function tableMoveRowUp() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var row = cell.parentElement, prev = row.previousElementSibling;

    if (prev) row.parentElement.insertBefore(row, prev);

    handleInput();

}

function tableMoveRowDown() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var row = cell.parentElement, next = row.nextElementSibling;

    if (next) row.parentElement.insertBefore(next, row);

    handleInput();

}

function tableDuplicateRow() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var row = cell.parentElement;

    var newRow = row.cloneNode(true);

    Array.from(newRow.cells).forEach(function(c) { c.className = 'tbl-cell'; c.contentEditable = 'true'; });

    row.parentElement.insertBefore(newRow, row.nextElementSibling);

    handleInput();

}

function tableDeleteRow() {

    hideTableMenu();

    var cell = _tableCtxCell; if (!cell) return;

    var table = _getTable(cell), row = cell.parentElement;

    if (table.rows.length <= 1) table.remove(); else row.remove();

    handleInput();

}

function tableDeleteWhole() {

    hideTableMenu();

    if (_tableCtxCell) _getTable(_tableCtxCell).remove();

    handleInput();

}

// ═══════════════════════════════════════════════════

// FEATURE 1 — COPY ALL

// ═══════════════════════════════════════════════════

function copyAll() {

    /* innerText is LAYOUT-aware: it turns each block's CSS margin into an
       extra newline, so `#editor-textarea p { margin: 2px 0 }` produced a
       blank line between every line on paste. _plainTextForCounting walks
       the DOM instead and emits exactly one \n per block boundary — the
       same rule the gutter counts by. */
    var text = '';
    if (textareaEl) {
        text = _plainTextForCounting(textareaEl).replace(/\n+$/, '');
    }

    navigator.clipboard.writeText(text).then(function() {

        var btn = document.getElementById('copy-all-btn');

        if (!btn) return;

        var orig = btn.innerHTML;

        btn.innerHTML = '<i class="fa-solid fa-check"></i>';

        btn.style.color = '#27AE60';

        setTimeout(function() { btn.innerHTML = orig; btn.style.color = ''; }, 1400);

    });

}

// ═══════════════════════════════════════════════════

// FEATURE 2 — LINK INSERTER

// Right-click selected text → attach URL silently.

// A tiny ⌁ superscript marks linked spans.

// Right-click the marker → edit / remove.

// ═══════════════════════════════════════════════════

var _linkCtxMenu    = null;

var _linkCtxSpan    = null;

var _savedLinkRange = null; 

/* Called from the right-click handler in initEditorExtensions */

function showLinkInsertMenu(e, existingSpan) {

    hideLinkCtxMenu();

    e.preventDefault();

    e.stopPropagation();

    /* Edit menu for existing link — no selection needed */

    if (existingSpan) {

        _linkCtxSpan = existingSpan;

        var menu = document.createElement('div');

        menu.className = 'link-ctx-menu';

        menu.innerHTML =

            '<div class="link-ctx-header"><i class="fa-solid fa-link"></i> Linked Text</div>' +

            '<div class="link-ctx-url" id="link-ctx-url-display">' +

                '<a href="' + _esc(existingSpan.dataset.href) + '" target="_blank" title="Open">' +

                    _esc(_truncUrl(existingSpan.dataset.href)) +

                '</a>' +

            '</div>' +

            '<div class="link-ctx-divider"></div>' +

            '<div class="link-ctx-item" onclick="window.EDITOR_APP.editLinkPrompt()"><i class="fa-regular fa-pen-to-square"></i> Edit URL</div>' +

            '<div class="link-ctx-item danger" onclick="window.EDITOR_APP.removeLink()"><i class="fa-solid fa-link-slash"></i> Remove Link</div>';

        _mountLinkMenu(menu, e.clientX, e.clientY);

        return;

    }

    /* Insert flow — save selection NOW before toolbar click clears it */

    var sel = window.getSelection();

    var hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

    if (!hasSelection) return;

    _savedLinkRange = sel.getRangeAt(0).cloneRange();

    var rect = e.currentTarget.getBoundingClientRect();

    var menu = document.createElement('div');

    menu.className = 'link-ctx-menu';

    menu.innerHTML =

        '<div class="link-ctx-header"><i class="fa-solid fa-link"></i> Attach Link</div>' +

        '<input class="link-ctx-input" id="link-ctx-input" type="text" placeholder="https://…" ' +

            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.EDITOR_APP.confirmInsertLink();}">' +

        '<div class="link-ctx-divider"></div>' +

        '<div class="link-ctx-item primary" onclick="window.EDITOR_APP.confirmInsertLink()"><i class="fa-solid fa-check"></i> Attach</div>' +

        '<div class="link-ctx-item" onclick="window.EDITOR_APP.hideLinkCtxMenu()"><i class="fa-solid fa-xmark"></i> Cancel</div>';

    _mountLinkMenu(menu, rect.left, rect.bottom + 6);

    setTimeout(function() {

        var inp = document.getElementById('link-ctx-input');

        if (inp) inp.focus();

    }, 40);

}

function _mountLinkMenu(menu, x, y) {

    document.body.appendChild(menu);

    _linkCtxMenu = menu;

    var mw = 240, mh = 160;

    if (x + mw > window.innerWidth)  x = window.innerWidth  - mw - 8;

    if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;

    menu.style.left = x + 'px';

    menu.style.top  = y + 'px';

}

function hideLinkCtxMenu() {

    if (_linkCtxMenu) { _linkCtxMenu.remove(); _linkCtxMenu = null; }

    _linkCtxSpan = null;

}

function confirmInsertLink() {

    var inp = document.getElementById('link-ctx-input');

    if (!inp) return;

    var url = inp.value.trim();

    if (!url) return;

    if (!/^(https?:\/\/|scribble:\/\/)/i.test(url)) url = 'https://' + url;

    hideLinkCtxMenu();

    _wrapSelectionWithLink(url);

}

function _wrapSelectionWithLink(url) {

    var range = _savedLinkRange;

    if (!range) return;

    _savedLinkRange = null;

    /* Build the wrapper span */

    var span = document.createElement('span');

    span.className   = 'scribble-link';

    span.dataset.href = url;

    /* Move selected content inside */

    var frag = range.extractContents();

    span.appendChild(frag);

    /* Tiny marker superscript */

    var mark = document.createElement('sup');

    mark.className = 'scribble-link-mark';

    mark.textContent = '⌁';

    mark.contentEditable = 'false';

    span.appendChild(mark);

    range.insertNode(span);

    window.getSelection().removeAllRanges();

    handleInput();

}

function editLinkPrompt() {

    hideLinkCtxMenu();

    if (!_linkCtxSpan) return;

    var span = _linkCtxSpan;

    var menu = document.createElement('div');

    menu.className = 'link-ctx-menu';

    menu.innerHTML =

        '<div class="link-ctx-header"><i class="fa-solid fa-pen-to-square"></i> Edit URL</div>' +

        '<input class="link-ctx-input" id="link-ctx-input" type="text" value="' + _esc(span.dataset.href) + '" ' +

            'onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.EDITOR_APP.confirmEditLink();}"> ' +

        '<div class="link-ctx-divider"></div>' +

        '<div class="link-ctx-item primary" onclick="window.EDITOR_APP.confirmEditLink()"><i class="fa-solid fa-check"></i> Save</div>' +

        '<div class="link-ctx-item" onclick="window.EDITOR_APP.hideLinkCtxMenu()"><i class="fa-solid fa-xmark"></i> Cancel</div>';

    var rect = span.getBoundingClientRect();

    _mountLinkMenu(menu, rect.left, rect.bottom + 6);

    _linkCtxSpan = span;

    setTimeout(function() {

        var inp = document.getElementById('link-ctx-input');

        if (inp) { inp.focus(); inp.select(); }

    }, 40);

}

function confirmEditLink() {

    var inp = document.getElementById('link-ctx-input');

    if (!inp || !_linkCtxSpan) return;

    var url = inp.value.trim();

    if (url) _linkCtxSpan.dataset.href = url;

    hideLinkCtxMenu();

    handleInput();

}

function removeLink() {

    if (!_linkCtxSpan) return;

    hideLinkCtxMenu();

    var span = _linkCtxSpan;

    /* Unwrap: pull out all children except the .scribble-link-mark */

    var parent = span.parentNode;

    if (!parent) return;

    var children = Array.from(span.childNodes).filter(function(n) {

        return !(n.nodeType === 1 && n.classList && n.classList.contains('scribble-link-mark'));

    });

    children.forEach(function(c) { parent.insertBefore(c, span); });

    parent.removeChild(span);

    handleInput();

}

/* Clicking a scribble-link — open in browser OR open internal file tab */

function _handleLinkClick(span) {

    var href = span && span.dataset && span.dataset.href;

    if (!href) return;

    if (href.startsWith('scribble://file/')) {

        _openInternalLink(href);

    } else {

        window.open(href, '_blank', 'noopener');

    }

}

function _openInternalLink(href) {

    /* scribble://file/{projectId}/{fileId}/{fileName} */

    var parts = href.replace('scribble://file/', '').split('/');

    var projectId = parts[0];

    var fileId    = parts[1];

    var fileName  = decodeURIComponent(parts.slice(2).join('/') || 'Linked File');

    if (!fileId) return;

    /* Open as a new editor tab */

    openFileInEditor({ id: fileId, name: fileName, type: 'txt' });

}

function _truncUrl(url) {

    return url.length > 40 ? url.substring(0, 37) + '…' : url;

}

function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════════════════════════════════════════════

// FEATURE 3 — COPY INTERNAL FILE LINK

// Copies a scribble://file/{pid}/{fid}/{name} URI

// ═══════════════════════════════════════════════════

function copyFileLink() {

    var f = activeFileId ? openFiles.find(function(x) { return x.id === activeFileId; }) : null;

    if (!f) return;

    /* _fileProjectId, not window._projectId — a link built with the URL's
       project would not resolve back to a symlink-opened file. */
    var pid  = _fileProjectId(f) || '';

    var link = 'scribble://file/' + pid + '/' + f.id + '/' + encodeURIComponent(f.name);

    navigator.clipboard.writeText(link).then(function() {

        var btn = document.getElementById('copy-file-link-btn');

        if (!btn) return;

        var orig = btn.innerHTML;

        btn.innerHTML = '<i class="fa-solid fa-check"></i>';

        btn.style.color = '#27AE60';

        setTimeout(function() { btn.innerHTML = orig; btn.style.color = ''; }, 1400);

    });

}


// Status-bar "last version saved" indicator — refreshed on file open/switch

// and right after a new version is saved, so it's never more than a click away.

function refreshVersionIndicator() {

    var el = document.getElementById('editor-version-label');

    if (!el) return;

    var forFile = activeFileId;

    if (!forFile || !window.EDITOR_FB || !window.EDITOR_FB.listVersions) {

        el.innerText = 'No version saved';

        return;

    }

    el.innerText = 'Checking…';

    var vf = openFiles.find(function(x) { return x.id === forFile; });
    window.EDITOR_FB.listVersions(forFile, vf && vf._overridePid).then(function(versions) {

        // If the user already switched to a different file while this was

        // in flight, this result is stale — don't stomp on the new file's label.

        if (activeFileId !== forFile) return;

        var elNow = document.getElementById('editor-version-label');

        if (!elNow) return;

        if (!versions || !versions.length) {

            elNow.innerText = 'No version saved yet';

            elNow.parentElement.title = '';

            return;

        }

        var latest = versions[0]; // listVersions already orders newest-first

        var ts = latest.savedAt && latest.savedAt.toDate ? latest.savedAt.toDate() : null;

        elNow.innerText = ts ? 'Version saved ' + _formatVersionTime(ts) : (latest.versionName || 'saved');

        elNow.parentElement.title = latest.versionName || '';

    }).catch(function() {

        var elNow = document.getElementById('editor-version-label');

        if (elNow) elNow.innerText = 'No version saved yet';

    });

}

function _formatVersionTime(d) {

    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    var h = d.getHours(), m = d.getMinutes();

    var ampm  = h >= 12 ? 'PM' : 'AM';

    var h12   = h % 12 || 12;

    var mm    = m < 10 ? '0' + m : m;

    return M[d.getMonth()] + ' ' + d.getDate() + ', ' + h12 + ':' + mm + ' ' + ampm;

}


// Called by restoreVersion in project-app to sync an open tab

function _refreshFile(fileId, content) {

    var f = openFiles.find(function(x) { return x.id === fileId; });

    if (!f) return;

    f.content = content;

    if (activeFileId === fileId) {

        textareaEl.innerHTML = content;

        updateLineNumbers();

    }

}

// ═══════════════════════════════════════════════════

// VERSION HISTORY — SAVE VERSION MODAL

// ═══════════════════════════════════════════════════

function openSaveVersionModal() {

    if (!activeFileId) return;

    forceSave(); // always auto-save the main doc first

    var backdrop = document.getElementById('version-save-backdrop');

    var input    = document.getElementById('version-label-input');

    if (input)    input.value = '';

    if (backdrop) backdrop.style.display = 'flex';

    setTimeout(function() { if (input) input.focus(); }, 50);

}

function closeSaveVersionModal() {

    var backdrop = document.getElementById('version-save-backdrop');

    if (backdrop) backdrop.style.display = 'none';

}

function confirmSaveVersion() {

    var f = activeFileId ? openFiles.find(function(x) { return x.id === activeFileId; }) : null;

    if (!f) return;

    var noteEl = document.getElementById('version-label-input');

    var note   = noteEl ? noteEl.value.trim() : '';

    closeSaveVersionModal();

    if (window.EDITOR_FB && window.EDITOR_FB.saveVersion) {
        window.EDITOR_FB.saveVersion(f.id, f.content || textareaEl.innerHTML, note, f._overridePid)
            .then(function() {
                var btn = document.getElementById('force-save-btn');
                if (btn) {
                    var orig = btn.innerHTML;
                    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    btn.style.color = '#27AE60';
                    setTimeout(function() { btn.innerHTML = orig; btn.style.color = ''; }, 1400);
                }
                refreshVersionIndicator();
            });
    }
}

// Opens a version snapshot as a new virtual editor tab (read-only preview)

function openVersionPreview(tempFile) {

    initElements();

    /* _virtual added 2026-09-17. This pushes a snapshot into openFiles,
       and renderTabs() hands openFiles to SCRIBBLE_TABS.save() — so a
       read-only preview was being written into the cross-page "open
       documents" record as though it were a real file. Clicking it from
       another page would then try to open a document id that does not
       exist. Flagged here, filtered in renderTabs.

       (Nothing calls this function today — grepped the whole folder —
       but it is exported, so the flag goes in before it is wired up
       rather than after.) */
    tempFile._virtual = true;

    var existing = openFiles.find(function(f) { return f.id === tempFile.id; });

    if (!existing) openFiles.push(tempFile);

    activeFileId = tempFile.id;

    maximizeEditor();

    renderTabs();

    // Load directly — no Firebase round-trip for virtual files

    var f = openFiles.find(function(x) { return x.id === activeFileId; });

    if (f) { textareaEl.innerHTML = f.content || ''; updateLineNumbers(); }

}

// A second, identical _refreshFile() was defined here until 2026-09-17.
// Function declarations hoist, so the later one silently won and the two
// were the same code — no behaviour difference either way. The one above
// is kept; it has the fuller comment.

/* ═══════════════════════════════════════════════════

       CODE MODE — auto-close, syntax color, error checking

       Debounced, caret-preserving, and content is ALWAYS

       saved as clean plain text (via innerText) — the

       colored <span>s are a display-only overlay, never

       persisted. Every timer is cleared in loadActiveContent

       before a new file's cycle starts, so nothing from a

       previous file can ever fire late against a new one.

    ═══════════════════════════════════════════════════ */

    function _getCaretOffset(root) {

        var sel = window.getSelection();

        if (!sel || !sel.rangeCount) return null;

        var range = sel.getRangeAt(0);

        if (!root.contains(range.startContainer)) return null;

        var pre = document.createRange();

        pre.selectNodeContents(root);

        pre.setEnd(range.startContainer, range.startOffset);

        return pre.toString().length;

    }

    function _setCaretOffset(root, offset) {

        var remaining = offset, found = null, foundOffset = 0;

        (function walk(n) {

            if (found) return;

            if (n.nodeType === 3) {

                var len = n.textContent.length;

                if (remaining <= len) { found = n; foundOffset = remaining; return; }

                remaining -= len;

            } else {

                for (var i = 0; i < n.childNodes.length; i++) { walk(n.childNodes[i]); if (found) return; }

            }

        })(root);

        var range = document.createRange();

        if (found) range.setStart(found, foundOffset);

        else { range.selectNodeContents(root); range.collapse(false); }

        range.collapse(true);

        var sel = window.getSelection();

        sel.removeAllRanges();

        sel.addRange(range);

    }

    /* Single-pass tokenizer: walks ORIGINAL raw text once with a combined

       regex, escaping + wrapping matches, escaping the plain text between

       them. Never re-scans already-inserted HTML, so it can't double-color

       or corrupt tags — the exact class of bug that hit the old JSON/HTML

       highlighters when they ran multiple passes over their own output. */

    function _tokenize(raw, regex, classify) {

        var out = '', last = 0, m;

        regex.lastIndex = 0;

        while ((m = regex.exec(raw)) !== null) {

            if (m.index > last) out += _esc(raw.slice(last, m.index));

            var cls = classify(m, raw);

            out += cls ? ('<span class="cd-' + cls + '">' + _esc(m[0]) + '</span>') : _esc(m[0]);

            last = m.index + m[0].length;

            if (m[0].length === 0) regex.lastIndex++;

        }

        out += _esc(raw.slice(last));

        return out;

    }

    var JSON_RE = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?/g;

    function _tokenizeJSON(raw) {

        return _tokenize(raw, JSON_RE, function(m, raw2) {

            var t = m[0];

            if (t[0] === '"') return /^\s*:/.test(raw2.slice(m.index + t.length)) ? 'key' : 'string';

            if (t === 'true' || t === 'false') return 'bool';

            if (t === 'null') return 'null';

            return 'number';

        });

    }

    var JS_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|do|class|extends|new|this|typeof|instanceof|await|async|import|export|from|as|default|try|catch|finally|throw|switch|case|break|continue|null|undefined|true|false|void|delete|in|of|yield|static|get|set|super)\b|\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g;

    function _tokenizeJS(raw) {

        return _tokenize(raw, JS_RE, function(m) {

            var t = m[0];

            if (t.indexOf('//') === 0 || t.indexOf('/*') === 0) return 'comment';

            if (t[0] === '"' || t[0] === "'" || t[0] === '`') return 'string';

            if (/^\d/.test(t)) return 'number';

            return 'keyword';

        });

    }

    var CSS_RE = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[0-9a-fA-F]{3,8}\b|[.#]?[-\w]+(?=\s*\{)|[-\w]+(?=\s*:)|\b\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/g;

    function _tokenizeCSS(raw) {

        return _tokenize(raw, CSS_RE, function(m, raw2) {

            var t = m[0];

            if (t.indexOf('/*') === 0) return 'comment';

            if (t[0] === '"' || t[0] === "'" || t[0] === '#') return 'string';

            if (/^-?\d/.test(t)) return 'number';

            var after = raw2.slice(m.index + t.length).match(/^\s*([{:])/);

            return after && after[1] === '{' ? 'tag' : 'attr';

        });

    }

    var HTML_RE = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z][a-zA-Z0-9-]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/?>|[a-zA-Z-]+(?=\s*=)/g;

    function _tokenizeHTML(raw) {

        return _tokenize(raw, HTML_RE, function(m) {

            var t = m[0];

            if (t.indexOf('<!--') === 0) return 'comment';

            if (/^<!DOCTYPE/i.test(t)) return 'doctype';

            if (t[0] === '"' || t[0] === "'") return 'string';

            if (t.indexOf('<') === 0 || t === '>' || t === '/>') return 'tag';

            return 'attr';

        });

    }

    // Your own list — reorder or edit freely, the picker just reads this array.
    // Each entry can be a plain string (always shown, not searchable by
    // name), or { sym, tags } to make it findable by typing a keyword.
    // Mix and match freely — nothing you've already added needs to change.
    var SCRIBBLE_SYMBOLS = [
        { sym: '☕︎', tags: 'coffee, caffeine, cafe, cup, mug, morning' },
        { sym: '✌︎', tags: ' peace, sign, two' },
        { sym: '✿', tags: 'flower, pretty, floral, decoration' },
        { sym: '☺︎', tags: 'smile, happy' },
        { sym: '☻', tags: 'smile, happy' },
        { sym: '❤︎', tags: 'heart, decoration, love' },
        { sym: '☘︎', tags: 'leaf, luck, decoration' },
        { sym: '✋︎', tags: 'stop, hand' },
        { sym: '✦', tags: 'star, diamond, bullet, sparkle, four pointed star' },
        { sym: '✧', tags: 'star, diamond, sparkle, bullet, four pointed star' },
        { sym: '•', tags: 'dot, circle, bullet' },
        { sym: '⚬', tags: 'dot, circle, bullet' },
        { sym: '◉', tags: 'dot, circle, bullet,Fisheye' },
        { sym: '❖', tags: 'diamond, four pointed star, bullet' },
        { sym: '❀', tags: 'flower, pretty, floral, decoration' },
        { sym: '❁', tags: 'flower, pretty, floral, decoration'},
        { sym: '★', tags: 'star, sky, bullet' },
        { sym: '☆', tags: 'star, sky, bullet' },
        { sym: '✭', tags: 'star, sky' },
        { sym: '⛴', tags: 'boat, cruise, sea, water, ship, vacation ' },
        { sym: '᯽', tags: 'flower, Batak, bullet, vine, scroll, floral, glyph,decoration' },
        { sym: 'ꕤ ', tags: 'flower, Vai, nda, stem, floral, glyph,decoration' },
        { sym: 'ꕥ', tags: 'Vai, nggan,glyph,stem, floral,decoration ' },
        { sym: '✈︎', tags: 'airplane, flight, travel, plane, transportation' },
        { sym: '☁︎', tags: 'cloud, sky, weather' },
        { sym: '☀︎', tags: 'sun, sky, weather, decoration, bullet' },
        { sym: '☼︎', tags: 'sun, sky, weather, light' },
        { sym: '𖤓', tags: 'sun, flower, decoration, floral, sky, glyph' },
        { sym: '🔍︎', tags: 'search, magnifying glass' },
        { sym: '🔒︎', tags: 'lock, security' },
        { sym: '🗪', tags: 'message, convo, conversation, chat, communicate, talk, speak' },
        { sym: '✉︎', tags: 'message, inbox, convo, conversation, chat, communicate, talk, speak' },
        { sym: '☂', tags: 'umbrella, weather, rain' },
        { sym: '♛', tags: 'crown, king, queen, supreme, supremacy, royal, royalty' },
        { sym: '☯︎', tags: 'circle, yin, yang, yin and yang' },
        { sym: '✞', tags: 'cross, christian, religion, Jesus, God, faith, savior, pray' },
        { sym: '✟', tags: 'cross, christian, religion, Jesus, God, faith, savior, pray' },
        { sym: '𓏲ּꪆ', tags: 'heart, love, romance, romantic' },
        { sym: '❦', tags: 'heart, love, romance, floral, romantic, leaf, decoration' },
        { sym: '☮', tags: 'peace, sign, two' },
        { sym: '❣', tags: 'heart, love, romance, romantic' },
        { sym: 'ღ', tags: 'heart, love, romance, romantic' },
        { sym: '→', tags: 'small arrow, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➛', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➜', tags: 'bullet, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➝', tags: 'thin, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➞', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➟', tags: 'dashed arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➠', tags: 'dashed arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➡', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➢', tags: 'bullet, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➣', tags: 'bullet, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➤', tags: 'bullet, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➥', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➦', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➨', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➩', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➯', tags: 'right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '⇰', tags: 'right, arrow, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '⇉', tags: 'double arrow, double right, thin arrow, right, arrow, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '⇥', tags: 'thin arrow, right, arrow, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '↣', tags: 'thin arrow, right, arrow, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '↪', tags: 'hook, arrow with hook, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '⟶', tags: 'long arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '⤥', tags: 'down, pointing down, below, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➸', tags: 'arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '➺', tags: 'arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '→', tags: 'small arrow, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '↗', tags: 'up right, up-right, small arrow, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '↘', tags: 'down right, down-right, small arrow, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow' },
        { sym: '←', tags: 'left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '↩', tags: 'hook, arrow with hook, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⇇', tags: 'double arrow, double left arrow,left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⇐', tags: 'double arrow, double left arrow,left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⟵', tags: 'long arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⤡', tags: 'left, arrow, bullet, up down, double sided, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⬁', tags: 'north arrow, northwest arrow, arrow, left arrow, upward arrow, up ward arrow, ' },
        { sym: '⬉', tags: 'northwest arrow, arrow, left arrow, upward arrow, up ward arrow, ' },
        { sym: '⬅', tags: 'left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '↖', tags: 'up left, up-left, small arrow, thin arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '↙', tags: 'down left, down-left, small arrow, thin arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⭠', tags: 'thin arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '↑', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '↗', tags: 'up right, up-right, small arrow, thin arrow, right, arrow, bullet, point right, pointing to right, right arrow, Rightwards arrow, north east arrow' },
        { sym: '↖', tags: 'up left, up-left, small arrow, thin arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow, north west arrow' },
        { sym: '⇑', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '⇧', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '⇳', tags: 'up down arrow, double sided arrow, arrow, point up, point down' },
        { sym: '⤢', tags: 'thin arrow, left, arrow, bullet, point left, pointing to left, left arrow, Leftwards arrow' },
        { sym: '⬀', tags: 'north arrow, arrow, left arrow, upward arrow, up ward arrow, ' },
        { sym: '⬃', tags: 'south arrow, arrow, right arrow, downward arrow, down ward arrow, ' },
        { sym: '⬈', tags: 'northeast arrow, arrow, right arrow, upward arrow, up ward arrow, ' },
        { sym: '⬆', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🠅', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🠉', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🠭', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🢁', tags: 'thick arrow, upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🠵', tags: 'thick arrow, upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '🠷', tags: 'thick arrow, downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '🢃', tags: 'thick arrow, downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '🠯', tags: 'downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '🠋', tags: 'downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '🠇', tags: 'upward arrow, up arrow, arrow, point up, point upward' },
        { sym: '⇓', tags: 'downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '⇊', tags: 'down up arrow, double sided arrow, arrow, point down, point up' },
        { sym: '↓', tags: 'downward arrow, down arrow, arrow, point down, point downward' },
        { sym: '↶', tags: 'downward arrow, down arrow, arrow, point down, point downward, Anticlockwise, semicircle arrow' },
        { sym: '↷', tags: 'clockwise, semicircle arrow' },
        { sym: '↺', tags: 'Anticlockwise open circle arrow, arrow, circle arrow, refresh, recall' },
        { sym: '↻', tags: 'clockwise open circle arrow, arrow, circle arrow, refresh, recall' },
        { sym: '⊙', tags: 'dot circle, circle' },
        { sym: '○', tags: 'white circle, dot, circle, small circle, bullet' },
        { sym: '●', tags: 'black circle, dot, circle, small circle, bullet' },
        { sym: '◍', tags: 'circle, shaded circle' },
        { sym: '◒', tags: 'Circle with lower half black, lower half black' },
        { sym: '◓', tags: 'Circle with upper half black, upper half black' },
        { sym: '◔', tags: 'Circle with upper right quadrant black, upper right quadrant black' },
        { sym: '◕', tags: 'Circle with left half black, left half black' },
        { sym: '◯', tags: 'Circle, Large circle, large white circle, bullet' },
        { sym: '⬤', tags: 'Circle, Large circle, large black circle, bullet' },
        { sym: '◧', tags: 'Square with left half black, square, half black' },
        { sym: '◨', tags: 'Square with right half black, square, half black' },
        { sym: '•', tags: 'bullet, dot' },
        { sym: '‣', tags: 'bullet, dot' },
        { sym: '❋', tags: 'rectilinear black star, floral, flower, star, bullet, asterisk' },
        { sym: '✺', tags: 'asterisk, star' },
        { sym: '✹', tags: 'star, asterisk, bullet' },
        { sym: '✸', tags: 'star, asterisk, bullet' },
        { sym: '✷', tags: 'star, asterisk, bullet' },
        { sym: '✶', tags: 'star, asterisk, bullet' },
        { sym: '✴', tags: 'star, asterisk, bullet' },
        { sym: '✯', tags: 'star, bullet, Pinwheel star' },
        { sym: '★', tags: 'star, bullet, black star' },
        { sym: '☆', tags: 'star, bullet, white star' },
        { sym: '✬', tags: 'star, bullet, Pinwheel star' },
        { sym: '✤', tags: 'star, bullet, Pinwheel star, decoration, flower, floral' },
        { sym: '◆', tags: 'black diamond, bullet' },
        { sym: '◇', tags: 'white diamond, bullet' },
        { sym: '⬖', tags: 'Diamond with left half black, left half black diamond' },
        { sym: '⬗', tags: 'Diamond with right half black, right half black diamond' },
        { sym: '⬘', tags: 'Diamond with top half black, top half black diamond' },
        { sym: '⬙', tags: 'Diamond with bottom half black, bottom half black diamond' },
        { sym: '♦︎', tags: 'Diamond, Dark diamond, small black diamond, black diamond, bullet' },
        { sym: '⟡', tags: 'Diamond, White diamond, small white diamond, bullet' },
        { sym: '⬥', tags: 'Diamond, Dark diamond, small black diamond, black diamond, bullet' },
        { sym: '⬦', tags: 'Diamond, Small white diamond, white diamond, bullet' },
        { sym: '✾', tags: 'floral, flower, star, bullet, asterisk' },
        { sym: '♡', tags: 'heart, love, affection, white heart, small white heart, small heart, bullet' },
        { sym: '♥︎', tags: 'heart, love, affection, black heart, small black heart, small heart, bullet' },
        { sym: '☽', tags: 'moon, first quarter moon, night, sky, nightsky' },
        { sym: '☾', tags: 'moon, last quarter moon, night, sky, nightsky' },
        { sym: '🌢', tags: 'drop, teardrop, water drop' },
        { sym: '❧', tags: 'rotated floral heart, floral heart, decoration' },
        { sym: '☙', tags: 'rotated floral heart, floral heart, decoration' },
        { sym: '❄︎', tags: 'snowflake, weather, winter' },
        { sym: '❅', tags: 'snowflake, weather, winter' },
        { sym: '❆', tags: 'snowflake, weather, winter, decoration' },
        { sym: '☃︎', tags: 'snowman, winter' },
        { sym: '☜', tags: 'leftwards arrow, arrow, point left, hand point left, hand left, hand pointing to left' },
        { sym: '☞', tags: 'rightwards arrow, arrow, point right, hand point right, hand right, hand pointing to right' },
        { sym: '☝︎', tags: 'upwards arrow, arrow, point up, hand point up, hand up, hand pointing to up' },
        { sym: '☟', tags: 'downwards arrow, arrow, point down, hand point down, hand down, hand pointing to down' },
        { sym: '☛', tags: 'rightwards arrow, arrow, point right, hand point right, hand right, hand pointing to right' },
        { sym: '☚', tags: 'leftwards arrow, arrow, point left, hand point left, hand left, hand pointing to left' },
        { sym: '✂', tags: 'scissors, cut' },
        { sym: '♔', tags: 'crown, queen, royal, royalty' },
        { sym: '♕', tags: 'king, royal, royalty' },
        { sym: '☎︎', tags: 'telephone, phone' },
        { sym: '⚜', tags: 'fleur-de-lis, fleur de lis, decoration, royal, royalty, elegant' },
        { sym: '♩', tags: 'quarter note, note, music, song' },
        { sym: '♪', tags: 'eighth note, note, music, song' },
        { sym: '♫', tags: 'note, music, song' },
        { sym: '♬', tags: 'note, music, song' },
        { sym: '𝄞', tags: 'G clef, music, note, song ' },
        { sym: '𝄢', tags: 'F clef, music, note, song ' },
        { sym: '☠', tags: 'skull, death, danger' }
    ];

    function _symbolEntry(item) {
        return typeof item === 'string' ? { sym: item, tags: '' } : item;
    }

    var _symbolPickerSavedRange = null;

    function toggleSymbolPicker(e) {
        e.stopPropagation();
        var wrap = document.getElementById('symbol-picker-wrap');
        var grid = document.getElementById('symbol-picker-grid');
        if (!grid || !wrap) return;
        var opening = grid.style.display === 'none';
        if (opening) {
            var sel = window.getSelection();
            _symbolPickerSavedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

            _renderSymbolGrid('');
            grid.style.display = 'block';
            var input = document.getElementById('symbol-picker-search');
            if (input) { input.value = ''; setTimeout(function() { input.focus(); }, 30); }
        } else {
            grid.style.display = 'none';
        }
    }

    function _renderSymbolGrid(query) {
        var grid = document.getElementById('symbol-picker-grid');
        if (!grid) return;
        query = (query || '').trim().toLowerCase();

        var matches = SCRIBBLE_SYMBOLS.map(_symbolEntry).filter(function(item) {
            if (!query) return true;
            return item.tags && item.tags.toLowerCase().indexOf(query) !== -1;
        });

        var cellsHtml = matches.length
            ? matches.map(function(item) {
                var title = item.tags ? ' title="' + _esc(item.tags) + '"' : '';
                return '<div class="symbol-picker-item"' + title + ' onclick="window.EDITOR_APP.insertSymbolBullet(\'' + item.sym.replace(/'/g, "\\'") + '\')">' + item.sym + '</div>';
            }).join('')
            : '<div class="symbol-picker-empty">No matches — try a different word, or symbols without a tag won\'t show up here</div>';

        grid.innerHTML =
            '<input type="text" id="symbol-picker-search" class="symbol-picker-search" placeholder="Search tagged symbols…" ' +
                'oninput="window.EDITOR_APP._filterSymbols(this.value)" onclick="event.stopPropagation()">' +
            '<div class="symbol-picker-cells">' + cellsHtml + '</div>';
    }

    function _filterSymbols(query) {
        var container = document.querySelector('.symbol-picker-cells');
        var input = document.getElementById('symbol-picker-search');
        if (!container) return;
        query = (query || '').trim().toLowerCase();
        var matches = SCRIBBLE_SYMBOLS.map(_symbolEntry).filter(function(item) {
            if (!query) return true;
            return item.tags && item.tags.toLowerCase().indexOf(query) !== -1;
        });
        container.innerHTML = matches.length
            ? matches.map(function(item) {
                var title = item.tags ? ' title="' + _esc(item.tags) + '"' : '';
                return '<div class="symbol-picker-item"' + title + ' onclick="window.EDITOR_APP.insertSymbolBullet(\'' + item.sym.replace(/'/g, "\\'") + '\')">' + item.sym + '</div>';
            }).join('')
            : '<div class="symbol-picker-empty">No matches — try a different word, or symbols without a tag won\'t show up here</div>';
    }

    // Inserts the symbol as REAL text, not a CSS/list marker — this is what
    // makes it survive copy-paste anywhere, every time. No selection: just
    // drops "symbol " at the cursor. Selection spanning lines: prefixes
    // every line touched by the selection.
    function insertSymbolBullet(sym) {
        var grid = document.getElementById('symbol-picker-grid');
        if (grid) grid.style.display = 'none';

        var sel = window.getSelection();
        if (_symbolPickerSavedRange) {
            sel.removeAllRanges();
            sel.addRange(_symbolPickerSavedRange);
            _symbolPickerSavedRange = null;
        }
        if (!sel || !sel.rangeCount) return;
        var range = sel.getRangeAt(0);

        if (range.collapsed) {
            document.execCommand('insertText', false, sym + ' ');
            handleInput();
            return;
        }

        var startBlock = _closestBlock(range.startContainer);
        var endBlock   = _closestBlock(range.endContainer);
        if (!startBlock || !endBlock) return;

        var blocks = [];
        var node = startBlock;
        while (node) {
            blocks.push(node);
            if (node === endBlock) break;
            node = node.nextElementSibling;
        }
        blocks.forEach(function(block) {
            block.insertBefore(document.createTextNode(sym + ' '), block.firstChild);
        });

        sel.removeAllRanges();
        handleInput();
    }

    function _closestBlock(node) {
        while (node && node !== textareaEl) {
            if (node.nodeType === 1 && node.parentNode === textareaEl) return node;
            node = node.parentNode;
        }
        return null;
    }

    function toggleInlineCode() {
        var f = openFiles.find(function(x) { return x.id === activeFileId; });
        if (_isCodeFile(f)) return; // code files are already all-code — no-op here

        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        // Clicking again on text already wrapped in inline code un-wraps it
        var node = sel.anchorNode;
        var existing = null;
        while (node && node !== textareaEl) {
            if (node.nodeType === 1 && node.tagName === 'CODE' && node.classList.contains('rt-inline-code')) {
                existing = node; break;
            }
            node = node.parentNode;
        }
        if (existing) {
            var parent = existing.parentNode;
            while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
            parent.removeChild(existing);
            handleInput();
            return;
        }

        if (sel.isCollapsed) return; // need a selection to wrap
        var range = sel.getRangeAt(0);
        var text = range.toString();
        if (!text) return;

        var code = document.createElement('code');
        code.className = 'rt-inline-code';
        code.textContent = text;
        range.deleteContents();
        range.insertNode(code);

        var r2 = document.createRange();
        r2.setStartAfter(code);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);
        handleInput();
    }

    function insertCodeBlock() {
        var f = openFiles.find(function(x) { return x.id === activeFileId; });
        if (_isCodeFile(f)) return; // code files are already all-code — no-op here

        var sel = window.getSelection();
        var text = sel && !sel.isCollapsed ? sel.toString() : '';

        var pre = document.createElement('pre');
        pre.className = 'rt-code-block';
        pre.contentEditable = 'true';
        var codeEl = document.createElement('code');
        codeEl.textContent = text || '';
        pre.appendChild(codeEl);

        if (sel && sel.rangeCount) {
            var range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(pre);
        } else {
            textareaEl.appendChild(pre);
        }

        // Leave a normal paragraph right after so the cursor has somewhere
        // to go once you're done typing code — otherwise you'd be stuck.
        var p = document.createElement('p');
        p.innerHTML = '<br>';
        pre.parentNode.insertBefore(p, pre.nextSibling);
        var r2 = document.createRange();
        r2.setStart(p, 0);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);

        handleInput();
        updateLineNumbers();
    }

    /* ═══════════════════════════════════════════════════
       SIDE NOTES — per-file reminders/issues panel
    ═══════════════════════════════════════════════════ */

    function toggleSideNotes() {
        _sideNotesOpen = !_sideNotesOpen;
        var panel = document.getElementById('side-notes-panel');
        var winEl = document.querySelector('.editor-window');
        if (panel) panel.style.display = _sideNotesOpen ? 'flex' : 'none';
        if (winEl) winEl.classList.toggle('side-notes-open', _sideNotesOpen);
        if (_sideNotesOpen) _loadSideNotes();
    }

    function _loadSideNotes() {
        if (!activeFileId || !window.PROJECT_FB) return;
        /* Was window._projectId — notes on a symlink-opened file were read
           from, and saved into, the project the URL pointed at rather than
           the one holding the file. */
        var pid = _fileProjectId(openFiles.find(function(x) { return x.id === activeFileId; }));
        var loadingForFile = activeFileId; // snapshot so stale responses can't land
        _sideNotes = [];
        _renderSideNotes([]);
        window.PROJECT_FB.getFileNotes(pid, activeFileId).then(function(notes) {
            if (loadingForFile !== activeFileId) return; // user switched tabs mid-fetch — discard
            _sideNotes = notes || [];
            _renderSideNotes(_sideNotes);
        }).catch(function() { _sideNotes = []; _renderSideNotes([]); });
    }

    function _renderSideNotes(notes) {
        var list = document.getElementById('side-notes-list');
        if (!list) return;
        if (!notes.length) {
            list.innerHTML = '<div class="side-notes-empty">No notes yet — add one above</div>';
            return;
        }
        list.innerHTML = notes.map(function(n) {
            return '<div class="side-note-item' + (n.done ? ' done' : '') + '" data-id="' + n.id + '">' +
                '<div class="side-note-check" onclick="window.EDITOR_APP.toggleNoteCheck(\'' + n.id + '\')">' +
                    (n.done ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>') +
                '</div>' +
                '<div class="side-note-text">' + _esc(n.text) + '</div>' +
                '<div class="side-note-del" onclick="window.sideNoteDeleteConfirm(\'' + n.id + '\')" title="Delete">' +
                    '<i class="fa-solid fa-xmark"></i>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function addSideNote() {
        var inp = document.getElementById('side-notes-input');
        if (!inp) return;
        var text = inp.value.trim();
        if (!text) return;
        inp.value = '';
        var note = { id: 'n' + Date.now(), text: text, done: false };
        _sideNotes.push(note);
        _renderSideNotes(_sideNotes);
        _scheduleSideNotesSave();
    }

    function toggleNoteCheck(id) {
        _sideNotes = _sideNotes.map(function(n) {
            return n.id === id ? Object.assign({}, n, { done: !n.done }) : n;
        });
        _renderSideNotes(_sideNotes);
        _scheduleSideNotesSave();
    }

    function deleteNote(id) {
        _sideNotes = _sideNotes.filter(function(n) { return n.id !== id; });
        _renderSideNotes(_sideNotes);
        _scheduleSideNotesSave();
    }

    function _scheduleSideNotesSave() {
        clearTimeout(_notesSaveTimer);
        _notesSaveTimer = setTimeout(function() {
            if (!activeFileId || !window.PROJECT_FB) return;
            /* Same fix as _loadSideNotes — the read and the write have to
               agree on the project, or a note saves somewhere it is never
               read back from. */
            var f = openFiles.find(function(x) { return x.id === activeFileId; });
            window.PROJECT_FB.saveFileNotes(_fileProjectId(f), activeFileId, _sideNotes);
        }, 800);
    }

    function highlightCode() {
        var f = openFiles.find(function(x) { return x.id === activeFileId; });
        if (!f || !_isCodeFile(f) || !textareaEl) return;
        if (f.content && f.content.length > MAX_LIVE_HIGHLIGHT_CHARS) {
            // Too large to safely tokenize into thousands of <span>
            // elements without freezing the tab — this was the actual
            // source of the lag, not the debounce timing. Skip coloring
            // entirely; the file stays plain text but fully editable,
            // and every downstream operation (typing, caret, line count)
            // stays fast since there's no span-fragmented DOM to walk.
            return;
        }
        var raw   = textareaEl.innerText;
        var caret = _getCaretOffset(textareaEl);

        var lastSnap = _codeUndoStack[_codeUndoStack.length - 1];
        if (!lastSnap || lastSnap.text !== raw) {
            _codeUndoStack.push({ text: raw, caret: caret });
            if (_codeUndoStack.length > 100) _codeUndoStack.shift();
            _codeRedoStack = [];
        }

        var html;

        if (f.type === 'json') html = _tokenizeJSON(raw);

        else if (f.type === 'css') html = _tokenizeCSS(raw);

        else if (f.type === 'js') html = _tokenizeJS(raw);

        else html = _tokenizeHTML(raw);

        textareaEl.innerHTML = html;

        if (caret !== null) _setCaretOffset(textareaEl, caret);

    }

    function _applyCodeSnapshot(snap) {
        textareaEl.textContent = snap.text;
        highlightCode();
        if (snap.caret !== null) _setCaretOffset(textareaEl, snap.caret);
        handleInput();
    }

    function codeUndo() {
        if (_codeUndoStack.length < 2) return;
        _codeRedoStack.push(_codeUndoStack.pop());
        _applyCodeSnapshot(_codeUndoStack[_codeUndoStack.length - 1]);
    }

    function codeRedo() {
        if (!_codeRedoStack.length) return;
        var next = _codeRedoStack.pop();
        _codeUndoStack.push(next);
        _applyCodeSnapshot(next);
    }

    function _extractPos(msg) { var m = /position (\d+)/.exec(msg); return m ? parseInt(m[1], 10) : null; }

    function _posToLineCol(text, pos) {

        var sub = text.slice(0, pos);

        var lines = sub.split('\n');

        return { line: lines.length, col: lines[lines.length - 1].length + 1 };

    }

    function _checkHTMLTags(raw) {

        var issues = [];

        var VOID = { area:1,base:1,br:1,col:1,embed:1,hr:1,img:1,input:1,link:1,meta:1,param:1,source:1,track:1,wbr:1 };

        var stack = [];

        var re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;

        var m;

        while ((m = re.exec(raw)) !== null) {

            var tag = m[1].toLowerCase();

            var closing = m[0][1] === '/';

            var selfClose = m[2] === '/' || VOID[tag];

            var line = _posToLineCol(raw, m.index).line;

            if (closing) {

                if (!stack.length) {

                    issues.push({ type:'warning', line:line, message: "Unexpected closing tag '</" + tag + ">'." });

                } else if (stack[stack.length - 1].tag !== tag) {

                    var idx = -1;

                    for (var i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { idx = i; break; }

                    if (idx === -1) {

                        issues.push({ type:'warning', line:line, message: "Closing tag '</" + tag + ">' doesn't match any open tag." });

                    } else {

                        for (var j = stack.length - 1; j > idx; j--) {

                            issues.push({ type:'warning', line: stack[j].line, message: "'<" + stack[j].tag + ">' was never closed." });

                        }

                        stack.length = idx;

                    }

                } else {

                    stack.pop();

                }

            } else if (!selfClose) {

                stack.push({ tag: tag, line: line });

            }

        }

        stack.forEach(function(s) {

            issues.push({ type:'warning', line: s.line, message: "'<" + s.tag + ">' was never closed." });

        });

        return issues;

    }

    function validateCode() {

        var f = openFiles.find(function(x) { return x.id === activeFileId; });

        if (!f || !_isCodeFile(f)) return;

        var raw = textareaEl.innerText || '';

        if (!raw.trim() || raw.trim() === 'Loading...') { _codeIssues = []; _updateCodeProblemsBar(); return; }

        var issues = [];

        if (f.type === 'json') {

            try { JSON.parse(raw); }

            catch (err) {

                var pos = _extractPos(err.message);

                var lc  = pos != null ? _posToLineCol(raw, pos) : null;

                issues.push({ type:'error', line: lc ? lc.line : null, col: lc ? lc.col : null, message: err.message });

            }

        } else if (f.type === 'js') {

            try { new Function(raw); }

            catch (err) { issues.push({ type:'error', line:null, message: err.message }); }

        } else if (f.type === 'css') {

            var open = (raw.match(/\{/g) || []).length;

            var close = (raw.match(/\}/g) || []).length;

            if (open !== close) {

                issues.push({ type:'error', line:null, message: 'Mismatched braces — ' + open + ' "{" vs ' + close + ' "}".' });

            }

        } else {

            issues = _checkHTMLTags(raw);

        }

        _codeIssues = issues;

        _updateCodeProblemsBar();

    }

    function _updateCodeProblemsBar() {

        var bar = document.getElementById('code-problems-bar');

        if (!bar) return;

        bar.style.display = 'flex';

        var errEl  = document.getElementById('code-error-count');

        var warnEl = document.getElementById('code-warning-count');

        if (errEl)  errEl.textContent  = _codeIssues.filter(function(i){ return i.type === 'error'; }).length;

        if (warnEl) warnEl.textContent = _codeIssues.filter(function(i){ return i.type === 'warning'; }).length;

        if (_codeProblemsExpanded) _renderCodeProblemsList();

    }

    function hideCodeProblemsBar() {

        var bar = document.getElementById('code-problems-bar');

        var panel = document.getElementById('code-problems-panel');

        if (bar) bar.style.display = 'none';

        if (panel) panel.style.display = 'none';

        _codeProblemsExpanded = false;

    }

    function toggleCodeProblemsPanel() {

        _codeProblemsExpanded = !_codeProblemsExpanded;

        var panel = document.getElementById('code-problems-panel');

        var chevron = document.getElementById('code-problems-chevron');

        if (panel) panel.style.display = _codeProblemsExpanded ? 'block' : 'none';

        if (chevron) chevron.classList.toggle('expanded', _codeProblemsExpanded);

        if (_codeProblemsExpanded) _renderCodeProblemsList();

    }

    function _renderCodeProblemsList() {

        var panel = document.getElementById('code-problems-panel');

        if (!panel) return;

        if (!_codeIssues.length) { panel.innerHTML = '<div class="jp-item-empty">No problems found</div>'; return; }

        var sorted = _codeIssues.slice().sort(function(a, b) {

            if (a.type !== b.type) return a.type === 'error' ? -1 : 1;

            return (a.line || 0) - (b.line || 0);

        });

        panel.innerHTML = sorted.map(function(issue) {

            var loc  = issue.line ? 'Line ' + issue.line + (issue.col ? ':' + issue.col : '') + ' — ' : '';

            var icon = issue.type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation';

            return '<div class="jp-item jp-item-' + issue.type + '"><i class="fa-solid ' + icon + '"></i><span>' + loc + _esc(issue.message) + '</span></div>';

        }).join('');

    }

   return {
    openFileInEditor: openFileInEditor,
    updateLineNumbers: updateLineNumbers,
    switchTab: switchTab,
    closeTab: closeTab,
    handleInput: handleInput,
    minimizeEditor: minimizeEditor,
    maximizeEditor: maximizeEditor,

    closeAllFiles: closeAllFiles,

    forceSave: forceSave,

    exportActiveFile: exportActiveFile,

    toggleWrap: toggleWrap,

    toggleTheme: toggleTheme,

    showConfirm: showConfirm,

    cancelConfirm: cancelConfirm,

    acceptConfirm: acceptConfirm,

    format: format,
    applyFont: applyFont,
    insertBulletList: insertBulletList,
    insertNumberedList: insertNumberedList,
    insertTaskList: insertTaskList,
    toggleHighlightPicker: toggleHighlightPicker,
    applyHighlight: applyHighlight,
    applyFontSize: applyFontSize,
    showTabMenu: showTabMenu,
    hideTabMenu: hideTabMenu,
    closeOtherTabs: closeOtherTabs,
    moveTabLeft: moveTabLeft,
    moveTabRight: moveTabRight,
    applyTextStyle: applyTextStyle,
    toggleStylePicker: toggleStylePicker,
    smartClearFormat: smartClearFormat,
    formatCode: formatCode,
    lintCode: lintCode,
    showLintPanel: showLintPanel,
    toggleSpellCheck: toggleSpellCheck,
    toggleToolbar: toggleToolbar,
    toggleLineNumbers: toggleLineNumbers,
    checkGrammar: checkGrammar,
    openGotoLine: openGotoLine,
    closeGotoLine: closeGotoLine,
    previewGotoLine: previewGotoLine,
    commitGotoLine: commitGotoLine,
    openSearch: openSearch,
    closeSearch: closeSearch,
    runSearch: runSearch,
    searchNext: searchNext,
    searchPrev: searchPrev,
    toggleSearchOption: toggleSearchOption,
    toggleSearchReplace: toggleSearchReplace,
    replaceOne: replaceOne,
    replaceAll: replaceAll,
    insertFoldable: insertFoldable,
    toggleAllFolds: toggleAllFolds,
    insertColumns: insertColumns,
    toggleColPicker: toggleColPicker,
    toggleTablePicker: toggleTablePicker,
    showTableMenu: showTableMenu,
    hideTableMenu: hideTableMenu,
    tableAddColLeft: tableAddColLeft,
    tableAddColRight: tableAddColRight,
    tableMoveColLeft: tableMoveColLeft,
    tableMoveColRight: tableMoveColRight,
    tableAlignCol: tableAlignCol,
    tableDuplicateCol: tableDuplicateCol,
    tableDeleteCol: tableDeleteCol,
    tableAddRowAbove: tableAddRowAbove,
    tableAddRowBelow: tableAddRowBelow,
    tableMoveRowUp: tableMoveRowUp,
    tableMoveRowDown: tableMoveRowDown,
    tableDuplicateRow: tableDuplicateRow,
    tableDeleteRow: tableDeleteRow,
    tableDeleteWhole: tableDeleteWhole,
    hoverTableCell: hoverTableCell,
    insertTable: insertTable,
    copyAll: copyAll,
    /* Exposed so the clipboard handlers in initEditorExtensions can reuse
       the exact same line-boundary logic as the gutter, instead of a
       second copy that could drift out of agreement with it. */
    _plainTextForCounting: _plainTextForCounting,
    copyFileLink: copyFileLink,
    showLinkInsertMenu: showLinkInsertMenu,
    hideLinkCtxMenu: hideLinkCtxMenu,
    confirmInsertLink: confirmInsertLink,
    editLinkPrompt: editLinkPrompt,
    confirmEditLink: confirmEditLink,
    removeLink: removeLink,
    _handleLinkClick: _handleLinkClick,
    openSaveVersionModal: openSaveVersionModal,
    closeSaveVersionModal: closeSaveVersionModal,
    confirmSaveVersion: confirmSaveVersion,
    openVersionPreview: openVersionPreview,
    _refreshFile: _refreshFile,
    isActiveFileCode: isActiveFileCode,
    getActiveFileType: getActiveFileType,
    toggleInlineCode: toggleInlineCode,
    insertCodeBlock: insertCodeBlock,
    toggleSymbolPicker: toggleSymbolPicker,
    insertSymbolBullet: insertSymbolBullet,
    _filterSymbols: _filterSymbols,
    toggleCodeProblemsPanel: toggleCodeProblemsPanel,
    codeUndo: codeUndo,
    codeRedo: codeRedo,
    toggleSideNotes: toggleSideNotes,
    addSideNote: addSideNote,
    toggleNoteCheck: toggleNoteCheck,
    deleteNote: deleteNote,

};

})();

// ==========================================

// LINE NUMBERS & EDITOR BEHAVIOR EXTENSION 

// ==========================================

(function initEditorExtensions() {

    const textarea = document.getElementById('editor-textarea');

    const lineNumbers = document.getElementById('line-numbers');

    // Safety check

    if (!textarea || !lineNumbers) {

        console.error("Scribble Editor Error: Could not find the textarea or line-numbers element!");

        return;

    }

    console.log("Scribble Editor Extensions Loaded Successfully!");

    // 0. PREVENT TOOLBAR FROM STEALING FOCUS

    var toolbar = document.querySelector('.editor-toolbar');

    if (toolbar) {

        toolbar.addEventListener('mousedown', function(e) {

            if (e.target.tagName === 'SELECT') return;

            e.preventDefault();

        });

    }

    // CLOSE HIGHLIGHT PICKER ON OUTSIDE CLICK

    document.addEventListener('click', function() {

        var grid = document.getElementById('highlight-picker-grid');

        if (grid) grid.style.display = 'none';

    });

    document.addEventListener('click', function() {
        if (window.EDITOR_APP) {
            window.EDITOR_APP.hideTabMenu();
            window.EDITOR_APP.hideTableMenu();
            var symGrid = document.getElementById('symbol-picker-grid');
            if (symGrid) symGrid.style.display = 'none';
            window.EDITOR_APP.hideLinkCtxMenu();

        }

    });

    document.addEventListener('contextmenu', function() {

        if (window.EDITOR_APP) {

            window.EDITOR_APP.hideTabMenu();

            window.EDITOR_APP.hideTableMenu();

            // Don't hide link menu here — it opens on contextmenu

        }

    });

textarea.addEventListener('click', function(e) {

    var node = e.target;

    while (node && node !== textarea) {

        if (node.classList && (node.classList.contains('scribble-link') || node.classList.contains('scribble-link-mark'))) {

            var linkSpan = node.closest('.scribble-link');

            if (linkSpan) {

    e.preventDefault();

    e.stopPropagation();

    if (node.classList.contains('scribble-link-mark')) {

                    window.EDITOR_APP.showLinkInsertMenu(e, linkSpan);

                } else {

                    window.EDITOR_APP._handleLinkClick(linkSpan);

                }

                return;

            }

        }

        node = node.parentNode;

    }

});

    document.addEventListener('click', function() {

    var grid = document.getElementById('highlight-picker-grid');

    if (grid) grid.style.display = 'none';

    var sp = document.getElementById('style-picker-dropdown');

    if (sp) sp.style.display = 'none';

    var cp = document.getElementById('col-picker-grid');

    if (cp) cp.style.display = 'none';

    var tp = document.getElementById('table-picker-grid');

    if (tp) tp.style.display = 'none';

});

    // 1. SYNC SCROLLING

    textarea.addEventListener('scroll', () => {

        lineNumbers.scrollTop = textarea.scrollTop;

    });

    // 2. LINE NUMBER SYNC

    // Previously this re-measured every block's offsetTop on EVERY keystroke —

    // a forced layout reflow right after each DOM mutation. That's what caused

    // the Enter-key hesitation and the notebook-line shadows flickering/vanishing.

    // The module already computes correct numbers via handleInput() on every

    // input event — delegate to that single source instead of duplicating it.

    function updateLineNumbers() {

        if (window.EDITOR_APP && typeof window.EDITOR_APP.updateLineNumbers === 'function') {

            window.EDITOR_APP.updateLineNumbers();

        }

    }

    updateLineNumbers(); // Run once on load

    // 3. TAB KEY — navigate table cells, or insert 4 spaces

    textarea.addEventListener('keydown', function(e) {

        if (e.key === 'Tab') {

            e.preventDefault();

            // If cursor is inside a table cell, move to next/prev cell

            var sel = window.getSelection();

            if (sel && sel.rangeCount) {

                var node = sel.anchorNode;

                var cell = null;

                while (node && node !== textarea) {

                    if (node.nodeType === 1 && node.classList && node.classList.contains('tbl-cell')) {

                        cell = node; break;

                    }

                    node = node.parentNode;

                }

                if (cell) {

                    var table = cell.closest('.tbl-block');

                    if (table) {

                        var cells = Array.from(table.querySelectorAll('.tbl-cell'));

                        var idx   = cells.indexOf(cell);

                        var next  = e.shiftKey ? cells[idx - 1] : cells[idx + 1];

                        if (next) {

                            var range = document.createRange();

                            range.selectNodeContents(next);

                            range.collapse(false);

                            sel.removeAllRanges();

                            sel.addRange(range);

                        }

                        return; // don't fall through to spaces

                    }

                }

                // If cursor is inside a list item, Tab nests/un-nests the bullet

                var liNode = sel.anchorNode;

                while (liNode && liNode !== textarea) {

                    if (liNode.nodeType === 1 && liNode.nodeName === 'LI') {

                        document.execCommand(e.shiftKey ? 'outdent' : 'indent');

                        if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {

                            window.EDITOR_APP.handleInput();

                        }

                        return; // don't fall through to spaces

                    }

                    liNode = liNode.parentNode;

                }

            }

            // Default: insert 4 spaces

            document.execCommand('insertText', false, '    ');

            updateLineNumbers();

            if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {

                window.EDITOR_APP.handleInput();

            }

        }

    });

    // 4. ENTER: consistent paragraph behavior

    textarea.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        var sel = window.getSelection();
        if (sel && sel.rangeCount) {
            var node = sel.anchorNode;
            while (node && node !== textarea) {
                if (node.nodeType === 1 && node.classList.contains('task-item')) return;
                node = node.parentNode;
            }
        }
        // Code files: keep the document as flat plain text — a real '\n'

        // character, not a <p> or <br> element. This is what lets the

        // existing line-counter and the syntax highlighter both treat the

        // content as plain text with zero surprises.

        if (window.EDITOR_APP && window.EDITOR_APP.isActiveFileCode && window.EDITOR_APP.isActiveFileCode()) {

            e.preventDefault();

            document.execCommand('insertText', false, '\n');

            return;

        }
        if (e.shiftKey) {
            e.preventDefault();
            document.execCommand('insertHTML', false, '<br>');
            return;
        }
        e.preventDefault();
        document.execCommand('insertParagraph', false);
    });

// AUTO-CLOSE brackets/quotes + HTML tag auto-close — code files only.

    // Everything here exits on the very first line for non-code files, so

    // rich-text editing is completely untouched.

    var AUTO_PAIRS = { '(':')', '[':']', '{':'}', '"':'"', "'":"'" };

    var VOID_TAGS  = { area:1,base:1,br:1,col:1,embed:1,hr:1,img:1,input:1,link:1,meta:1,param:1,source:1,track:1,wbr:1 };

    textarea.addEventListener('keydown', function(e) {

        if (!window.EDITOR_APP || !window.EDITOR_APP.isActiveFileCode || !window.EDITOR_APP.isActiveFileCode()) return;

        var sel = window.getSelection();

        if (!sel || !sel.rangeCount || !sel.isCollapsed) return;

        var range = sel.getRangeAt(0);

        // Typing a closing char that's already right there — type through it

        if (')]}"\''.indexOf(e.key) !== -1) {

            var node = range.startContainer, offset = range.startOffset;

            if (node.nodeType === 3 && node.textContent.charAt(offset) === e.key) {

                e.preventDefault();

                var r = document.createRange();

                r.setStart(node, offset + 1);

                r.setEnd(node, offset + 1);

                sel.removeAllRanges();

                sel.addRange(r);

                return;

            }

        }

        // Auto-insert the matching close, cursor lands between the pair

        if (AUTO_PAIRS[e.key]) {

            e.preventDefault();

            document.execCommand('insertText', false, e.key + AUTO_PAIRS[e.key]);

            var sel2 = window.getSelection();

            if (sel2.rangeCount) {

                var r2 = sel2.getRangeAt(0);

                var back = document.createRange();

                back.setStart(r2.startContainer, r2.startOffset - 1);

                back.setEnd(r2.startContainer, r2.startOffset - 1);

                sel2.removeAllRanges();

                sel2.addRange(back);

            }

            return;

        }

        // HTML: typing '>' after an open tag auto-inserts the matching close

        if (e.key === '>' && (window.EDITOR_APP.getActiveFileType() === 'html' || window.EDITOR_APP.getActiveFileType() === 'htm')) {

            if (range.startContainer.nodeType === 3) {

                var before = range.startContainer.textContent.slice(0, range.startOffset);

                var m = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*)?)$/.exec(before);

                if (m && m[2].indexOf('/') === -1 && !VOID_TAGS[m[1].toLowerCase()]) {

                    e.preventDefault();

                    var closeTag = '</' + m[1] + '>';

                    document.execCommand('insertText', false, '>' + closeTag);

                    var sel3 = window.getSelection();

                    if (sel3.rangeCount) {

                        var r3 = sel3.getRangeAt(0);

                        var back3 = document.createRange();

                        back3.setStart(r3.startContainer, r3.startOffset - closeTag.length);

                        back3.setEnd(r3.startContainer, r3.startOffset - closeTag.length);

                        sel3.removeAllRanges();

                        sel3.addRange(back3);

                    }

                }

            }

        }

    });


    /* ══════════════════════════════════════════════════
       COPY / CUT — clipboard normalisation

       Every line in prose mode is its own <p>, styled by
       `#editor-textarea p { margin: 2px 0 }`. Word ignores
       that margin and applies its OWN paragraph spacing to
       each <p>, which is why a copied block arrived with a
       blank line between every line.

       Two clipboard flavours are written:
         text/plain — exactly one \n per line, via the same
                      block-boundary walker the gutter uses
         text/html  — the same markup with margin/padding
                      forced to 0 inline, so Word, Docs and
                      Outlook stop inserting paragraph gaps

       The editor itself is untouched; this only changes what
       leaves it.
    ══════════════════════════════════════════════════ */

    function _selectionHolder() {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
        var range = sel.getRangeAt(0);
        /* Only handle selections that live inside the editor. */
        if (!textarea.contains(range.commonAncestorContainer) &&
            range.commonAncestorContainer !== textarea) return null;
        var holder = document.createElement('div');
        holder.appendChild(range.cloneContents());
        return holder;
    }

    /* Reuses the gutter's walker so copy and the line count can
       never disagree about what a line is. */
    function _holderToPlain(holder) {
        var walk = window.EDITOR_APP && window.EDITOR_APP._plainTextForCounting;
        var text = walk ? walk(holder) : (holder.innerText || holder.textContent || '');
        return text.replace(/\n+$/, '');
    }

    function _holderToCleanHtml(holder) {
        var clone = holder.cloneNode(true);

        clone.querySelectorAll('*').forEach(function(el) {
            el.removeAttribute('contenteditable');
            el.removeAttribute('id');

            var tag = el.tagName;
            if (tag === 'P'  || tag === 'DIV' || tag === 'LI' ||
                tag === 'H1' || tag === 'H2'  || tag === 'H3' ||
                tag === 'H4' || tag === 'H5'  || tag === 'H6' ||
                tag === 'BLOCKQUOTE') {
                var style = el.getAttribute('style') || '';
                el.setAttribute('style',
                    style + ';margin:0;padding:0;line-height:1.4;');
            }
        });

        /* A trailing empty paragraph is the editor's own cursor
           placeholder, not content the user selected. */
        var last = clone.lastElementChild;
        while (last && !last.textContent.trim() &&
               (last.tagName === 'P' || last.tagName === 'DIV')) {
            clone.removeChild(last);
            last = clone.lastElementChild;
        }

        return clone.innerHTML;
    }

    function _writeClipboard(e) {
        var holder = _selectionHolder();
        if (!holder) return false;

        var plain = _holderToPlain(holder);
        if (!plain) return false;

        var cd = e.clipboardData || window.clipboardData;
        if (!cd) return false;

        cd.setData('text/plain', plain);
        try { cd.setData('text/html', _holderToCleanHtml(holder)); } catch (err) {}
        e.preventDefault();
        return true;
    }

    textarea.addEventListener('copy', function(e) { _writeClipboard(e); });

    textarea.addEventListener('cut', function(e) {
        /* Write the clean version first, then let the editor delete the
           selection through its own path so undo history stays correct. */
        if (_writeClipboard(e)) {
            document.execCommand('delete');
        }
    });

    // PASTE: preserve line breaks

    textarea.addEventListener('paste', function(e) {
        e.preventDefault();
        var plain = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (!plain) return;

        // Code files: paste as flat plain text with real '\n' characters —
        // matching exactly how Enter already behaves in code mode. Wrapping
        // pasted lines in <p> tags here was the source of the extra blank
        // line between every line once the highlighter re-read it back out.
        if (window.EDITOR_APP && window.EDITOR_APP.isActiveFileCode && window.EDITOR_APP.isActiveFileCode()) {
            var cleaned = plain.replace(/\r\n/g, '\n')
                .split('\n')
                .filter(function(line) { return line.trim() !== ''; })
                .join('\n');

            // execCommand('insertText') can take 20-30+ seconds on very
            // large pastes — it simulates the insert to preserve native
            // undo granularity, which isn't built for bulk text. Code
            // files use our own custom undo stack instead, so we can
            // skip execCommand entirely and manipulate the DOM directly.
            var sel = window.getSelection();
            if (sel && sel.rangeCount) {
                var range = sel.getRangeAt(0);
                range.deleteContents();
                var textNode = document.createTextNode(cleaned);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            // Direct DOM insertion doesn't fire a native 'input' event —
            // trigger the save/highlight/validate pipeline ourselves.
            if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {
                window.EDITOR_APP.handleInput();
            }
            return;
        }

        var html = plain
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .split('\n')
            .map(function(line) {
                return '<p>' + (line || '<br>') + '</p>';
            })
            .join('');
        document.execCommand('insertHTML', false, html);
        updateLineNumbers();
        if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {
            window.EDITOR_APP.handleInput();
        }
    });

    // 4. TASK LIST KEYBOARD HANDLING

    textarea.addEventListener('keydown', function(e) {

        var sel = window.getSelection();

        if (!sel || !sel.rangeCount) return;

        // find task-item ancestor

        var node = sel.anchorNode;

        var taskItem = null;

        while (node && node !== textarea) {

            if (node.nodeType === 1 && node.classList.contains('task-item')) {

                taskItem = node;

                break;

            }

            node = node.parentNode;

        }

        if (!taskItem) return;

        var ul = taskItem.parentNode;

        // ENTER → add a new task item below

        if (e.key === 'Enter') {

            e.preventDefault();

            var newItem = document.createElement('li');

            newItem.className = 'task-item';

            newItem.innerHTML = '<input type="checkbox" class="task-checkbox">&nbsp;';

            taskItem.insertAdjacentElement('afterend', newItem);

            var range = document.createRange();

            range.selectNodeContents(newItem);

            range.collapse(false);

            sel.removeAllRanges();

            sel.addRange(range);

            updateLineNumbers();

            if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {

                window.EDITOR_APP.handleInput();

            }

        }

        // BACKSPACE on empty task item → remove it

        if (e.key === 'Backspace') {

            var text = taskItem.textContent.replace(/[\u00a0\u200b\s]/g, '');

            if (text === '') {

                e.preventDefault();

                if (ul && ul.querySelectorAll('li').length <= 1) {

                    // last item — remove whole list, leave a clean line

                    var p = document.createElement('p');

                    p.innerHTML = '<br>';

                    ul.parentNode.insertBefore(p, ul.nextSibling);

                    ul.remove();

                    var r = document.createRange();

                    r.setStart(p, 0);

                    r.collapse(true);

                    sel.removeAllRanges();

                    sel.addRange(r);

                } else {

                    // remove just this item, move cursor to neighbour

                    var neighbour = taskItem.previousElementSibling || taskItem.nextElementSibling;

                    taskItem.remove();

                    if (neighbour) {

                        var r = document.createRange();

                        r.selectNodeContents(neighbour);

                        r.collapse(false);

                        sel.removeAllRanges();

                        sel.addRange(r);

                    }

                }

                updateLineNumbers();

                if (window.EDITOR_APP && typeof window.EDITOR_APP.handleInput === 'function') {

                    window.EDITOR_APP.handleInput();

                }

            }

        }

   });

// 5. CTRL+F → OPEN SEARCH · ESCAPE → CLOSE SEARCH · CTRL+Z/Y → CODE UNDO/REDO

    document.addEventListener('keydown', function(e) {

        if ((e.ctrlKey || e.metaKey) && window.EDITOR_APP && window.EDITOR_APP.isActiveFileCode && window.EDITOR_APP.isActiveFileCode()) {
            var key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                window.EDITOR_APP.codeUndo();
                return;
            }
            if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                window.EDITOR_APP.codeRedo();
                return;
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
            var overlay = document.getElementById('editor-overlay');
            if (overlay && overlay.style.display !== 'none') {
                e.preventDefault();
                window.EDITOR_APP.openGotoLine();
            }
        }

        if (e.key === 'Escape') {
            var panel = document.getElementById('search-panel');
            if (panel && panel.style.display !== 'none') {
                window.EDITOR_APP.closeSearch();
            }
        }

    });

})();

// 4. EXTERNAL FILE DRAG & DROP

    const editorBody = document.getElementById('editor-body');

    const ALLOWED_TYPES = ['text/plain', 'text/html', 'text/css', 'application/javascript', 'text/javascript'];

    const ALLOWED_EXTS  = ['.txt', '.html', '.htm', '.css', '.js', '.json'];

    function isAllowedFile(file) {

        var extMatch = ALLOWED_EXTS.some(ext => file.name.toLowerCase().endsWith(ext));

        var typeMatch = ALLOWED_TYPES.includes(file.type);

        return extMatch || typeMatch;

    }

    editorBody.addEventListener('dragover', function(e) {

        var items = Array.from(e.dataTransfer.items || []);

        var hasFile = items.some(i => i.kind === 'file');

        if (!hasFile) return; // let tab drag still work

        e.preventDefault();

        editorBody.classList.add('file-drag-over');

    });

    editorBody.addEventListener('dragleave', function(e) {

        // only clear if leaving the body entirely

        if (!editorBody.contains(e.relatedTarget)) {

            editorBody.classList.remove('file-drag-over');

        }

    });

    editorBody.addEventListener('drop', function(e) {

        editorBody.classList.remove('file-drag-over');

        var files = Array.from(e.dataTransfer.files);

        if (!files.length) return; // was a tab drag, not a file

        e.preventDefault();

        e.stopPropagation();

        var file = files[0]; // handle one file at a time

        if (!isAllowedFile(file)) {

            window.EDITOR_APP.showConfirm(

                'Unsupported file type',

                '"' + file.name + '" is not a supported type. Try .txt, .html, .css, or .js.',

                null

            );

            return;

        }

        var reader = new FileReader();

        reader.onload = function(ev) {

            var text = ev.target.result;

            var preview = text.length > 80 ? text.substring(0, 80).trim() + '…' : text.trim();

            window.EDITOR_APP.showConfirm(

                'Insert contents of ' + file.name + '?',

                'Will be pasted at your cursor. Preview:\n"' + preview + '"',

                function() { insertAtCursor(text); },

                'Insert'

            );

        };

        reader.readAsText(file);

    });

    function insertAtCursor(text) {

    var html = text

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .split('\n')

        .map(function(line) { return '<p>' + (line || '<br>') + '</p>'; })

        .join('');

    document.execCommand('insertHTML', false, html);

    var ta = document.getElementById('editor-textarea');

    ta.dispatchEvent(new Event('input')); // ← triggers all listeners at once

}