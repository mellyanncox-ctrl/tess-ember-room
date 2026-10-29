/* The Ember Room website editor, laid out like the Squarespace back office.
   Browse mode: a Pages sidebar and a live preview you can click around.
   Edit mode: click anything on the page to change it. Hover a section for its toolbar and
   the "Add Section" buttons. Undo/redo, Save, Exit. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const API = qs.get('api') || window.EDITOR_API;
  const DEBUG = qs.has('debug');
  const TOKEN_KEY = 'ember-editor-token';
  const PAGE_NAMES = { index: 'Home', 'somatic-therapy-norwood': 'Individual therapy', 'couples-therapy-adelaide': 'Couples therapy', 'guided-rest': 'Guided Rest', 'people-pleasing': 'Online course', 'fees-faq': 'Fees & FAQ', book: 'Book', about: 'About', privacy: 'Privacy' };
  const HIDDEN_PAGES = ['section-library'];
  const DATA = { site: '_data/site.yml', practice: '_data/practice.yml', faq: '_data/faq.yml' };
  const BRAND_VARS = { plum: ['--ink', '--ink-2'], plum_deep: ['--plum-deep'], charcoal: ['--char'], stone: ['--stone', '--stone-2'], terracotta: ['--terra'], terracotta_text: ['--terra-deep'], dust: ['--dust'] };
  const BRAND_DEFAULTS = { plum: '#5B2A38', plum_deep: '#3A1621', charcoal: '#303636', stone: '#E5E3DC', terracotta: '#D4967D', terracotta_text: '#A35A40', dust: '#D9C3C0' };
  const TEXT_SEL = ':is(p,li,h1,h3,summary,blockquote,dt,dd,small,.cap,.mark,.sub,.tag,.trio span,.pill,.price,.what):not(.btn)';
  const LIB_GROUPS = ['All', 'Headers', 'Text', 'Images', 'Lists & tabs', 'Offers & prices', 'Journal', 'Closing'];

  /* ---------- icons (line icons, drawn inline) ----------
     Icon shapes adapted from Lucide (https://lucide.dev), ISC License.
     Copyright (c) Lucide Contributors. Permission to use, copy, modify, and/or distribute this software
     for any purpose with or without fee is hereby granted, provided that the above copyright notice and
     this permission notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS
     ALL WARRANTIES WITH REGARD TO THIS SOFTWARE. */
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7h2A5.5 5.5 0 0 0 22 11c0-5-4.5-9-10-9z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    journal: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', faq: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', help: '<path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    unlink: '<path d="m18.8 13.4 1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7M5.2 10.6l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7M8 2v3M2 8h3M16 22v-3M22 16h-3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    select: '<path d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  const setIcon = (el, n, label) => { el.innerHTML = icon(n) + (label ? '<span>' + label + '</span>' : ''); };
  [['#btn-back', 'back'], ['#btn-new', 'plus'], ['#btn-page', 'gear'], ['#btn-undo', 'undo'], ['#btn-redo', 'redo'], ['#btn-styles', 'palette'], ['#dev-desktop', 'monitor'], ['#dev-mobile', 'phone'], ['#lib-close', 'x'], ['#panel-close', 'x']].forEach(([s, n]) => setIcon($(s), n));
  $$('[data-icon]').forEach((b) => { const t = b.textContent; b.innerHTML = '<span class="ic">' + icon(b.dataset.icon) + '</span>' + (t ? '<span class="nm">' + t + '</span>' : ''); });

  const phone = () => matchMedia('(max-width: 760px)').matches;
  let token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  const st = { files: {}, orig: {}, dirty: new Set(), uploads: {}, page: null, schema: null, pages: [], doc: null, editing: null, sel: null, undo: [], redo: [], loginPw: null, mode: 'browse', hover: null, libDoc: null, ready: false };

  /* ---------- server ---------- */
  async function call(action, data = {}) {
    if (!API) throw new Error('The editor is not connected yet.');
    let r;
    try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data }) }); }
    catch (e) { throw new Error('Could not reach the editor. Check your internet connection and try again.'); }
    const j = await r.json().catch(() => ({ error: 'No response from the editor service.' }));
    if (r.status === 401 && action !== 'login') { logout(j.error); throw new Error(j.error); }
    if (!r.ok) throw new Error(j.error || 'Something went wrong.');
    return j;
  }

  /* ---------- files ---------- */
  function parseFront(raw) {
    if (!raw.startsWith('---\n')) return { data: {}, body: raw };
    const end = raw.indexOf('\n---', 4);
    const after = raw.indexOf('\n', end + 1);
    return { data: jsyaml.load(raw.slice(4, end)) || {}, body: after === -1 ? '' : raw.slice(after + 1) };
  }
  const dump = (d) => jsyaml.dump(d, { lineWidth: -1, noRefs: true, quotingType: '"' });
  function serialize(f) { return f.kind === 'yaml' ? dump(f.data) : '---\n' + dump(f.data) + '---\n' + (f.body || ''); }
  function parseFile(kind, content) { return kind === 'yaml' ? { kind, data: jsyaml.load(content) || {} } : { kind, ...parseFront(content) }; }
  async function readFile(path, kind) {
    if (st.files[path]) return st.files[path];
    const r = await call('read', { path });
    const f = parseFile(kind, r.content);
    f.path = path; st.files[path] = f; st.orig[path] = serialize(f); return f;
  }
  function markDirty(path) { st.dirty.add(path); updateBar(); }
  function recomputeDirty() {
    st.dirty = new Set(Object.keys(st.files).filter((p) => { const f = st.files[p]; return f.delete || st.orig[p] == null || serialize(f) !== st.orig[p]; }));
    updateBar();
  }
  function hasChanges() { return st.dirty.size > 0 || Object.keys(st.uploads).length > 0; }
  function updateBar() {
    $('#btn-save').disabled = !hasChanges();
    $('#btn-undo').disabled = !st.undo.length;
    $('#btn-redo').disabled = !st.redo.length;
    const s = $('#status'); s.textContent = hasChanges() ? 'Unsaved changes' : ''; s.classList.toggle('unsaved', hasChanges());
  }

  /* ---------- helpers ---------- */
  const isIdx = (k) => /^\d+$/.test(k);
  function getAt(o, path) { if (!path) return o; return path.split('.').reduce((a, k) => (a == null ? a : a[isIdx(k) ? +k : k]), o); }
  function setAt(o, path, v) {
    const ks = path.split('.'); let a = o;
    ks.slice(0, -1).forEach((k, i) => { const key = isIdx(k) ? +k : k; if (a[key] == null) a[key] = isIdx(ks[i + 1]) ? [] : {}; a = a[key]; });
    const last = ks[ks.length - 1]; a[isIdx(last) ? +last : last] = v;
  }
  function delAt(o, path) { const ks = path.split('.'); const parent = getAt(o, ks.slice(0, -1).join('.')); if (parent && typeof parent === 'object') delete parent[ks[ks.length - 1]]; }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function unesc(s) { const t = document.createElement('textarea'); t.innerHTML = s == null ? '' : String(s); return t.value; }
  function fill(s) {
    const p = (st.files[DATA.practice] || {}).data || {}; const f = p.fees || {}; const c = p.course || {};
    const map = { '[days]': p.days, '[street]': p.street, '[email]': p.email, '[individual-60]': f.individual_60, '[individual-90]': f.individual_90, '[couples-60]': f.couples_60, '[couples-90]': f.couples_90, '[rest-60]': f.rest_60, '[rest-90]': f.rest_90, '[course]': c.price, '[course-sessions]': c.with_sessions, '[sessions-value]': c.sessions_value };
    let out = s == null ? '' : String(s);
    for (const k in map) out = out.split(k).join(map[k] == null ? k : map[k]);
    return out;
  }
  function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'page'; }
  let toastT; function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }
  function toHex(c) {
    if (!c) return '';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c.slice(1).split('').map((x) => x + x).join('')).toUpperCase();
    const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase() : '';
  }
  const validColour = (c) => /^#[0-9A-F]{6}$/i.test(c || '');
  function pageLabel(name) {
    const menu = (st.files[DATA.site] && st.files[DATA.site].data.menu) || [];
    const m = menu.find((x) => x.link === name + '.html');
    return PAGE_NAMES[name] || (m && unesc(m.label)) || name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  /* clean up what the browser produces while typing */
  const BLOCK_OK = new Set(['P', 'H3', 'UL', 'OL', 'LI', 'BR', 'B', 'STRONG', 'EM', 'I', 'A', 'SPAN']);
  function clean(html, inline) {
    const d = document.createElement('div'); d.innerHTML = html;
    (function walk(n) {
      [...n.childNodes].forEach((c) => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        walk(c);
        if (c.tagName === 'FONT' && c.getAttribute('color')) { const s = document.createElement('span'); s.style.color = c.getAttribute('color'); s.append(...c.childNodes); c.replaceWith(s); c = s; }
        if (c.tagName === 'DIV') { const p = document.createElement(inline ? 'span' : 'p'); p.append(...c.childNodes); c.replaceWith(p); if (inline) p.replaceWith(...p.childNodes); return; }
        if (!BLOCK_OK.has(c.tagName) || (inline && ['P', 'H3', 'UL', 'OL', 'LI'].includes(c.tagName))) { if (inline && c.tagName === 'P' && c.nextSibling) c.after(document.createElement('br')); c.replaceWith(...c.childNodes); return; }
        if (c.tagName === 'SPAN') {
          const col = toHex(c.style.color);
          if (!validColour(col)) { c.replaceWith(...c.childNodes); return; }
          [...c.attributes].forEach((a) => c.removeAttribute(a.name)); c.setAttribute('style', 'color:' + col); return;
        }
        [...c.attributes].forEach((a) => { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
      });
    })(d);
    let out = d.innerHTML.replace(/<p><\/p>/g, '').replace(/(<br>)+$/, '').trim();
    if (!inline && out && !/^<(p|h3|ul|ol)/.test(out)) out = '<p>' + out + '</p>';
    return out;
  }

  /* ---------- where an element's words live ---------- */
  const keyOf = (el) => el.dataset.e ?? (el.dataset.eb != null ? el.dataset.eb + '.label' : null);
  function ctxOf(el, key) {
    key = key ?? keyOf(el) ?? el.dataset.eg ?? el.dataset.ei;
    if (key.startsWith('@')) { const [file, path] = key.slice(1).split(':'); return { file: DATA[file], obj: st.files[DATA[file]].data, path, prefix: '@' + file + ':', scope: st.doc.body }; }
    const sec = el.closest('main > [data-s]');
    return { file: st.page.path, obj: sec.__sec, path: key, prefix: '', scope: sec, sec };
  }
  function kindOf(el) { return el.dataset.et || 'text'; }
  function render(el, v) {
    const k = kindOf(el);
    if (k === 'text') el.innerHTML = fill(v);
    else if (k === 'lines') el.innerHTML = fill(v).trim().replace(/\n/g, '<br>');
    else if (k === 'inline') el.innerHTML = fill(v).replace(/<\/?p>/g, '').trim();
    else { el.innerHTML = fill(v); if (el.closest('.panel') && /\.body$/.test(el.dataset.e)) $$('p', el).forEach((p) => p.classList.add('body')); }
  }
  function refreshAll() {
    if (!st.doc) return;
    $$('[data-e],[data-eb]', st.doc).forEach((el) => { if (el === st.editing) return; try { const t = ctxOf(el); const v = getAt(t.obj, t.path); if (v != null) render(el, v); } catch (e) {} });
    applyColours();
  }

  /* ---------- undo / redo ---------- */
  function stateJSON() {
    const files = {}; for (const p in st.files) { const f = st.files[p]; files[p] = { kind: f.kind, path: f.path, data: f.data, body: f.body, html: f.html, delete: f.delete, name: f.name }; }
    return JSON.stringify({ files, uploads: Object.keys(st.uploads) });
  }
  function snapshot() { return { json: stateJSON(), uploads: { ...st.uploads }, html: st.doc ? st.doc.body.innerHTML : null, page: st.page && st.page.path }; }
  function checkpoint() {
    const snap = snapshot(); const top = st.undo[st.undo.length - 1];
    if (top && top.json === snap.json) return;
    st.undo.push(snap); if (st.undo.length > 60) st.undo.shift(); st.redo = []; updateBar();
  }
  function dropIfUnchanged() { const top = st.undo[st.undo.length - 1]; if (top && top.json === stateJSON()) { st.undo.pop(); updateBar(); } }
  function restore(snap) {
    hidePanelOnly(); clearSel(); hideLib();
    const s = JSON.parse(snap.json);
    st.files = {}; for (const p in s.files) st.files[p] = s.files[p];
    st.uploads = snap.uploads;
    if (snap.page && st.files[snap.page]) { const name = st.page && st.page.name; st.page = st.files[snap.page]; st.page.name = st.page.name || name; }
    if (st.doc && snap.html != null) {
      st.doc.body.innerHTML = snap.html;
      $$('.ee-editing', st.doc).forEach((x) => { x.classList.remove('ee-editing'); x.removeAttribute('contenteditable'); });
      $$('.ee-sel', st.doc).forEach((x) => x.classList.remove('ee-sel'));
      $$('canvas.bg[data-src]', st.doc).forEach((c) => { if (!c.style.background) c.style.background = `url('${c.dataset.src}') center/cover`; });
      const secs = st.page.data.sections || [];
      sectionNodes().forEach((n, i) => { n.__sec = secs[i]; });
      refreshAll();
    }
    st.hover = null; drawOverlay(); recomputeDirty();
  }
  function undo() { if (st.editing) finishEdit(); const snap = st.undo.pop(); if (!snap) return updateBar(); st.redo.push(snapshot()); restore(snap); toast('Undone'); }
  function redo() { if (st.editing) finishEdit(); const snap = st.redo.pop(); if (!snap) return updateBar(); st.undo.push(snapshot()); restore(snap); toast('Redone'); }

  /* ---------- inline editing ---------- */
  function startEdit(el) {
    if (st.editing === el) return;
    finishEdit();
    checkpoint();
    const t = ctxOf(el); const v = getAt(t.obj, t.path) ?? '';
    const k = kindOf(el);
    st.editing = el; el.__before = v;
    if (k === 'text' || k === 'lines') { el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.innerText = unesc(v); }
    else { el.contentEditable = 'true'; el.innerHTML = v; if (k === 'rich' && el.closest('.panel') && /\.body$/.test(el.dataset.e)) $$('p', el).forEach((p) => p.classList.add('body')); st.doc.execCommand('defaultParagraphSeparator', false, 'p'); st.doc.execCommand('styleWithCSS', false, true); }
    el.classList.add('ee-editing');
    el.focus();
    const r = st.doc.createRange(); r.selectNodeContents(el); r.collapse(false); const s = st.doc.getSelection(); s.removeAllRanges(); s.addRange(r);
    if (k === 'rich' || k === 'inline') showRT(el); else hideRT();
  }
  /* the real letters typed (not the uppercase look some headings have) */
  function plain(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    c.querySelectorAll('div,p').forEach((d) => { d.prepend('\n'); });
    return c.textContent.replace(/ /g, ' ');
  }
  function finishEdit() {
    const el = st.editing; if (!el) return;
    st.editing = null; hideRT(); hidePalette();
    const k = kindOf(el); const t = ctxOf(el);
    let v;
    if (k === 'text') v = esc(plain(el).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim());
    else if (k === 'lines') v = esc(plain(el).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim());
    else v = clean(el.innerHTML, k === 'inline');
    el.contentEditable = 'false'; el.removeAttribute('contenteditable'); el.classList.remove('ee-editing');
    if (v !== (el.__before ?? '')) { setAt(t.obj, t.path, v); markDirty(t.file); if (t.file === DATA.practice) refreshAll(); }
    else dropIfUnchanged();
    render(el, getAt(t.obj, t.path));
  }

  /* text toolbar */
  [['[data-cmd=link]', 'link'], ['[data-cmd=unlink]', 'unlink']].forEach(([s, n]) => setIcon($('#rt ' + s), n));
  function showRT(el) {
    const bar = $('#rt'); bar.hidden = false;
    const fr = $('#frame').getBoundingClientRect(); const r = rectOf(el);
    bar.style.top = Math.max(fr.top + 6, fr.top + r.top - 44) + 'px';
    bar.style.left = Math.min(window.innerWidth - 240, Math.max(8, fr.left + r.left)) + 'px';
  }
  function hideRT() { $('#rt').hidden = true; }
  $('#rt').addEventListener('mousedown', (e) => e.preventDefault());
  $('#rt').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !st.editing) return;
    const cmd = b.dataset.cmd;
    if (cmd === 'link') {
      const sel = st.doc.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const url = await ask('Add a link', 'Paste a web address, or one of your pages like fees-faq.html', 'https://');
      if (!url) return;
      st.editing.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
      st.doc.execCommand('createLink', false, url);
    } else if (cmd === 'colour') {
      const sel = st.doc.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (!range || range.collapsed) return toast('First select the words you want to colour.');
      showPalette(b, (col) => {
        st.editing.focus(); sel.removeAllRanges(); sel.addRange(range);
        if (col) st.doc.execCommand('foreColor', false, col);
        else clearColour(range);
      });
    } else st.doc.execCommand(cmd, false, null);
  });
  function clearColour(range) {
    const root = st.editing;
    $$('span[style]', root).forEach((s) => { if (range.intersectsNode(s)) s.replaceWith(...s.childNodes); });
    $$('font[color]', root).forEach((s) => { if (range.intersectsNode(s)) s.replaceWith(...s.childNodes); });
  }

  /* colour palette popover */
  function brandValues() { const c = (st.files[DATA.site] && st.files[DATA.site].data.colours) || {}; const out = {}; for (const k in BRAND_DEFAULTS) out[k] = validColour(c[k]) ? c[k] : BRAND_DEFAULTS[k]; return out; }
  function swatches() { const b = brandValues(); return [[b.plum, 'Plum'], [b.plum_deep, 'Deep plum'], [b.charcoal, 'Charcoal'], [b.stone, 'Stone'], [b.terracotta, 'Terracotta'], [b.terracotta_text, 'Deep terracotta'], [b.dust, 'Dusty pink'], ['#FFFFFF', 'White']]; }
  function showPalette(anchor, pick) {
    const p = $('#palette'); p.innerHTML = '';
    swatches().forEach(([c, n]) => { const s = document.createElement('button'); s.type = 'button'; s.className = 'sw'; s.style.background = c; s.title = n; s.onclick = () => { hidePalette(); pick(c); }; p.append(s); });
    const custom = document.createElement('label'); custom.className = 'sw custom'; custom.title = 'Any colour'; const ci = document.createElement('input'); ci.type = 'color'; ci.onchange = () => { hidePalette(); pick(ci.value.toUpperCase()); }; custom.append(ci, document.createTextNode('+')); p.append(custom);
    const none = document.createElement('button'); none.type = 'button'; none.className = 'none'; none.textContent = 'Default'; none.onclick = () => { hidePalette(); pick(''); }; p.append(none);
    const r = anchor.getBoundingClientRect(); p.style.top = Math.min(window.innerHeight - 120, r.bottom + 6) + 'px'; p.style.left = Math.min(window.innerWidth - 300, r.left) + 'px'; p.hidden = false;
  }
  function hidePalette() { $('#palette').hidden = true; }
  $('#palette').addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

  /* ---------- colours on the page ---------- */
  function colourCSS() {
    let css = '';
    const c = (st.files[DATA.site] && st.files[DATA.site].data.colours) || {};
    const vars = []; for (const k in BRAND_VARS) if (validColour(c[k])) BRAND_VARS[k].forEach((v) => vars.push(v + ':' + c[k]));
    if (vars.length) css += ':root{' + vars.join(';') + '}';
    (st.page && st.page.data.sections || []).forEach((s, i) => {
      const cs = s && s.colours; if (!cs) return;
      const q = `main>[data-s="${i}"]`; let r = '';
      if (validColour(cs.background)) r += `background-color:${cs.background}!important;`;
      if (validColour(cs.accent)) r += `--terra:${cs.accent};--terra-deep:${cs.accent};`;
      if (validColour(cs.text)) r += `color:${cs.text};`;
      if (r) css += `${q}{${r}}`;
      if (validColour(cs.text)) css += `${q} ${TEXT_SEL}{color:${cs.text}!important}`;
    });
    return css;
  }
  function applyColours() {
    if (!st.doc) return;
    $$('#brand-colours,#sec-colours', st.doc).forEach((x) => x.remove());
    let s = $('#ee-colours', st.doc); if (!s) { s = st.doc.createElement('style'); s.id = 'ee-colours'; st.doc.head.append(s); }
    s.textContent = colourCSS();
  }

  /* ---------- photos ---------- */
  async function chooseImage() {
    return new Promise((res) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return res(null);
        try {
          const bmp = await createImageBitmap(file);
          const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', 0.86);
          const name = slug(file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36) + '.jpg';
          const path = 'assets/img/uploads/' + name;
          res({ path, b64: url.split(',')[1], src: '/' + path, preview: url, width: c.width, height: c.height });
        } catch (e) { toast('That photo could not be opened. Try a JPG or PNG.'); res(null); }
      };
      inp.click();
    });
  }
  function useUpload(pic) { st.uploads[pic.path] = pic.b64; updateBar(); }
  async function editImage(img) {
    finishEdit();
    const t = ctxOf(img, img.dataset.ei);
    const pic = await chooseImage(); if (!pic) return;
    checkpoint(); useUpload(pic);
    setAt(t.obj, t.path, pic.src); img.src = pic.preview; img.removeAttribute('srcset');
    if (t.obj[t.path + '_width']) { t.obj[t.path + '_width'] = String(pic.width); t.obj[t.path + '_height'] = String(pic.height); }
    markDirty(t.file);
    const altKey = t.path + '_alt';
    const alt = await ask('Describe the photo', 'A few words about what is in it. This helps people using screen readers, and Google.', unesc(getAt(t.obj, altKey) || ''));
    if (alt != null) { setAt(t.obj, altKey, esc(alt)); img.alt = alt; }
    if (st.sel) showET(st.sel);
  }
  async function editBackground(node) {
    finishEdit();
    const el = $('[data-ebg]', node); if (!el) return;
    const sec = node.__sec; const path = el.dataset.ebg;
    const pic = await chooseImage(); if (!pic) return;
    checkpoint(); useUpload(pic);
    let labelKey;
    if (path === 'image') { sec.image = pic.src; labelKey = 'image_label'; }
    else {
      const bg = sec.background = sec.background || {};
      if (bg.kind === 'portrait') bg.image = pic.src;
      else { bg.upload = pic.src; delete bg.preset; if (!bg.kind || bg.kind === 'none') bg.kind = 'photo'; }
      labelKey = 'background.label';
    }
    if (el.tagName === 'CANVAS') { el.style.background = `url('${pic.preview}') center/cover`; const g = el.getContext && el.getContext('2d'); if (g) g.clearRect(0, 0, el.width, el.height); }
    else { el.className = el.className.replace(/\bimg-(path|light|wattle|tess)\b/g, ''); el.style.backgroundImage = `url('${pic.preview}')`; }
    markDirty(st.page.path);
    const alt = await ask('Describe the photo', 'A few words about what is in it. This helps people using screen readers, and Google.', unesc(getAt(sec, labelKey) || ''));
    if (alt != null) setAt(sec, labelKey, esc(alt));
    toast('Background photo changed. Press Save to publish it.');
  }

  /* ---------- selecting things and the item toolbar ---------- */
  const GROUP_NAMES = { card: 'the whole course card', 'card.items': 'the whole list', 'card.buttons': 'the price and buttons', items: 'the whole numbered list', rows: 'the whole price list', questions: 'all the questions', tabs: 'all the tabs', buttons: 'all these buttons', links: 'all these links', corner_links: 'all these links', trio: 'all three words', menu: 'the whole menu', explore_links: 'all these links', pills: 'all these tags', prices: 'all the prices' };
  const ITEM_NAMES = { items: 'step', rows: 'row', questions: 'question', tabs: 'tab', buttons: 'button', links: 'link', corner_links: 'link', trio: 'word', menu: 'menu link', explore_links: 'link', pills: 'tag', prices: 'price', 'card.items': 'list item', legal_links: 'link', 'card.buttons': 'button' };
  function arrName(path) { const segs = path.split('.').filter((x) => !isIdx(x)); const two = segs.slice(-2).join('.'); return ITEM_NAMES[two] ? two : segs[segs.length - 1]; }
  function itemPathOf(path) { const ks = path.split('.'); for (let i = ks.length - 1; i >= 0; i--) if (isIdx(ks[i])) return ks.slice(0, i + 1).join('.'); return null; }
  function describe(el) {
    const kind = el.dataset.eg != null && !keyOf(el) ? 'group' : el.dataset.ei != null ? 'image' : 'field';
    const raw = kind === 'group' ? el.dataset.eg : kind === 'image' ? el.dataset.ei : keyOf(el);
    const t = ctxOf(el, raw);
    const item = itemPathOf(t.path);
    const isItem = item === t.path || (el.dataset.eb != null) || (item && t.path === item + '.label' && !$$('[data-eg="' + t.prefix + item + '"]', t.scope).length);
    return { el, kind, ...t, item, isItem: !!(isItem && item) };
  }
  function linkPathFor(d) {
    if (d.el.dataset.eb != null) return d.el.dataset.eb + '.link';
    const base = d.isItem ? d.item : null;
    if (base && getAt(d.obj, base) && typeof getAt(d.obj, base) === 'object' && 'link' in getAt(d.obj, base)) return base + '.link';
    if (/label$/.test(d.path)) { const lp = d.path.replace(/label$/, 'link'); if (getAt(d.obj, lp) != null) return lp; }
    return null;
  }
  function groupsAbove(el, d) {
    const out = []; let n = el.parentElement;
    while (n && n !== d.scope.parentElement) {
      if (n.dataset && n.dataset.eg != null && !out.some((o) => o.dataset.eg === n.dataset.eg)) out.push(n);
      if (n === d.scope) break;
      n = n.parentElement;
    }
    return out;
  }
  function nameOfPath(path) {
    const p = path.replace(/^@\w+:/, '');
    if (isIdx(p.split('.').pop())) return 'this ' + (ITEM_NAMES[arrName(p)] || 'item');
    const two = p.split('.').filter((x) => !isIdx(x)).slice(-2).join('.');
    return GROUP_NAMES[two] || GROUP_NAMES[p.split('.').pop()] || 'the whole group';
  }
  function rectOf(el) {
    let r = el.getBoundingClientRect();
    if (!r.width && !r.height) { const rg = st.doc.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); }
    return r;
  }
  function select(el) { clearSel(); st.sel = el; el.classList.add('ee-sel'); showET(el); }
  function clearSel() { if (st.sel) st.sel.classList.remove('ee-sel'); st.sel = null; $('#et').hidden = true; }
  function etButton(ic, label, fn, cls = '', title = '') { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = (ic ? icon(ic) : '') + (label ? '<span>' + label + '</span>' : ''); if (title || !label) b.title = title || label; if (cls) b.className = cls; b.onmousedown = (e) => e.preventDefault(); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }
  function showET(el) {
    const bar = $('#et'); bar.innerHTML = '';
    let d; try { d = describe(el); } catch (e) { bar.hidden = true; return; }
    const add = (...b) => bar.append(...b);
    if (d.kind === 'image') add(etButton('image', 'Change photo', () => editImage(el)));
    const lp = d.kind !== 'group' ? linkPathFor(d) : null;
    if (lp) add(etButton('link', d.el.dataset.eb != null ? 'Button' : 'Link', () => editLink(d, lp), '', d.el.dataset.eb != null ? 'Button text, link and style' : 'Change where this goes'));
    const target = d.isItem ? d.item : d.path;
    if (d.isItem) add(etButton('up', '', () => moveItem(d, -1), '', 'Move up'), etButton('down', '', () => moveItem(d, 1), '', 'Move down'), etButton('copy', '', () => copyItem(d), '', 'Duplicate'));
    add(etButton('trash', d.kind === 'group' ? 'Delete ' + nameOfPath(d.prefix + target).replace(/^this /, '') : '', () => removeThing(d, target), 'danger', 'Delete'));
    const groups = groupsAbove(el, d).filter((g) => g.dataset.eg !== d.prefix + target && g.dataset.eg !== target);
    if (groups.length) { const sep = document.createElement('span'); sep.className = 'sep'; add(sep); }
    groups.slice(0, 2).forEach((g) => add(etButton('select', 'Select ' + nameOfPath(g.dataset.eg), () => { finishEdit(); select(g); })));
    bar.hidden = false; positionET(el);
  }
  function positionET(el) {
    const bar = $('#et'); const fr = $('#frame').getBoundingClientRect(); const r = rectOf(el);
    const below = fr.top + r.bottom + 8; const above = fr.top + r.top - 44;
    const rtOpen = !$('#rt').hidden;
    let top = rtOpen ? below : above < fr.top + 4 ? below : above;
    top = Math.min(top, fr.bottom - 44);
    bar.style.top = Math.max(fr.top + 4, top) + 'px';
    bar.style.left = Math.min(window.innerWidth - bar.offsetWidth - 8, Math.max(8, fr.left + r.left)) + 'px';
  }
  async function editLink(d, lp) {
    finishEdit();
    if (d.el.dataset.eb != null) return editButton(d.el);
    const cur = getAt(d.obj, lp) || '';
    const url = await ask('Where should this go?', 'One of your pages (e.g. fees-faq.html or book.html#book-now), a part of a page (#faq), or a full web address.', unesc(cur));
    if (url == null || url === cur) return;
    checkpoint(); setAt(d.obj, lp, esc(url)); markDirty(d.file);
    const a = d.el.closest('a') || d.el; if (a.tagName === 'A') a.setAttribute('href', url);
    toast('Link changed.');
  }
  function editButton(a) {
    finishEdit();
    const t = ctxOf(a, a.dataset.eb); const b = getAt(t.obj, t.path) || {};
    openPanel('Button', [{ name: 'Content', build: (body) => {
      body.append(field({ name: 'label', label: 'Button text', type: 'string' }, b, () => { a.innerHTML = fill(b.label || ''); markDirty(t.file); }));
      body.append(field({ name: 'link', label: 'Where it goes', type: 'string', description: 'One of your pages (e.g. people-pleasing.html or book.html#book-now), a part of a page (#faq), or a full web address.' }, b, () => { a.setAttribute('href', unesc(fill(b.link || ''))); markDirty(t.file); }));
      body.append(field({ name: 'new_tab', label: 'Open in a new tab', type: 'boolean' }, b, () => markDirty(t.file)));
    } }, { name: 'Design', build: (body) => {
      body.append(field({ name: 'ghost', label: 'Outline style (no fill)', type: 'boolean' }, b, () => { a.classList.toggle('ghost', !!b.ghost); markDirty(t.file); }));
    } }]);
  }

  /* structure changes on lists and groups */
  const ATTRS = ['data-e', 'data-eb', 'data-eg', 'data-ei'];
  function rewrite(scope, full, fn) {
    [scope, ...$$('*', scope)].forEach((n) => ATTRS.forEach((a) => {
      const k = n.getAttribute && n.getAttribute(a); if (k == null) return;
      if (!(k === full || k.startsWith(full + '.'))) return;
      const rest = k.slice(full.length + 1); const m = rest.match(/^(\d+)(.*)$/); if (!m) return;
      const ni = fn(+m[1]); if (ni == null) return;
      n.setAttribute(a, full + '.' + ni + m[2]);
    }));
  }
  function nodesFor(scope, full) {
    const marked = $$('[data-eg="' + full + '"]', scope);
    if (marked.length) return marked;
    const hits = $$('*', scope).filter((n) => ATTRS.some((a) => { const k = n.getAttribute(a); if (k == null) return false; return k === full || k === full + '.label' || (a !== 'data-eg' && k.startsWith(full + '.')); }));
    return hits.filter((n) => !hits.some((o) => o !== n && o.contains(n)));
  }
  function renumber(scope) { $$('ol.sequence', scope).forEach((ol) => $$(':scope > li .num', ol).forEach((s, i) => (s.textContent = (i < 9 ? '0' : '') + (i + 1)))); }
  function afterStructure(d) { markDirty(d.file); if (d.sec) renumber(d.sec); applyColours(); drawOverlay(); }
  function splitItem(d) { const ks = d.item.split('.'); return { arrPath: ks.slice(0, -1).join('.'), idx: +ks[ks.length - 1] }; }
  function moveItem(d, dir) {
    finishEdit();
    const { arrPath, idx } = splitItem(d); const arr = getAt(d.obj, arrPath); const j = idx + dir;
    if (!Array.isArray(arr) || j < 0 || j >= arr.length) return;
    checkpoint();
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const full = d.prefix + arrPath;
    const A = nodesFor(d.scope, full + '.' + idx), B = nodesFor(d.scope, full + '.' + j);
    A.forEach((a, k) => { const b = B[k]; if (!b) return; const ph = st.doc.createComment(''); a.replaceWith(ph); b.replaceWith(a); ph.replaceWith(b); });
    rewrite(d.scope, full, (i) => (i === idx ? j : i === j ? idx : null));
    afterStructure(d); select(d.el);
  }
  function copyItem(d) {
    finishEdit();
    const { arrPath, idx } = splitItem(d); const arr = getAt(d.obj, arrPath); if (!Array.isArray(arr)) return;
    checkpoint();
    arr.splice(idx + 1, 0, structuredClone(arr[idx]));
    const full = d.prefix + arrPath;
    const orig = nodesFor(d.scope, full + '.' + idx);
    rewrite(d.scope, full, (i) => (i > idx ? i + 1 : null));
    orig.slice().reverse().forEach((o) => { const c = o.cloneNode(true); c.classList.remove('ee-sel'); rewrite(c, full, (i) => (i === idx ? idx + 1 : null)); o.after(c); });
    afterStructure(d); toast('Duplicated. Click the copy to change it.');
  }
  async function removeThing(d, target) {
    finishEdit();
    const big = d.kind === 'group' && !isIdx(target.split('.').pop());
    if (big && !(await confirmBox('Delete ' + nameOfPath(d.prefix + target) + '?', 'Everything inside it comes off the page when you save. Undo brings it back.'))) return;
    checkpoint();
    const full = d.prefix + target;
    const ks = target.split('.');
    if (isIdx(ks[ks.length - 1])) {
      const arrPath = ks.slice(0, -1).join('.'); const idx = +ks[ks.length - 1]; const arr = getAt(d.obj, arrPath);
      if (Array.isArray(arr)) arr.splice(idx, 1);
      nodesFor(d.scope, full).forEach((n) => n.remove());
      rewrite(d.scope, d.prefix + arrPath, (i) => (i > idx ? i - 1 : null));
      if (Array.isArray(arr) && !arr.length) delAt(d.obj, arrPath);
    } else {
      delAt(d.obj, target);
      if (d.kind === 'image') { delAt(d.obj, target + '_alt'); delAt(d.obj, target + '_width'); delAt(d.obj, target + '_height'); }
      const nodes = d.kind === 'group' ? [d.el] : nodesFor(d.scope, full);
      nodes.forEach((n) => { const fig = n.tagName === 'IMG' && n.parentElement.tagName === 'FIGURE' ? n.parentElement : n; fig.remove(); });
    }
    clearSel(); afterStructure(d); toast('Deleted. Undo brings it back.');
  }

  /* ---------- sections and the editing overlay ---------- */
  const TOOLS_CSS = `
    body.ee-edit [data-e],body.ee-edit [data-eb]{cursor:text}
    body.ee-edit [data-e]:hover,body.ee-edit [data-eb]:hover,body.ee-edit .ed[data-e]:hover>*{outline:1px dashed rgba(26,26,26,.7);outline-offset:3px;box-shadow:0 0 0 3px rgba(255,255,255,.35)}
    .ee-editing,.ed.ee-editing>*{outline:2px solid #1A1A1A!important;outline-offset:3px;box-shadow:0 0 0 5px rgba(255,255,255,.85)!important}
    .ee-sel,.ed.ee-sel>*{outline:2px solid #1A1A1A!important;outline-offset:4px;box-shadow:0 0 0 6px rgba(255,255,255,.85)}
    body.ee-edit [data-ei]{cursor:pointer}
    body.ee-edit [data-ei]:hover{outline:2px solid #1A1A1A;outline-offset:3px;box-shadow:0 0 0 5px rgba(255,255,255,.85)}
    main>[data-s]{position:relative}
    body.ee-edit main>[data-s]:has([data-ebg]){cursor:copy}
    body.ee-edit main>[data-s]:has([data-ebg]) :is([data-e],[data-eb]){cursor:text}
    .ee-flag{position:absolute;left:12px;top:12px;z-index:60;background:#fff;color:#1A1A1A;font:500 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 11px;border-radius:8px;max-width:300px;box-shadow:0 6px 20px rgba(0,0,0,.18)}
    .bookbar{display:none!important}`;
  function blockLabel(type) { return (st.schema.blocks[type] || {}).label || type; }
  function sectionNodes() { return st.doc ? $$('main > [data-s]', st.doc) : []; }
  function syncSections() {
    const nodes = sectionNodes();
    nodes.forEach((n, i) => (n.dataset.s = i));
    st.page.data.sections = nodes.map((n) => n.__sec);
    applyColours();
  }
  function stageOffset() { const fr = $('#frame').getBoundingClientRect(); const sr = $('#stage').getBoundingClientRect(); return { x: fr.left - sr.left, y: fr.top - sr.top, w: fr.width, h: fr.height }; }
  function drawOverlay() {
    const ov = $('#ov'); const box = $('#ov-box'), tools = $('#ov-tools'), at = $('#ov-add-top'), ab = $('#ov-add-bot');
    if (st.mode !== 'edit' || !st.hover || !st.hover.isConnected || $('#frame').hidden) { [box, tools, at, ab].forEach((x) => (x.style.display = 'none')); return; }
    ov.hidden = false;
    const o = stageOffset(); const r = st.hover.getBoundingClientRect();
    const top = Math.max(r.top, 0), bot = Math.min(r.bottom, o.h);
    if (bot <= top) { [box, tools, at, ab].forEach((x) => (x.style.display = 'none')); return; }
    Object.assign(box.style, { display: 'block', left: o.x + r.left + 'px', top: o.y + top + 'px', width: r.width + 'px', height: bot - top + 'px' });
    if (tools.__for !== st.hover) buildTools(st.hover);
    tools.style.display = 'flex';
    tools.style.top = o.y + Math.max(top, Math.min(Math.max(r.top, 22), o.h - 70) - 22) + (phone() ? 40 : 12) + 'px';
    tools.style.left = Math.max(o.x + 8, o.x + Math.min(r.right, o.w) - tools.offsetWidth - 12) + 'px';
    const cx = o.x + r.left + r.width / 2 + 'px';
    // keep both buttons on screen, even when the section is taller than the window
    const ty = Math.min(Math.max(r.top, 22), o.h - 70), by = Math.max(Math.min(r.bottom, o.h - 22), ty + 48);
    Object.assign(at.style, { display: 'block', left: cx, top: o.y + ty + 'px' });
    Object.assign(ab.style, { display: 'block', left: cx, top: o.y + by + 'px' });
    at.title = 'Add a section above this one'; ab.title = 'Add a section below this one';
  }
  function buildTools(node) {
    const t = $('#ov-tools'); t.innerHTML = ''; t.__for = node;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = blockLabel(node.__sec.type); t.append(lbl);
    const b = (ic, text, act, title, cls) => { const x = document.createElement('button'); x.type = 'button'; x.innerHTML = icon(ic) + (text ? '<span>' + text + '</span>' : ''); x.title = title; if (cls) x.className = cls; x.onclick = (e) => { e.stopPropagation(); sectionAction(node, act); }; t.append(x); };
    b('pencil', 'Edit section', 'settings', 'Edit this section: content, design and background');
    const sep = document.createElement('span'); sep.className = 'sep'; t.append(sep);
    b('up', '', 'up', 'Move section up'); b('down', '', 'down', 'Move section down');
    if ($('[data-ebg]', node)) b('image', '', 'bg', 'Change background photo');
    b('copy', '', 'copy', 'Duplicate section'); b('trash', '', 'delete', 'Delete section', 'danger');
  }
  $('#ov-add-top').onclick = () => st.hover && openLibrary(st.hover, 'before');
  $('#ov-add-bot').onclick = () => st.hover && openLibrary(st.hover, 'after');
  $('#stage').addEventListener('mouseleave', (e) => {
    // moving into the page frame also counts as "leaving", so only clear when the pointer is really outside
    const r = $('#stage').getBoundingClientRect();
    const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
    if (!inside && $('#lib').hidden && !phone()) { st.hover = null; drawOverlay(); }
  });
  async function sectionAction(node, act) {
    finishEdit(); clearSel();
    const nodes = sectionNodes(); const i = nodes.indexOf(node);
    if (act === 'settings') return sectionSettings(node);
    if (act === 'bg') return editBackground(node);
    if (act === 'delete' && !(await confirmBox('Delete this section?', 'It comes off the page when you save. Undo brings it back.'))) return;
    if ((act === 'up' && i === 0) || (act === 'down' && i === nodes.length - 1)) return;
    checkpoint();
    if (act === 'up') nodes[i - 1].before(node);
    else if (act === 'down') nodes[i + 1].after(node);
    else if (act === 'copy') { const c = node.cloneNode(true); c.__sec = structuredClone(node.__sec); node.after(c); flag(c, 'Duplicated. Edit it like any other section.'); }
    else if (act === 'delete') { node.remove(); st.hover = null; }
    syncSections(); markDirty(st.page.path);
    if (act !== 'delete') node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $('#ov-tools').__for = null; setTimeout(drawOverlay, 350); drawOverlay();
  }
  function flag(node, text) { let f = $(':scope > .ee-flag', node); if (!f) { f = st.doc.createElement('div'); f.className = 'ee-flag'; node.append(f); } f.textContent = text; clearTimeout(f.__t); f.__t = setTimeout(() => f.remove(), 6000); }

  /* add section drawer */
  async function libraryDoc() {
    if (st.libDoc) return st.libDoc;
    const html = await (await fetch('/section-library.html?ee=' + Date.now(), { cache: 'no-store' })).text();
    st.libDoc = new DOMParser().parseFromString(html, 'text/html'); return st.libDoc;
  }
  async function openLibrary(anchor, pos) {
    finishEdit(); clearSel(); closePanel();
    const lib = await readFile('pages/section-library.md', 'page');
    const items = lib.data.sections.map((s, i) => ({ i, s, label: s.library_label || blockLabel(s.type), group: s.library_group || 'Text' }));
    const cats = $('#lib-cats'); const grid = $('#lib-grid');
    const draw = (g) => {
      $$('button', cats).forEach((b) => b.classList.toggle('on', b.dataset.g === g));
      grid.innerHTML = '<p class="lib-where">' + (pos === 'before' ? 'Adds above' : 'Adds below') + ' the section you were on. You can move it after.</p>';
      items.filter((x) => g === 'All' || x.group === g).forEach((x) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'lib-item';
        b.innerHTML = `<img src="/assets/editor/thumbs/s${x.i}.jpg" alt="" loading="lazy"><span></span>`; $('span', b).textContent = x.label;
        b.onclick = () => insertSection(x.i, anchor, pos);
        grid.append(b);
      });
    };
    cats.innerHTML = '';
    LIB_GROUPS.filter((g) => g === 'All' || items.some((x) => x.group === g)).forEach((g) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.g = g; b.textContent = g; b.onclick = () => draw(g); cats.append(b); });
    draw('All');
    $('#lib').hidden = false;
    libraryDoc().catch(() => {});
  }
  function hideLib() { $('#lib').hidden = true; }
  $('#lib-close').onclick = hideLib;
  async function insertSection(i, anchor, pos) {
    const [lib, ldoc] = await Promise.all([readFile('pages/section-library.md', 'page'), libraryDoc()]);
    const src = $$('main > [data-s]', ldoc)[i]; if (!src) return toast('That design could not be loaded. Try again.');
    checkpoint();
    const sec = structuredClone(lib.data.sections[i]); delete sec.library_label; delete sec.library_group;
    const node = st.doc.importNode(src, true);
    $$('canvas.bg[data-src]', node).forEach((c) => (c.style.background = `url('${c.dataset.src}') center/cover`));
    node.__sec = sec;
    if (anchor && anchor.isConnected) (pos === 'before' ? anchor.before(node) : anchor.after(node)); else $('main', st.doc).append(node);
    syncSections(); markDirty(st.page.path); hideLib();
    flag(node, 'New section added. Click any words or photos to make them yours.');
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    st.hover = node; $('#ov-tools').__for = null; setTimeout(drawOverlay, 400);
  }

  /* ---------- settings forms ---------- */
  function note(t) { const p = document.createElement('p'); p.className = 'note'; p.textContent = t; return p; }
  function button(t, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.onclick = fn; return b; }
  function field(def, obj, changed) {
    const w = document.createElement('div'); w.className = 'f';
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = def.label || def.name;
    const hint = def.description ? Object.assign(document.createElement('p'), { className: 'hint', textContent: def.description }) : null;
    const v = obj[def.name];
    const set = (nv) => { if (nv === undefined) delete obj[def.name]; else obj[def.name] = nv; changed && changed(nv); };
    let input;
    if (def.list && def.type !== 'object') return listField(def, obj, changed);
    switch (def.type) {
      case 'boolean': { const l = document.createElement('label'); l.className = 'chk'; input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = !!v; input.onchange = () => set(input.checked); l.append(input, document.createTextNode(def.label)); w.append(l); if (hint) w.append(hint); return w; }
      case 'select': { input = document.createElement('select'); input.add(new Option('—', '')); ((def.options || {}).values || []).forEach((o) => input.add(new Option(o.label, o.name))); input.value = v || ''; input.onchange = () => set(input.value || undefined); break; }
      case 'number': { input = document.createElement('input'); input.type = 'number'; input.min = 0; input.value = v ?? ''; input.oninput = () => set(input.value === '' ? undefined : Number(input.value)); break; }
      case 'date': { input = document.createElement('input'); input.type = 'date'; input.value = v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : ''; input.oninput = () => set(input.value); break; }
      case 'text': { input = document.createElement('textarea'); input.value = unesc(v ?? ''); input.oninput = () => set(input.value === '' ? undefined : esc(input.value)); break; }
      case 'rich-text': { input = document.createElement('div'); input.className = 'rich'; input.contentEditable = 'true'; input.innerHTML = v || ''; input.oninput = () => set(clean(input.innerHTML, false) || undefined); input.onkeydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); } }; break; }
      case 'image': { const t = document.createElement('div'); t.className = 'thumb'; const im = document.createElement('img'); im.alt = ''; if (v) im.src = v; const b = button(v ? 'Change photo' : 'Choose photo', 'btn small', async () => { const pic = await chooseImage(); if (!pic) return; useUpload(pic); im.src = pic.preview; set(pic.src); b.textContent = 'Change photo'; }); t.append(im, b); w.append(lab, t); if (hint) w.append(hint); return w; }
      case 'color': return colourField(def, obj, changed, w, lab, hint);
      case 'object': return def.list ? objectList(def, obj, changed) : objectGroup(def, obj, changed);
      default: { input = document.createElement('input'); input.type = 'text'; input.value = unesc(v ?? ''); input.oninput = () => set(input.value === '' ? undefined : esc(input.value)); }
    }
    input.id = id; w.append(lab, input); if (hint) w.append(hint); return w;
  }
  function colourField(def, obj, changed, w, lab, hint) {
    const row = document.createElement('div'); row.className = 'colour-row';
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip'; chip.setAttribute('aria-label', 'Choose a colour for ' + (def.label || def.name));
    const txt = document.createElement('span'); txt.className = 'ctext';
    const draw = () => { const c = obj[def.name]; chip.style.background = validColour(c) ? c : def.default || 'transparent'; chip.classList.toggle('empty', !validColour(c) && !def.default); txt.textContent = validColour(c) ? c : def.default ? 'Original (' + def.default + ')' : 'Not set'; };
    chip.onclick = () => showPalette(chip, (c) => { if (c) obj[def.name] = c; else delete obj[def.name]; draw(); changed && changed(); });
    row.append(chip, txt); draw();
    w.append(lab, row); if (hint) w.append(hint); return w;
  }
  function visible(fields) { return (fields || []).filter((f) => !f.hidden); }
  function objectGroup(def, obj, changed) {
    const d = document.createElement('details'); d.className = 'group'; if (def.name === 'colours' || def.name === 'background') d.open = true;
    const s = document.createElement('summary'); s.textContent = def.label; d.append(s);
    if (def.description) d.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: def.description }));
    const sub = obj[def.name] && typeof obj[def.name] === 'object' ? obj[def.name] : {};
    visible(def.fields).forEach((f) => d.append(field(f, sub, () => { if (Object.keys(sub).length) obj[def.name] = sub; else delete obj[def.name]; changed && changed(); })));
    return d;
  }
  function objectList(def, obj, changed) {
    const d = document.createElement('details'); d.className = 'group'; d.open = true;
    const s = document.createElement('summary'); s.textContent = def.label; d.append(s);
    const box = document.createElement('div'); box.style.display = 'grid'; box.style.gap = '8px'; d.append(box);
    const arr = () => (Array.isArray(obj[def.name]) ? obj[def.name] : (obj[def.name] = []));
    const draw = () => {
      box.innerHTML = '';
      arr().forEach((it, i) => {
        const card = document.createElement('div'); card.className = 'item';
        const head = document.createElement('div'); head.className = 'item-head';
        const firstStr = visible(def.fields).find((f) => f.type === 'string');
        head.textContent = (firstStr && it[firstStr.name] ? unesc(String(it[firstStr.name])).replace(/<[^>]+>/g, '').slice(0, 40) : 'Item ' + (i + 1));
        const acts = document.createElement('span'); acts.className = 'acts';
        acts.append(button('↑', 'mini', () => { if (i) { arr().splice(i - 1, 0, arr().splice(i, 1)[0]); changed && changed(); draw(); } }),
          button('↓', 'mini', () => { if (i < arr().length - 1) { arr().splice(i + 1, 0, arr().splice(i, 1)[0]); changed && changed(); draw(); } }),
          button('Remove', 'mini', () => { arr().splice(i, 1); changed && changed(); draw(); }));
        head.append(acts); card.append(head);
        visible(def.fields).forEach((f) => card.append(field(f, it, changed)));
        box.append(card);
      });
      box.append(button('+ Add ' + (def.label || 'item').toLowerCase().replace(/s$/, ''), 'btn small', () => { arr().push({}); changed && changed(); draw(); }));
    };
    draw(); return d;
  }
  function listField(def, obj, changed) {
    const w = document.createElement('div'); w.className = 'f';
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = def.label; w.append(lab);
    const box = document.createElement('div'); box.style.display = 'grid'; box.style.gap = '6px'; w.append(box);
    const arr = () => (Array.isArray(obj[def.name]) ? obj[def.name] : (obj[def.name] = []));
    const draw = () => {
      box.innerHTML = '';
      arr().forEach((v, i) => {
        const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '6px';
        const inp = document.createElement(String(v).includes('\n') ? 'textarea' : 'input'); if (inp.tagName === 'INPUT') inp.type = 'text';
        inp.value = unesc(v); inp.style.flex = '1'; inp.style.font = 'inherit'; inp.style.padding = '8px 10px'; inp.style.border = '1px solid var(--line-2)'; inp.style.borderRadius = '8px';
        inp.oninput = () => { arr()[i] = esc(inp.value); changed && changed(); };
        row.append(inp, button('Remove', 'mini', () => { arr().splice(i, 1); changed && changed(); draw(); }));
        box.append(row);
      });
      box.append(button('+ Add', 'btn small', () => { arr().push(''); changed && changed(); draw(); }));
    };
    draw(); return w;
  }
  const DESIGN_FIELDS = ['tone', 'centred', 'stacked', 'label_above', 'photo_right', 'colours', 'numbered'];
  const BG_FIELDS = ['background', 'image', 'image_label', 'tint'];
  function sectionSettings(node) {
    const sec = node.__sec; const def = st.schema.blocks[sec.type];
    const fields = visible(def ? def.fields : []);
    const on = () => { markDirty(st.page.path); applyColours(); refreshSection(node); };
    const tab = (name, list, intro) => list.length && { name, build: (b) => { if (intro) b.append(note(intro)); list.forEach((f) => b.append(field(f, sec, on))); } };
    const content = fields.filter((f) => !DESIGN_FIELDS.includes(f.name) && !BG_FIELDS.includes(f.name));
    const design = fields.filter((f) => DESIGN_FIELDS.includes(f.name));
    const bg = fields.filter((f) => BG_FIELDS.includes(f.name));
    const tabs = [tab('Content', content, 'Tip: you can also click words and photos right on the page.'), tab('Design', design, 'Colours show straight away. Layout changes show after you save.'), tab('Background', bg)].filter(Boolean);
    if (bg.length && $('[data-ebg]', node)) { const t = tabs.find((x) => x.name === 'Background'); const orig = t.build; t.build = (b) => { b.append(button('Upload a new background photo', 'btn', () => editBackground(node))); orig(b); }; }
    openPanel(blockLabel(sec.type), tabs);
  }
  function refreshSection(node) { $$('[data-e],[data-eb]', node).forEach((el) => { const k = keyOf(el); if (k.startsWith('@') || el === st.editing) return; const v = getAt(node.__sec, k); if (v != null) render(el, v); }); }

  /* panel and modals */
  function openPanel(title, tabs) {
    finishEdit(); clearSel(); hideLib(); checkpoint();
    if (typeof tabs === 'function') tabs = [{ name: '', build: tabs }];
    $('#panel-title').textContent = title;
    const bar = $('#panel-tabs'); bar.innerHTML = ''; bar.hidden = tabs.length < 2;
    const body = $('#panel-body');
    const show = (i) => { $$('button', bar).forEach((b, k) => b.classList.toggle('on', k === i)); body.innerHTML = ''; tabs[i].build(body); body.scrollTop = 0; };
    tabs.forEach((t, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name; b.onclick = () => show(i); bar.append(b); });
    show(0); $('#panel').hidden = false;
  }
  function hidePanelOnly() { $('#panel').hidden = true; hidePalette(); }
  function closePanel() { if ($('#panel').hidden) return; hidePanelOnly(); dropIfUnchanged(); refreshAll(); recomputeDirty(); }
  $('#panel-close').onclick = closePanel; $('#panel-done').onclick = closePanel;
  function openModal() { const m = $('#modal'); const c = $('.modal-card', m); $('#modal-body').remove(); const b = document.createElement('div'); b.id = 'modal-body'; b.style.display = 'contents'; c.append(b); m.hidden = false; return b; }
  function closeModal() { $('#modal').hidden = true; }
  function confirmBox(title, text, yes = 'Delete') {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="row"><button class="btn" type="button" data-n>Cancel</button><button class="btn dark" type="button" data-y></button></div>`;
      $('h2', m).textContent = title; $('p', m).textContent = text; $('[data-y]', m).textContent = yes;
      $('[data-n]', m).onclick = () => { closeModal(); res(false); }; $('[data-y]', m).onclick = () => { closeModal(); res(true); };
    });
  }
  function choose(title, text, options) {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="row"></div>`;
      $('h2', m).textContent = title; $('p', m).textContent = text;
      options.forEach(([label, val, cls]) => $('.row', m).append(button(label, 'btn ' + (cls || ''), () => { closeModal(); res(val); })));
    });
  }
  function ask(title, text, value = '') {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="f"><input type="text"></div><div class="row"><button class="btn" type="button" data-n>Cancel</button><button class="btn dark" type="button" data-y>OK</button></div>`;
      $('h2', m).textContent = title; $('p', m).textContent = text; const i = $('input', m); i.value = value; setTimeout(() => i.focus(), 30);
      const ok = () => { closeModal(); res(i.value.trim()); };
      i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      $('[data-n]', m).onclick = () => { closeModal(); res(null); }; $('[data-y]', m).onclick = ok;
    });
  }

  /* ---------- the page frame ---------- */
  function wireFrame() {
    const fr = $('#frame'); const d = fr.contentDocument; st.doc = d;
    const s = d.createElement('style'); s.textContent = TOOLS_CSS; d.head.append(s);
    const nodes = sectionNodes();
    const secs = st.page.data.sections || [];
    st.ready = nodes.length === secs.length;
    if (!st.ready) {
      $('#banner').textContent = 'Your latest changes are still being published. Give it a minute, then open this page again to edit it.';
      $('#banner').hidden = false; $('#btn-edit').disabled = true; return;
    }
    $('#banner').hidden = true; $('#btn-edit').disabled = false;
    nodes.forEach((n, i) => { n.__sec = secs[i]; });
    d.body.classList.toggle('ee-edit', st.mode === 'edit');
    refreshAll();
    d.addEventListener('touchstart', (e) => { if (st.mode !== 'edit') return; const n = e.target.closest && e.target.closest('main > [data-s]'); if (n && n !== st.hover) { st.hover = n; $('#ov-tools').__for = null; drawOverlay(); } }, { passive: true });
    d.addEventListener('mousemove', (e) => { if (st.mode !== 'edit') return; const n = e.target.closest && e.target.closest('main > [data-s]'); if (n && n !== st.hover) { st.hover = n; drawOverlay(); } });
    d.addEventListener('click', (e) => (st.mode === 'edit' ? editClick(e) : browseClick(e)), true);
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    d.addEventListener('paste', (e) => { if (!st.editing || !e.clipboardData) return; const k = kindOf(st.editing); e.preventDefault(); const txt = e.clipboardData.getData('text/plain'); d.execCommand('insertText', false, k === 'text' ? txt.replace(/\s*\n\s*/g, ' ') : txt); });
    d.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return save(); }
      if (st.mode !== 'edit') return;
      if (!st.editing) {
        if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { e.preventDefault(); const dd = describe(st.sel); return removeThing(dd, dd.isItem ? dd.item : dd.path); }
        if (e.key === 'Escape') clearSel();
        return;
      }
      if (e.key === 'Escape') { const el = st.editing; st.editing = null; el.removeAttribute('contenteditable'); el.classList.remove('ee-editing'); render(el, el.__before); hideRT(); dropIfUnchanged(); }
      if (e.key === 'Enter' && kindOf(st.editing) === 'text') { e.preventDefault(); finishEdit(); }
    });
    const follow = () => { if (st.editing && !$('#rt').hidden) showRT(st.editing); if (st.sel && !$('#et').hidden) positionET(st.sel); drawOverlay(); };
    d.addEventListener('scroll', follow, { passive: true }); fr.contentWindow.addEventListener('resize', follow);
  }
  function browseClick(e) {
    const a = e.target.closest('a'); if (!a) { if (e.target.closest('form')) e.preventDefault(); return; }
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) return;
    e.preventDefault();
    const m = href.match(/^\/?([a-z0-9-]+)\.html(#.*)?$/);
    if (m && st.pages.includes(m[1])) return openPage(m[1]);
    if (/^\/?journal\/?/.test(href)) return toast('Your Journal posts are under Journal in the left menu.');
    toast('Links to other websites work for visitors. In the editor, you stay here.');
  }
  function editClick(e) {
    const t = e.target;
    if (st.editing && st.editing.contains(t)) { if (t.closest('a')) e.preventDefault(); return; }
    const ei = t.closest('[data-ei]'); if (ei) { e.preventDefault(); e.stopPropagation(); finishEdit(); return select(ei); }
    const el = t.closest('[data-e],[data-eb]');
    if (el && (!keyOf(el).startsWith('@') || st.files[DATA[keyOf(el).slice(1).split(':')[0]]])) { e.preventDefault(); e.stopPropagation(); clearSel(); startEdit(el); st.sel = el; el.classList.add('ee-sel'); showET(el); return; }
    const wasEditing = !!st.editing; const hadSel = !!st.sel;
    finishEdit();
    const secNode = t.closest('main > [data-s]');
    const onEmpty = secNode && !t.closest('[data-e],[data-eb],[data-ei],[data-eg],a,button,input,select,textarea,iframe,.ee-flag');
    if (!wasEditing && !hadSel && onEmpty && $('[data-ebg]', secNode)) { e.preventDefault(); return editBackground(secNode); }
    const g = t.closest('[data-eg]'); if (g && !wasEditing) { e.preventDefault(); e.stopPropagation(); return select(g); }
    clearSel();
    if (t.closest('a') || t.closest('form') || t.closest('button')) e.preventDefault();
  }
  async function openPage(name, then) {
    finishEdit(); closePanel(); clearSel(); hideLib();
    const path = 'pages/' + name + '.md';
    try { st.page = await readFile(path, 'page'); } catch (e) { return toast(e.message); }
    st.page.name = name; st.undo = []; st.redo = []; st.hover = null; drawOverlay();
    $('#page-name').textContent = pageLabel(name);
    const fr = $('#frame'); $('#placeholder').hidden = true; fr.hidden = false;
    fr.onload = () => { try { wireFrame(); updateBar(); then && then(); } catch (e) { console.error(e); toast('This page could not be prepared for editing.'); } };
    fr.src = '/' + name + '.html?ee=' + Date.now();
    renderSide();
    try { localStorage.setItem('ember-editor-page', name); } catch (e) {}
  }

  /* ---------- browse / edit mode ---------- */
  function setMode(m) {
    st.mode = m;
    $('#app').classList.toggle('editing', m === 'edit');
    $('#btn-edit').hidden = m === 'edit'; $('#btn-exit').hidden = m !== 'edit';
    $('.edit-only').hidden = m !== 'edit';
    if (st.doc) st.doc.body.classList.toggle('ee-edit', m === 'edit');
    $('#ov').hidden = m !== 'edit';
    if (m !== 'edit') { finishEdit(); clearSel(); hideLib(); closePanel(); st.hover = null; }
    drawOverlay(); updateBar();
  }
  $('#btn-edit').onclick = () => { if (!st.ready) return; setMode('edit'); toast(phone() ? 'Tap anything on the page to change it. Tap a section for its tools.' : 'Click anything on the page to change it. Hover a section for its tools.'); };
  $('#btn-exit').onclick = async () => {
    finishEdit();
    if (hasChanges()) {
      const c = await choose('Save your changes?', 'You have changes that are not saved yet.', [['Keep editing', 'stay'], ['Discard changes', 'discard', 'danger'], ['Save', 'save', 'dark']]);
      if (c === 'stay' || c == null) return;
      if (c === 'save' && !(await save())) return;
      if (c === 'discard') { discard(); setMode('browse'); return openPage(st.page.name); }
    }
    setMode('browse');
  };
  function discard() {
    for (const p of [...st.dirty]) { const f = st.files[p]; if (st.orig[p] != null && f) { const nf = parseFile(f.kind, st.orig[p]); nf.path = p; st.files[p] = nf; } else delete st.files[p]; }
    st.uploads = {}; st.undo = []; st.redo = []; recomputeDirty();
  }
  function setDevice(mobile) {
    $('#frame-wrap').classList.toggle('mobile', mobile);
    $('#dev-mobile').classList.toggle('on', mobile); $('#dev-desktop').classList.toggle('on', !mobile);
    clearSel(); hideRT(); setTimeout(drawOverlay, 60);
  }
  $('#dev-desktop').onclick = () => setDevice(false); $('#dev-mobile').onclick = () => setDevice(true);
  window.addEventListener('resize', () => drawOverlay());

  /* ---------- sidebar ---------- */
  function renderSide() {
    if (!st.files[DATA.site]) return;
    const menu = st.files[DATA.site].data.menu || [];
    const main = $('#nav-main'), other = $('#nav-other'); main.innerHTML = ''; other.innerHTML = '';
    const inMenu = new Set();
    const row = (name, label, ic, box) => {
      const r = document.createElement('div'); r.className = 'row' + (st.page && st.page.name === name ? ' on' : ''); r.tabIndex = 0; r.setAttribute('role', 'button');
      r.innerHTML = `<span class="ic">${icon(ic)}</span><span class="nm"></span>`; $('.nm', r).textContent = label;
      const g = document.createElement('button'); g.type = 'button'; g.className = 'icon-btn gear'; g.title = 'Page settings'; g.setAttribute('aria-label', 'Page settings for ' + label); g.innerHTML = icon('gear');
      g.onclick = (e) => { e.stopPropagation(); $('#app').classList.add('m-page'); if (st.page && st.page.name === name) pageSettings(); else openPage(name, pageSettings); };
      r.append(g);
      r.onclick = () => { $('#app').classList.add('m-page'); openPage(name); }; r.onkeydown = (e) => { if (e.key === 'Enter') { $('#app').classList.add('m-page'); openPage(name); } };
      box.append(r);
    };
    row('index', 'Home', 'home', main); inMenu.add('index');
    menu.forEach((m) => {
      const mm = (m.link || '').match(/^\/?([a-z0-9-]+)\.html$/);
      if (mm && st.pages.includes(mm[1])) { row(mm[1], unesc(m.label), 'file', main); inMenu.add(mm[1]); }
      else if (/^\/?journal\/?$/.test(m.link || '')) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span class="ic">${icon('journal')}</span><span class="nm"></span>`; $('.nm', r).textContent = unesc(m.label); r.onclick = sideTool(journal); main.append(r); }
    });
    st.pages.filter((n) => !inMenu.has(n)).sort((a, b) => pageLabel(a).localeCompare(pageLabel(b))).forEach((n) => row(n, pageLabel(n), 'file', other));
    if (!other.children.length) other.innerHTML = '<p class="hint" style="padding:4px 8px">Every page is in your menu.</p>';
  }

  /* ---------- earlier versions ---------- */
  function when(iso) { return new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  async function versionsInto(b, path, kind) {
    b.append(note(kind === 'page' ? 'Every time you save, a copy is kept. Choose a time to put this page back the way it was then. It publishes straight away.' : 'Every time you save, a copy is kept. Choose one to bring it back, then press Save.'));
    const l = document.createElement('div'); l.className = 'list'; l.textContent = 'Loading…'; b.append(l);
    let list; try { list = (await call('history', { path })).versions; } catch (e) { l.textContent = e.message; return; }
    l.textContent = '';
    list.forEach((v, i) => l.append(button((i === 0 ? 'Now  ·  ' : '') + when(v.date), '', () => restoreVersion(path, kind, v, i === 0))));
    if (!list.length) l.append(note('No earlier versions yet.'));
  }
  async function restoreVersion(path, kind, v, isNow) {
    if (isNow) return toast('That is the version on your site now.');
    let content; try { content = (await call('read', { path, ref: v.sha })).content; } catch (e) { return toast(e.message); }
    if (kind === 'page') {
      if (!(await confirmBox('Put this page back to ' + when(v.date) + '?', 'It replaces the page on your site straight away. Any unsaved changes on this page are lost.', 'Put it back'))) return;
      closePanel(); setMode('browse');
      const name = st.page.name;
      const before = await (await fetch('/' + name + '.html?ee=' + Date.now(), { cache: 'no-store' })).text();
      try { await call('save', { files: [{ path, content }], message: 'Restore earlier version: ' + pageLabel(name) }); } catch (e) { return toast('Not restored: ' + e.message, 7000); }
      delete st.files[path]; delete st.orig[path]; st.undo = []; recomputeDirty();
      $('#frame').hidden = true; const ph = $('#placeholder'); ph.hidden = false; ph.innerHTML = '<div><p><b>Putting your page back…</b></p><p>This takes about a minute. It opens here automatically.</p></div>';
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 6000)); const now = await (await fetch('/' + name + '.html?ee=' + Date.now(), { cache: 'no-store' })).text(); if (now !== before) return openPage(name); }
      return openPage(name);
    }
    checkpoint();
    const f = parseFile('yaml', content); st.files[path].data = f.data; markDirty(path); refreshAll(); renderSide(); closePanel();
    toast('Brought back. Press Save to keep it.');
  }

  /* ---------- page settings, site styles, other panels ---------- */
  function pageSettings() {
    const d = st.page.data; const name = st.page.name;
    const pf = (n) => visible(st.schema.pages.fields).find((f) => f.name === n);
    const site = st.files[DATA.site].data; const mi = (site.menu || []).findIndex((m) => m.link === name + '.html');
    openPanel('Page settings: ' + pageLabel(name), [
      { name: 'General', build: (b) => {
        if (mi > -1) b.append(field({ name: 'label', label: 'Navigation title', type: 'string', description: 'How this page is named in your menu.' }, site.menu[mi], () => { markDirty(DATA.site); renderSide(); }));
        const url = document.createElement('div'); url.className = 'f'; url.innerHTML = '<div class="lab">Page address</div><p class="note"></p>'; $('.note', url).textContent = '/' + name + '.html'; b.append(url);
        if (pf('signup')) b.append(field({ ...pf('signup'), label: 'Show the free week-one sign-up band at the bottom' }, d, () => markDirty(st.page.path)));
        if (name !== 'index') b.append(button('Delete this page', 'btn danger', async () => {
          if (!(await confirmBox('Delete this page?', 'It comes off your website when you save, and out of your menu.'))) return;
          st.files[st.page.path].delete = true; removeFromMenus(name + '.html'); markDirty(st.page.path); closePanel(); toast('This page will be deleted when you save.');
          if (st.mode !== 'edit') save();
        }));
      } },
      { name: 'SEO', build: (b) => {
        b.append(note('This is how the page can look in Google search results.'));
        const serp = document.createElement('div'); serp.className = 'serp'; serp.innerHTML = '<span class="u"></span><span class="t"></span><span class="d"></span>';
        const draw = () => { $('.u', serp).textContent = location.host + ' › ' + (name === 'index' ? '' : name); $('.t', serp).textContent = unesc(d.title || pageLabel(name)); $('.d', serp).textContent = unesc(d.description || 'Add a short description so Google shows the right words.'); };
        draw(); b.append(serp);
        if (pf('title')) b.append(field({ ...pf('title'), label: 'SEO title', description: 'Shown in Google and on the browser tab. About 50 to 60 characters.' }, d, () => { markDirty(st.page.path); draw(); }));
        if (pf('description')) b.append(field({ ...pf('description'), label: 'SEO description', description: 'One or two sentences, about 150 characters.' }, d, () => { markDirty(st.page.path); draw(); }));
      } },
      { name: 'Versions', build: (b) => versionsInto(b, st.page.path, 'page') },
    ]);
  }
  function removeFromMenus(link) {
    const s = st.files[DATA.site].data; let hit = false;
    ['menu', 'mobile_menu'].forEach((k) => { if (Array.isArray(s[k])) { const n = s[k].filter((m) => m.link !== link); if (n.length !== s[k].length) { s[k] = n; hit = true; } } });
    if (s.footer && Array.isArray(s.footer.explore_links)) { const n = s.footer.explore_links.filter((m) => m.link !== link); if (n.length !== s.footer.explore_links.length) { s.footer.explore_links = n; hit = true; } }
    if (hit) markDirty(DATA.site);
  }
  function dataForm(key, title, intro) {
    const f = st.files[DATA[key]]; const sch = st.schema[key];
    openPanel(title, [
      { name: 'Edit', build: (b) => { if (intro) b.append(note(intro)); visible(sch.fields).forEach((fd) => b.append(field(fd, f.data, () => { markDirty(DATA[key]); if (key === 'site') renderSide(); }))); } },
      { name: 'Versions', build: (b) => versionsInto(b, DATA[key], 'data') },
    ]);
    needSave();
  }
  function needSave() { if (st.mode !== 'edit') toast('After making changes here, press Save at the top right.', 5000); }
  function siteStyles() {
    const s = st.files[DATA.site].data;
    openPanel('Site styles', [
      { name: 'Colours', build: (b) => {
        const prev = document.createElement('div'); prev.className = 'palette-preview';
        const drawPrev = () => { prev.innerHTML = ''; Object.values(brandValues()).forEach((c) => { const sp = document.createElement('span'); sp.style.background = c; prev.append(sp); }); };
        drawPrev(); b.append(prev);
        b.append(note('Your brand colours, used across the whole website. Changes show straight away on the page. Press Save to publish them.'));
        const box = s.colours && typeof s.colours === 'object' ? s.colours : {};
        st.schema.colours.fields.forEach((fd) => b.append(field(fd, box, () => { if (Object.keys(box).length) s.colours = box; else delete s.colours; markDirty(DATA.site); applyColours(); drawPrev(); })));
        b.append(button('Reset to your original colours', 'btn', () => { delete s.colours; markDirty(DATA.site); applyColours(); siteStyles(); }));
      } },
      { name: 'Versions', build: (b) => versionsInto(b, DATA.site, 'data') },
    ]);
    needSave();
  }
  function newPageDialog() {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2>Add a page</h2><p>What should the page be called? For example, Workshops, or the name of a new course.</p><div class="f"><input type="text" aria-label="Page name"></div><div class="f"><label for="np-from">Start from</label><select id="np-from"><option value="">A simple page (header, text, closing panel)</option></select><p class="hint">To add a new course or offer, start from a copy of your Online course page. It keeps the same layout, prices and questions, ready for you to change.</p></div><label class="chk"><input type="checkbox" checked> Add it to my menu</label><div class="row"><button class="btn" type="button" data-n>Cancel</button><button class="btn dark" type="button" data-y>Create page</button></div>`;
      const sel = $('#np-from', m);
      st.pages.slice().sort((a, b) => (b === 'people-pleasing') - (a === 'people-pleasing')).forEach((n) => sel.add(new Option('A copy of: ' + pageLabel(n), n)));
      const i = $('input[type=text]', m); const c = $('input[type=checkbox]', m); setTimeout(() => i.focus(), 30);
      const ok = () => { if (!i.value.trim()) return i.focus(); closeModal(); res({ name: i.value.trim(), menu: c.checked, from: sel.value }); };
      i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      $('[data-n]', m).onclick = () => { closeModal(); res(null); }; $('[data-y]', m).onclick = ok;
    });
  }
  async function newPage() {
    finishEdit();
    if (hasChanges()) {
      const c = await choose('Save your changes first?', 'Save what you have done so far, then make the new page.', [['Cancel', 'stay'], ['Save and continue', 'save', 'dark']]);
      if (c !== 'save' || !(await save())) return;
    }
    const ans = await newPageDialog(); if (!ans) return;
    const name = ans.name; const sl = slug(name);
    if (st.pages.includes(sl) || HIDDEN_PAGES.includes(sl)) return toast('There is already a page with that name.');
    const path = 'pages/' + sl + '.md';
    if (ans.from) {
      const src = await readFile('pages/' + ans.from + '.md', 'page');
      const data = structuredClone(src.data);
      data.title = esc(name) + ' | The Ember Room'; data.description = '';
      delete data.schema; delete data.permalink; delete data.data_page;
      const hero = (data.sections || []).find((x) => x.type === 'page_hero' || x.type === 'home_hero');
      if (hero) hero.title = esc(name);
      st.files[path] = { kind: 'page', path, data, body: src.body || '' };
    } else {
      const lib = await readFile('pages/section-library.md', 'page');
      const strip = (x) => { const y = structuredClone(x); delete y.library_label; delete y.library_group; return y; };
      const hero = strip(lib.data.sections.find((s) => s.type === 'page_hero'));
      Object.assign(hero, { title: esc(name), subtitle: 'A short line about this page.', top_left: 'The Ember Room', top_right: 'Norwood\nIn person and online' }); delete hero.facts;
      const panel = { type: 'panel', tone: 'stone', heading: esc(name), text: '<p>Write about this here. Click any words on the page to change them.</p>' };
      const close = strip(lib.data.sections.find((s) => s.type === 'panel' && s.tone === 'close'));
      st.files[path] = { kind: 'page', path, data: { title: esc(name) + ' | The Ember Room', description: '', signup: false, sections: [hero, panel, close] }, body: '' };
    }
    const files = [{ path, content: serialize(st.files[path]) }];
    if (ans.menu) {
      const s = st.files[DATA.site].data; const item = { label: esc(name), link: sl + '.html' };
      ['menu', 'mobile_menu'].forEach((k) => { if (Array.isArray(s[k])) { const at = s[k].findIndex((x) => /about/.test(x.link)); s[k].splice(at === -1 ? s[k].length : at, 0, { ...item }); } });
      files.push({ path: DATA.site, content: serialize(st.files[DATA.site]) });
    }
    try { await call('save', { files, message: 'New page: ' + unesc(name) }); }
    catch (e) { delete st.files[path]; return toast('Not created: ' + e.message, 7000); }
    files.forEach((x) => (st.orig[x.path] = x.content)); delete st.files[path]; delete st.orig[path];
    st.pages.push(sl); PAGE_NAMES[sl] = unesc(name); recomputeDirty(); setMode('browse');
    $('#frame').hidden = true; $('#placeholder').hidden = false; $('#page-name').textContent = unesc(name);
    renderSide(); waitForPage(sl);
  }
  async function journal() {
    finishEdit();
    let posts = [];
    try { posts = (await call('list', { dir: '_posts' })).files.filter((f) => f.name.endsWith('.md')).reverse(); } catch (e) { return toast(e.message); }
    openPanel('Journal', (b) => {
      b.append(button('+ Write a new post', 'btn dark', newPost));
      const l = document.createElement('div'); l.className = 'list';
      posts.forEach((p) => l.append(button(p.name.slice(11, -3).replace(/-/g, ' ') + '  ·  ' + p.name.slice(0, 10), '', () => editPost(p.path))));
      b.append(l);
    });
  }
  async function editPost(path) {
    const f = await readFile(path, 'post');
    if (f.html == null) f.html = /<\/?(p|h3|ul)\b/.test(f.body) ? f.body : mdToHtml(f.body);
    openPanel('Journal post', (b) => {
      const sch = st.schema.journal.fields.filter((x) => x.name !== 'body');
      visible(sch).forEach((fd) => b.append(field(fd, f.data, () => markDirty(path))));
      const holder = { body: f.html };
      b.append(field({ name: 'body', label: 'Post', type: 'rich-text', description: 'Select words and press Ctrl or Cmd + B for bold.' }, holder, () => { f.html = holder.body; f.body = holder.body + '\n'; markDirty(path); }));
      b.append(note('Press Save at the top right. Posts appear on your Journal page about a minute later.'));
      b.append(button('Delete this post', 'btn danger', async () => { if (!(await confirmBox('Delete this post?', 'It comes off your Journal when you save.'))) return; f.delete = true; markDirty(path); closePanel(); }));
    });
  }
  async function newPost() {
    const title = await ask('New journal post', 'What is the title?'); if (!title) return;
    const today = new Date().toISOString().slice(0, 10);
    const path = '_posts/' + today + '-' + slug(title) + '.md';
    st.files[path] = { kind: 'post', path, data: { title: esc(title), date: today, excerpt: '' }, body: '<p>Start writing here.</p>\n', html: '<p>Start writing here.</p>' };
    markDirty(path); editPost(path);
  }
  function mdToHtml(md) {
    const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    return md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
      if (/^#{1,6}\s/.test(b)) return '<h3>' + inl(b.replace(/^#+\s*/, '')) + '</h3>';
      if (/^[-*]\s/.test(b)) return '<ul>' + b.split('\n').map((l) => '<li>' + inl(l.replace(/^[-*]\s*/, '')) + '</li>').join('') + '</ul>';
      return '<p>' + inl(b).replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }
  function help() {
    const m = openModal(); m.innerHTML = `<h2>How to edit</h2>
      <p><b>Pages</b> are on the left. Click one to see it. Click <b>Edit</b> at the top to change it, then <b>Save</b>, and <b>Exit</b> when you're done.</p>
      <p><b>Words:</b> click any words and type. To make words bold, a link or a colour, select them and use the small toolbar.</p>
      <p><b>Anything else:</b> click it for its toolbar: delete, move, duplicate, change its link, or select the whole card or list it sits in.</p>
      <p><b>Sections:</b> hover over a section. Use <b>Edit section</b> for its content, design and background, the arrows to move it, or <b>Add Section</b> on its top or bottom edge for a new one.</p>
      <p><b>Photos:</b> click a photo to change it. For a photo behind words, click an empty part of the section.</p>
      <p><b>Undo</b> and <b>Redo</b> are at the top right (or Cmd/Ctrl + Z). After saving, a page's <b>Versions</b> tab (⚙ next to the page) can put it back.</p>
      <div class="row"><button class="btn" type="button" data-pw>Change my password</button><button class="btn dark" type="button" data-x>Got it</button></div>`;
    $('[data-x]', m).onclick = closeModal;
    $('[data-pw]', m).onclick = () => { closeModal(); showSetPw('change'); };
  }

  /* ---------- save ---------- */
  async function save() {
    finishEdit(); clearSel();
    if (!hasChanges()) return true;
    const files = [];
    for (const p of st.dirty) { const f = st.files[p]; if (!f) continue; files.push(f.delete ? { path: p, delete: true } : { path: p, content: serialize(f) }); }
    for (const p in st.uploads) files.push({ path: p, base64: st.uploads[p] });
    $('#btn-save').disabled = true; $('#status').textContent = 'Saving…';
    try {
      await call('save', { files, message: 'Website edit: ' + (st.page ? pageLabel(st.page.name) : 'settings') });
      files.forEach((x) => { if (x.content != null) st.orig[x.path] = x.content; });
      st.uploads = {}; st.undo = []; st.redo = [];
      let gone = false;
      for (const p in st.files) if (st.files[p].delete) { delete st.files[p]; delete st.orig[p]; st.pages = st.pages.filter((n) => 'pages/' + n + '.md' !== p); gone = true; }
      recomputeDirty(); $('#status').textContent = 'Saved'; toast('Saved. Your website updates in about a minute.');
      renderSide();
      if (gone && st.page && !st.files[st.page.path]) { setMode('browse'); openPage('index'); }
      return true;
    } catch (e) { updateBar(); $('#status').textContent = 'Not saved'; toast('Not saved: ' + e.message, 7000); return false; }
  }
  async function waitForPage(sl) {
    const ph = $('#placeholder'); ph.innerHTML = '<div><p><b>Creating your page…</b></p><p>This takes about a minute. It opens here automatically, ready to edit.</p></div>';
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 6000)); const r = await fetch('/' + sl + '.html?ee=' + Date.now(), { cache: 'no-store' }); if (r.ok) return openPage(sl); }
    ph.innerHTML = '<div><p>Your page is taking longer than usual. Choose it from the Pages list in a few minutes.</p></div>';
  }

  /* ---------- password ---------- */
  function showSetPw(mode) {
    const app = !$('#app').hidden;
    $('#login').hidden = false; $('#login-form').hidden = true; $('#setpw-form').hidden = false;
    $('#login').classList.toggle('over', app);
    const first = mode === 'first';
    $('#setpw-title').textContent = first ? 'Create your password' : 'Change your password';
    $('#setpw-intro').textContent = first ? 'Before you start, choose your own password. Only you will know it. Use at least 8 characters.' : 'Choose a new password. Use at least 8 characters.';
    $('#pw-current-wrap').hidden = first && !!st.loginPw;
    $('#pw-current-label').textContent = first ? 'The starter password Mel gave you' : 'Your current password';
    $('#setpw-cancel').hidden = first;
    $('#setpw-msg').textContent = ''; $('#pw-new').value = ''; $('#pw-confirm').value = ''; $('#pw-current').value = '';
    setTimeout(() => ($('#pw-current-wrap').hidden ? $('#pw-new') : $('#pw-current')).focus(), 30);
    $('#setpw-form').dataset.mode = mode;
  }
  function hideSetPw() { $('#setpw-form').hidden = true; $('#login-form').hidden = false; $('#login').classList.remove('over'); $('#login').hidden = true; }
  $('#setpw-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('#setpw-msg'); msg.textContent = '';
    const current = $('#pw-current-wrap').hidden ? st.loginPw : $('#pw-current').value;
    const next = $('#pw-new').value;
    if (next.length < 8) return (msg.textContent = 'Please use at least 8 characters.');
    if (next !== $('#pw-confirm').value) return (msg.textContent = 'The two new passwords don’t match.');
    try {
      const r = await call('set_password', { current, next });
      token = r.token; try { localStorage.setItem(TOKEN_KEY, token); } catch (er) {}
      st.loginPw = null;
      const wasFirst = $('#setpw-form').dataset.mode === 'first';
      hideSetPw();
      if (wasFirst && $('#app').hidden) start(true); else toast('Your password is changed.');
    } catch (er) { msg.textContent = er.message; }
  });
  $('#setpw-cancel').onclick = hideSetPw;
  $('#pw-show').onchange = (e) => $$('#setpw-form input[type=password],#setpw-form input[data-pw]').forEach((i) => { i.type = e.target.checked ? 'text' : 'password'; i.dataset.pw = '1'; });

  /* ---------- start ---------- */
  async function start(skipCheck) {
    if (!skipCheck) {
      try { const s = await call('status'); if (s.must_change) return showSetPw('first'); } catch (e) { if (!token) return; return toast(e.message, 8000); }
    }
    $('#login').hidden = true; $('#app').hidden = false;
    try {
      st.schema = await (await fetch('/assets/editor/schema.json?ee=' + Date.now())).json();
      await Promise.all([readFile(DATA.site, 'yaml'), readFile(DATA.practice, 'yaml'), readFile(DATA.faq, 'yaml')]);
      st.pages = (await call('list', { dir: 'pages' })).files.map((f) => f.name.replace(/\.md$/, '')).filter((n) => !HIDDEN_PAGES.includes(n));
    } catch (e) { return toast(e.message, 8000); }
    let last = 'index'; try { last = localStorage.getItem('ember-editor-page') || 'index'; } catch (e) {}
    if (!st.pages.includes(last)) last = 'index';
    setMode('browse'); openPage(last);
  }
  function logout(msg) {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    token = null; $('#app').hidden = true; $('#login').hidden = false; $('#setpw-form').hidden = true; $('#login-form').hidden = false; if (msg) $('#login-msg').textContent = msg;
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#login-msg').textContent = '';
    try {
      const pw = $('#pw').value;
      const r = await call('login', { password: pw }); token = r.token; try { localStorage.setItem(TOKEN_KEY, token); } catch (er) {}
      if (r.must_change) { st.loginPw = pw; return showSetPw('first'); }
      start(true);
    } catch (er) { $('#login-msg').textContent = er.message; }
  });
  $('#btn-page').onclick = () => st.page && pageSettings();
  $('#btn-back').onclick = () => { if (st.mode === 'edit') return $('#btn-exit').click(); closePanel(); $('#app').classList.remove('m-page'); };
  // panels opened from the Pages list on a phone show over the list
  const sideTool = (fn) => () => { if (phone()) $('#app').classList.add('m-page'); fn(); };
  $('#btn-new').onclick = newPage;
  $('#btn-colours').onclick = sideTool(siteStyles); $('#btn-styles').onclick = siteStyles;
  $('#btn-fees').onclick = sideTool(() => dataForm('practice', 'Business info', 'Your prices, days, address and email. Change them once here and they update on every page.'));
  $('#btn-menu').onclick = sideTool(() => dataForm('site', 'Navigation & footer', 'Your menu, footer and the free sign-up band. In Edit mode you can also click them right on the page.'));
  $('#btn-faq').onclick = sideTool(() => dataForm('faq', 'FAQs', 'The numbered questions on your Fees & FAQ page.'));
  $('#btn-journal').onclick = sideTool(journal);
  $('#btn-help').onclick = help;
  $('#btn-save').onclick = save;
  $('#btn-undo').onclick = undo; $('#btn-redo').onclick = redo;
  document.addEventListener('mousedown', (e) => { if (!$('#palette').hidden && !e.target.closest('#palette') && !e.target.closest('.chip') && !e.target.closest('#rt')) hidePalette(); });
  window.addEventListener('beforeunload', (e) => { if (hasChanges()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    const typing = e.target.closest && e.target.closest('input,textarea,[contenteditable]');
    if (mod && e.key.toLowerCase() === 'z' && !typing && st.mode === 'edit') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (e.key === 'Escape' && !$('#lib').hidden) hideLib();
  });
  if (DEBUG) window.__ee = st;
  if (token) start(); else $('#login').hidden = false;
})();
