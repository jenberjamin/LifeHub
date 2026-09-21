/* ═══════════════════════════════════════════════════
   PASSHUB — ABOUT ME
   js/PassHub-about.js

   Two section shapes:

     type: 'fields'   flat label/value pairs.
                      Personal Information — one of each.

     type: 'records'  a defined field shape, then as many
                      entries as you want. Employment, schools,
                      health visits — things that repeat.

   Every field carries a `key` alongside its `label`. The label
   is yours to rename freely; the key is what Poppy reads and it
   never changes once created. That separation is the whole
   point — rename "Date of Birth" to "Birthday" and Poppy's
   script keeps working.
═══════════════════════════════════════════════════ */

(function () {
'use strict';

const DB_PATH   = 'passhub/about';
const LOCAL_KEY = 'PH_ABOUT_CACHE';

// ── STATE ─────────────────────────────────────────
let state    = { sections: [], updatedAt: null };
let editMode = false;
let dirty    = false;
let saveTimer = null;

// ── ELEMENTS ──────────────────────────────────────
const elProfile   = document.getElementById('profile');
const elSaveState = document.getElementById('save-state');
const btnEdit     = document.getElementById('btn-edit');
const btnAdd      = document.getElementById('btn-add-section');
const btnPoppy    = document.getElementById('btn-poppy');

// ═══════════════════════════════════════════════════
//  KEYS
//  Slugged from the label at creation, then frozen.
//  Deduped within scope so two fields can share a label
//  without colliding underneath.
// ═══════════════════════════════════════════════════
function slug(text) {
    const s = String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return s || 'field';
}

function uniqueKey(base, taken) {
    let key = base, n = 2;
    while (taken.includes(key)) { key = base + '_' + n; n++; }
    return key;
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ═══════════════════════════════════════════════════
//  SEED
//  Starting labels only — rename, delete, or add to any
//  of these. They exist so the page isn't a blank wall.
// ═══════════════════════════════════════════════════
function seed() {
    const mk = (label, type) => ({
        id: uid(), key: slug(label), label: label, type: type || 'text', value: ''
    });
    const def = (label, type) => ({ key: slug(label), label: label, type: type || 'text' });

    return {
        updatedAt: null,
        sections: [
            {
                id: uid(), key: 'personal_information', title: 'Personal Information',
                type: 'fields',
                fields: [
                    mk('Full Name'), mk('Nickname'), mk('Date of Birth', 'date'),
                    mk('Place of Birth'), mk('Sex'), mk('Civil Status'),
                    mk('Nationality'), mk('Current Address', 'long'),
                    mk('Contact Number'), mk('Email Address'),
                    mk('Blood Type'), mk('Languages Spoken')
                ]
            },
            {
                id: uid(), key: 'family_background', title: 'Family Background',
                type: 'records',
                fieldDefs: [ def('Relationship'), def('Name'), def('Occupation'),
                             def('Contact'), def('Notes', 'long') ],
                entries: []
            },
            {
                id: uid(), key: 'health_records', title: 'Health Records',
                type: 'records',
                fieldDefs: [ def('Date', 'date'), def('Type'), def('Provider'),
                             def('Details', 'long'), def('Status') ],
                entries: []
            },
            {
                id: uid(), key: 'educational_attainment', title: 'Educational Attainment',
                type: 'records',
                fieldDefs: [ def('Level'), def('School'), def('Program'),
                             def('Years Attended'), def('Notes', 'long') ],
                entries: []
            },
            {
                id: uid(), key: 'employment_records', title: 'Employment Records',
                type: 'records',
                fieldDefs: [ def('Position'), def('Company'), def('Employment Type'),
                             def('Period'), def('Responsibilities', 'long') ],
                entries: []
            }
        ]
    };
}

// ═══════════════════════════════════════════════════
//  STORAGE
//  Firebase is the source of truth; localStorage is a
//  mirror so the page still opens if the network drops.
// ═══════════════════════════════════════════════════
function getRef() {
    try {
        if (window.PH_DB && typeof window.PH_DB.ref === 'function') {
            return window.PH_DB.ref(DB_PATH);
        }
        if (window.firebase && typeof window.firebase.database === 'function') {
            return window.firebase.database().ref(DB_PATH);
        }
    } catch (e) { /* fall through to local-only */ }
    return null;
}

function setSaveState(text, cls) {
    elSaveState.textContent = text;
    elSaveState.className = 'save-state' + (cls ? ' ' + cls : '');
}

function markDirty() {
    dirty = true;
    setSaveState('Unsaved', 'is-dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 900);   // autosave, debounced
}

function save() {
    clearTimeout(saveTimer);
    state.updatedAt = new Date().toISOString();

    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch (e) {}

    const ref = getRef();
    if (!ref) {
        dirty = false;
        setSaveState('Saved locally');
        return;
    }

    setSaveState('Saving…');
    ref.set(state)
        .then(() => { dirty = false; setSaveState('Saved'); })
        .catch(() => setSaveState('Save failed', 'is-error'));
}

function load() {
    // Paint from cache first so there's no empty flash.
    try {
        const cached = localStorage.getItem(LOCAL_KEY);
        if (cached) { state = JSON.parse(cached); render(); }
    } catch (e) {}

    const ref = getRef();
    if (!ref) {
        if (!state.sections || !state.sections.length) { state = seed(); }
        render();
        setSaveState('Local only');
        return;
    }

    ref.once('value')
        .then(snap => {
            const data = snap.val();
            state = (data && data.sections && data.sections.length) ? data : seed();
            render();
            setSaveState('Saved');
        })
        .catch(() => {
            if (!state.sections || !state.sections.length) { state = seed(); }
            render();
            setSaveState('Offline', 'is-error');
        });
}

// ═══════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls)  n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function valueInput(type, value, onInput) {
    let node;
    if (type === 'long') {
        node = document.createElement('textarea');
    } else {
        node = document.createElement('input');
        node.type = (type === 'date') ? 'date' : 'text';
    }
    node.value = value || '';
    node.addEventListener('input', () => { onInput(node.value); markDirty(); });
    return node;
}

function render() {
    elProfile.innerHTML = '';
    btnEdit.textContent = editMode ? 'Done editing' : 'Edit';
    btnEdit.classList.toggle('is-active', editMode);
    btnAdd.hidden = !editMode;

    if (!state.sections.length) {
        const e = el('div', 'empty');
        e.innerHTML = 'Nothing here yet.<br>Switch on Edit and add your first section.';
        elProfile.appendChild(e);
        return;
    }

    state.sections.forEach((section, idx) => {
        elProfile.appendChild(
            section.type === 'records'
                ? renderRecordSection(section, idx)
                : renderFieldSection(section, idx)
        );
    });
}

function sectionShell(section, idx) {
    const wrap = el('section', 'section');
    const head = el('div', 'section-head');

    if (editMode) {
        const t = document.createElement('input');
        t.type = 'text';
        t.className = 'title-input';
        t.value = section.title;
        t.addEventListener('input', () => { section.title = t.value; markDirty(); });
        head.appendChild(t);

        head.appendChild(el('span', 'section-key', section.key));

        if (idx > 0) {
            const up = el('button', 'mini', '↑');
            up.title = 'Move up';
            up.addEventListener('click', () => {
                state.sections.splice(idx - 1, 0, state.sections.splice(idx, 1)[0]);
                markDirty(); render();
            });
            head.appendChild(up);
        }
        if (idx < state.sections.length - 1) {
            const down = el('button', 'mini', '↓');
            down.title = 'Move down';
            down.addEventListener('click', () => {
                state.sections.splice(idx + 1, 0, state.sections.splice(idx, 1)[0]);
                markDirty(); render();
            });
            head.appendChild(down);
        }

        const del = el('button', 'mini is-danger', 'Delete');
        del.addEventListener('click', () => {
            if (confirm('Delete the "' + section.title + '" section and everything in it?')) {
                state.sections.splice(idx, 1);
                markDirty(); render();
            }
        });
        head.appendChild(del);
    } else {
        head.appendChild(el('div', 'section-title', section.title));
    }

    wrap.appendChild(head);
    return wrap;
}

// ── FLAT FIELDS ───────────────────────────────────
function renderFieldSection(section, idx) {
    const wrap = sectionShell(section, idx);
    const body = el('div', 'section-body');

    const visible = editMode
        ? section.fields
        : section.fields.filter(f => String(f.value || '').trim() !== '');

    if (!visible.length) {
        body.appendChild(el('div', 'empty', editMode
            ? 'No fields yet — add one below.'
            : 'Nothing filled in here yet.'));
    }

    visible.forEach(field => {
        const row = el('div', 'field');

        if (editMode) {
            const lab = document.createElement('input');
            lab.type = 'text';
            lab.className = 'label-input';
            lab.value = field.label;
            lab.addEventListener('input', () => { field.label = lab.value; markDirty(); });
            row.appendChild(lab);

            const right = el('div');
            right.appendChild(valueInput(field.type, field.value, v => { field.value = v; }));

            const meta = el('div', 'row-actions');
            meta.appendChild(el('span', 'section-key', field.key));
            const rm = el('button', 'mini is-danger', 'Remove');
            rm.addEventListener('click', () => {
                if (confirm('Remove "' + field.label + '"?')) {
                    section.fields = section.fields.filter(f => f.id !== field.id);
                    markDirty(); render();
                }
            });
            meta.appendChild(rm);
            right.appendChild(meta);
            row.appendChild(right);
        } else {
            row.appendChild(el('div', 'field-label', field.label));
            row.appendChild(el('div', 'field-value', field.value));
        }
        body.appendChild(row);
    });

    if (editMode) {
        const actions = el('div', 'row-actions');
        const add = el('button', 'mini', '+ Add field');
        add.addEventListener('click', () => {
            const label = prompt('Field label (e.g. "Height")');
            if (!label) return;
            const taken = section.fields.map(f => f.key);
            section.fields.push({
                id: uid(), key: uniqueKey(slug(label), taken),
                label: label.trim(), type: 'text', value: ''
            });
            markDirty(); render();
        });
        actions.appendChild(add);
        body.appendChild(actions);
    }

    wrap.appendChild(body);
    return wrap;
}

// ── REPEATING RECORDS ─────────────────────────────
function renderRecordSection(section, idx) {
    const wrap = sectionShell(section, idx);
    const body = el('div', 'section-body');

    if (!section.entries.length) {
        body.appendChild(el('div', 'empty', editMode
            ? 'No entries yet — add one below.'
            : 'No entries recorded yet.'));
    }

    section.entries.forEach((entry, ei) => {
        const card = el('div', 'record');
        const head = el('div', 'record-head');
        head.appendChild(el('span', 'record-index', section.title + ' — ' + (ei + 1)));

        if (editMode) {
            const rm = el('button', 'mini is-danger', 'Remove');
            rm.addEventListener('click', () => {
                if (confirm('Remove this entry?')) {
                    section.entries.splice(ei, 1);
                    markDirty(); render();
                }
            });
            head.appendChild(rm);
        }
        card.appendChild(head);

        section.fieldDefs.forEach(def => {
            const val = entry.values[def.key] || '';
            if (!editMode && String(val).trim() === '') return;

            const row = el('div', 'field');
            row.appendChild(el('div', 'field-label', def.label));
            if (editMode) {
                const holder = el('div');
                holder.appendChild(valueInput(def.type, val, v => { entry.values[def.key] = v; }));
                row.appendChild(holder);
            } else {
                row.appendChild(el('div', 'field-value', val));
            }
            card.appendChild(row);
        });

        body.appendChild(card);
    });

    if (editMode) {
        const actions = el('div', 'row-actions');

        const addEntry = el('button', 'mini', '+ Add entry');
        addEntry.addEventListener('click', () => {
            section.entries.push({ id: uid(), values: {} });
            markDirty(); render();
        });
        actions.appendChild(addEntry);

        const addField = el('button', 'mini', '+ Add field to this shape');
        addField.addEventListener('click', () => {
            const label = prompt('New field for every ' + section.title + ' entry:');
            if (!label) return;
            const taken = section.fieldDefs.map(d => d.key);
            section.fieldDefs.push({
                key: uniqueKey(slug(label), taken), label: label.trim(), type: 'text'
            });
            markDirty(); render();
        });
        actions.appendChild(addField);

        body.appendChild(actions);
    }

    wrap.appendChild(body);
    return wrap;
}

// ═══════════════════════════════════════════════════
//  ADD SECTION
// ═══════════════════════════════════════════════════
const overlayAdd = document.getElementById('overlay-add');
const inputTitle = document.getElementById('new-title');

btnAdd.addEventListener('click', () => {
    inputTitle.value = '';
    document.querySelector('input[name="new-type"][value="fields"]').checked = true;
    overlayAdd.hidden = false;
    inputTitle.focus();
});

document.getElementById('add-cancel').addEventListener('click', () => {
    overlayAdd.hidden = true;
});

document.getElementById('add-confirm').addEventListener('click', () => {
    const title = inputTitle.value.trim();
    if (!title) { inputTitle.focus(); return; }

    const type = document.querySelector('input[name="new-type"]:checked').value;
    const taken = state.sections.map(s => s.key);
    const section = {
        id: uid(), key: uniqueKey(slug(title), taken), title: title, type: type
    };

    if (type === 'records') {
        section.fieldDefs = [{ key: 'detail', label: 'Detail', type: 'text' }];
        section.entries = [];
    } else {
        section.fields = [];
    }

    state.sections.push(section);
    overlayAdd.hidden = true;
    markDirty(); render();
});

inputTitle.addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('add-confirm').click();
});

// ═══════════════════════════════════════════════════
//  POPPY EXPORT
//  Two shapes: JSON for the script to parse, and a plain
//  outline for pasting straight into a system prompt.
//  Empty values are dropped either way — Poppy shouldn't
//  read blanks as facts.
// ═══════════════════════════════════════════════════
const overlayPoppy = document.getElementById('overlay-poppy');
const exportBox    = document.getElementById('export-box');
let exportFormat   = 'text';

function buildJSON() {
    const out = {};
    state.sections.forEach(section => {
        if (section.type === 'records') {
            const rows = section.entries.map(entry => {
                const o = {};
                section.fieldDefs.forEach(def => {
                    const v = String(entry.values[def.key] || '').trim();
                    if (v) o[def.key] = v;
                });
                return o;
            }).filter(o => Object.keys(o).length);
            if (rows.length) out[section.key] = rows;
        } else {
            const o = {};
            section.fields.forEach(f => {
                const v = String(f.value || '').trim();
                if (v) o[f.key] = v;
            });
            if (Object.keys(o).length) out[section.key] = o;
        }
    });
    return JSON.stringify({ about: out, updated: state.updatedAt }, null, 2);
}

function buildText() {
    const lines = [];
    state.sections.forEach(section => {
        const block = [];
        if (section.type === 'records') {
            section.entries.forEach((entry, i) => {
                const rows = section.fieldDefs
                    .map(def => {
                        const v = String(entry.values[def.key] || '').trim();
                        return v ? '  - ' + def.label + ': ' + v : null;
                    })
                    .filter(Boolean);
                if (rows.length) {
                    block.push('  [' + (i + 1) + ']');
                    block.push(rows.join('\n'));
                }
            });
        } else {
            section.fields.forEach(f => {
                const v = String(f.value || '').trim();
                if (v) block.push('  - ' + f.label + ': ' + v);
            });
        }
        if (block.length) {
            lines.push(section.title.toUpperCase());
            lines.push(block.join('\n'));
            lines.push('');
        }
    });
    return lines.length ? lines.join('\n').trim() : 'Nothing filled in yet.';
}

function paintExport() {
    exportBox.value = (exportFormat === 'json') ? buildJSON() : buildText();
    document.getElementById('fmt-text').classList.toggle('is-active', exportFormat === 'text');
    document.getElementById('fmt-json').classList.toggle('is-active', exportFormat === 'json');
}

btnPoppy.addEventListener('click', () => {
    overlayPoppy.hidden = false;
    paintExport();
});

document.getElementById('fmt-text').addEventListener('click', () => { exportFormat = 'text'; paintExport(); });
document.getElementById('fmt-json').addEventListener('click', () => { exportFormat = 'json'; paintExport(); });
document.getElementById('poppy-close').addEventListener('click', () => { overlayPoppy.hidden = true; });

document.getElementById('poppy-copy').addEventListener('click', () => {
    const btn = document.getElementById('poppy-copy');
    exportBox.select();
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1400); };
    if (navigator.clipboard) {
        navigator.clipboard.writeText(exportBox.value).then(done).catch(() => {
            document.execCommand('copy'); done();
        });
    } else {
        document.execCommand('copy'); done();
    }
});

// ═══════════════════════════════════════════════════
//  WIRING
// ═══════════════════════════════════════════════════
btnEdit.addEventListener('click', () => {
    editMode = !editMode;
    if (!editMode && dirty) save();
    render();
});

// Esc closes whichever panel is open.
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    overlayAdd.hidden = true;
    overlayPoppy.hidden = true;
});

// Don't let an unsaved edit walk out the door.
window.addEventListener('beforeunload', e => {
    if (dirty) { save(); e.preventDefault(); e.returnValue = ''; }
});

load();

})();
