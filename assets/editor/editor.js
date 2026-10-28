/* The Ember Room website editor.
   Shows the real page in a frame. Click anything to change it: words, photos, buttons, links.
   A small toolbar appears on whatever is selected (delete, move, copy, link, select the bigger group).
   Each section has its own bar. Undo steps back. Save publishes. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const API = qs.get('api') || window.EDITOR_API;
  const TOKEN_KEY = 'ember-editor-token';
  const PAGE_NAMES = { index: 'Home', 'somatic-therapy-norwood': 'Individual therapy', 'couples-therapy-adelaide': 'Couples therapy', 'guided-rest': 'Guided Rest', 'people-pleasing': 'Online course', 'fees-faq': 'Fees & FAQ', book: 'Book', about: 'About', privacy: 'Privacy' };
  const HIDDEN_PAGES = ['section-library'];
  const DATA = { site: '_data/site.yml', practice: '_data/practice.yml', faq: '_data/faq.yml' };
  const BRAND_VARS = { plum: ['--ink', '--ink-2'], plum_deep: ['--plum-deep'], charcoal: ['--char'], stone: ['--stone', '--stone-2'], terracotta: ['--terra'], terracotta_text: ['--terra-deep'], dust: ['--dust'] };
  const BRAND_DEFAULTS = { plum: '#5B2A38', plum_deep: '#3A1621', charcoal: '#303636', stone: '#E5E3DC', terracotta: '#D4967D', terracotta_text: '#A35A40', dust: '#D9C3C0' };
  const TEXT_SEL = ':is(p,li,h1,h3,summary,blockquote,dt,dd,small,.cap,.mark,.sub,.tag,.trio span,.pill,.price,.what):not(.btn)';
  const DEBUG = qs.has('debug');
  let token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}

  const st = { files: {}, orig: {}, dirty: new Set(), uploads: {}, page: null, schema: null, pages: [], doc: null, editing: null, sel: null, newPage: null, undo: [], loginPw: null };

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
    status(hasChanges() ? 'Unsaved changes' : '');
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
  function status(s) { $('#status').textContent = s; }
  function toHex(c) {
    if (!c) return '';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c.slice(1).split('').map((x) => x + x).join('')).toUpperCase();
    const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase() : '';
  }
  const validColour = (c) => /^#[0-9A-F]{6}$/i.test(c || '');

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

  /* ---------- undo ---------- */
  function stateJSON() {
    const files = {}; for (const p in st.files) { const f = st.files[p]; files[p] = { kind: f.kind, path: f.path, data: f.data, body: f.body, html: f.html, delete: f.delete, name: f.name }; }
    return JSON.stringify({ files, uploads: Object.keys(st.uploads) });
  }
  function checkpoint() {
    const snap = { json: stateJSON(), uploads: { ...st.uploads }, html: st.doc ? st.doc.body.innerHTML : null, page: st.page && st.page.path };
    const top = st.undo[st.undo.length - 1];
    if (top && top.json === snap.json) return;
    st.undo.push(snap); if (st.undo.length > 60) st.undo.shift(); updateBar();
  }
  function dropIfUnchanged() { const top = st.undo[st.undo.length - 1]; if (top && top.json === stateJSON()) { st.undo.pop(); updateBar(); } }
  function undo() {
    if (st.editing) { finishEdit(); }
    const snap = st.undo.pop(); if (!snap) return updateBar();
    hidePanelOnly(); clearSel();
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
      sectionNodes().forEach((n, i) => { n.__sec = secs[i]; decorate(n); });
      refreshAll();
    }
    recomputeDirty(); toast('Undone');
  }

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

  /* rich text toolbar */
  function showRT(el) {
    const bar = $('#rt'); bar.hidden = false;
    const fr = $('#frame').getBoundingClientRect(); const r = rectOf(el);
    bar.style.top = Math.max(fr.top + 6, fr.top + r.top - 44) + 'px';
    bar.style.left = Math.min(window.innerWidth - 300, Math.max(8, fr.left + r.left)) + 'px';
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

  /* colour palette popover (used by the text toolbar and colour fields) */
  function brandValues() { const c = (st.files[DATA.site] && st.files[DATA.site].data.colours) || {}; const out = {}; for (const k in BRAND_DEFAULTS) out[k] = validColour(c[k]) ? c[k] : BRAND_DEFAULTS[k]; return out; }
  function swatches() { const b = brandValues(); return [[b.plum, 'Plum'], [b.plum_deep, 'Deep plum'], [b.charcoal, 'Charcoal'], [b.stone, 'Stone'], [b.terracotta, 'Terracotta'], [b.terracotta_text, 'Deep terracotta'], [b.dust, 'Dusty pink'], ['#FFFFFF', 'White']]; }
  function showPalette(anchor, pick) {
    const p = $('#palette'); p.innerHTML = '';
    swatches().forEach(([c, n]) => { const s = document.createElement('button'); s.type = 'button'; s.className = 'sw'; s.style.background = c; s.title = n; s.onclick = () => { hidePalette(); pick(c); }; p.append(s); });
    const custom = document.createElement('label'); custom.className = 'sw custom'; custom.title = 'Any colour'; const ci = document.createElement('input'); ci.type = 'color'; ci.onchange = () => { hidePalette(); pick(ci.value.toUpperCase()); }; custom.append(ci, document.createTextNode('+')); p.append(custom);
    const none = document.createElement('button'); none.type = 'button'; none.className = 'none'; none.textContent = 'Default'; none.onclick = () => { hidePalette(); pick(''); }; p.append(none);
    const r = anchor.getBoundingClientRect(); p.style.top = r.bottom + 6 + 'px'; p.style.left = Math.min(window.innerWidth - 290, r.left) + 'px'; p.hidden = false;
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
        status('Preparing photo…');
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
        updateBar();
      };
      inp.click();
    });
  }
  function useUpload(pic) { st.uploads[pic.path] = pic.b64; }
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

  /* ---------- selecting things and the element toolbar ---------- */
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
      if (n.dataset && n.dataset.eg != null) { const gp = n.dataset.eg.startsWith('@') ? n.dataset.eg : n.dataset.eg; if (!out.some((o) => o.dataset.eg === gp)) out.push(n); }
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
  function select(el) {
    clearSel(); st.sel = el; el.classList.add('ee-sel'); showET(el);
  }
  function clearSel() { if (st.sel) st.sel.classList.remove('ee-sel'); st.sel = null; $('#et').hidden = true; }
  function etButton(label, fn, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.onmousedown = (e) => e.preventDefault(); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }
  function showET(el) {
    const bar = $('#et'); bar.innerHTML = '';
    let d; try { d = describe(el); } catch (e) { bar.hidden = true; return; }
    const add = (...b) => bar.append(...b);
    if (d.kind === 'image') add(etButton('Change photo', () => editImage(el)));
    const lp = d.kind !== 'group' ? linkPathFor(d) : null;
    if (lp) add(etButton(d.el.dataset.eb != null ? 'Button link & style' : 'Link', () => editLink(d, lp)));
    const target = d.isItem ? d.item : d.path;
    if (d.isItem) {
      add(etButton('↑', () => moveItem(d, -1), 'ic'), etButton('↓', () => moveItem(d, 1), 'ic'), etButton('Copy', () => copyItem(d)));
    }
    add(etButton(d.kind === 'group' ? 'Delete ' + nameOfPath(d.prefix + target).replace(/^this /, '') : 'Delete', () => removeThing(d, target), 'danger'));
    const groups = groupsAbove(el, d).filter((g) => g.dataset.eg !== d.prefix + target && g.dataset.eg !== target);
    if (groups.length) { const sep = document.createElement('span'); sep.className = 'sep'; add(sep); }
    groups.slice(0, 2).forEach((g) => add(etButton('Select ' + nameOfPath(g.dataset.eg), () => { finishEdit(); select(g); })));
    const sec = el.closest('main > [data-s]');
    if (sec && !d.prefix) add(etButton('Select section', () => { finishEdit(); clearSel(); sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); flag(sec, 'Use the dark bar at the top right of this section to move, copy, delete or change its colours.'); sec.classList.add('ee-hot'); setTimeout(() => sec.classList.remove('ee-hot'), 2500); }));
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
    finishEdit(); checkpoint();
    const t = ctxOf(a, a.dataset.eb); const b = getAt(t.obj, t.path) || {};
    openPanel('Button', (body) => {
      body.append(note('Change what the button says and where it goes.'));
      body.append(field({ name: 'label', label: 'Button text', type: 'string' }, b, () => { a.innerHTML = fill(b.label || ''); markDirty(t.file); }));
      body.append(field({ name: 'link', label: 'Where it goes', type: 'string', description: 'One of your pages (e.g. people-pleasing.html or book.html#book-now), a part of a page (#faq), or a full web address.' }, b, () => { a.setAttribute('href', unesc(fill(b.link || ''))); markDirty(t.file); }));
      body.append(field({ name: 'ghost', label: 'Outline style', type: 'boolean' }, b, () => { a.classList.toggle('ghost', !!b.ghost); markDirty(t.file); }));
      body.append(field({ name: 'new_tab', label: 'Open in a new tab', type: 'boolean' }, b, () => markDirty(t.file)));
    });
  }

  /* structure changes on lists and groups */
  const ATTRS = ['data-e', 'data-eb', 'data-eg', 'data-ei'];
  function rewrite(scope, full, fn) {
    const nodes = [scope, ...$$('*', scope)];
    nodes.forEach((n) => ATTRS.forEach((a) => {
      const v = n.getAttribute && n.getAttribute(a); if (v == null) return;
      const k = a === 'data-eb' ? v : v;
      if (!(k === full || k.startsWith(full + '.'))) return;
      const rest = k.slice(full.length + 1); const m = rest.match(/^(\d+)(.*)$/); if (!m) return;
      const ni = fn(+m[1]); if (ni == null) return;
      n.setAttribute(a, full + '.' + ni + m[2]);
    }));
  }
  function nodesFor(scope, full) {
    const marked = $$('[data-eg="' + full + '"]', scope);
    if (marked.length) return marked;
    const hits = $$('*', scope).filter((n) => ATTRS.some((a) => { const v = n.getAttribute(a); if (v == null) return false; const k = a === 'data-eb' ? v : v; return k === full || k === full + '.label' || (a !== 'data-eg' && k.startsWith(full + '.')); }));
    return hits.filter((n) => !hits.some((o) => o !== n && o.contains(n)));
  }
  function renumber(scope) { $$('ol.sequence', scope).forEach((ol) => $$(':scope > li .num', ol).forEach((s, i) => (s.textContent = (i < 9 ? '0' : '') + (i + 1)))); }
  function afterStructure(d) { markDirty(d.file); if (d.sec) { renumber(d.sec); } applyColours(); }
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
    if (d.prefix) rewriteCopies(d, full, (i) => (i === idx ? j : i === j ? idx : null), [[idx, j]]);
    afterStructure(d); const el = d.el; select(el);
  }
  function rewriteCopies() { /* header and footer copies are rewritten together because @ paths use the whole page as scope */ }
  function copyItem(d) {
    finishEdit();
    const { arrPath, idx } = splitItem(d); const arr = getAt(d.obj, arrPath); if (!Array.isArray(arr)) return;
    checkpoint();
    arr.splice(idx + 1, 0, structuredClone(arr[idx]));
    const full = d.prefix + arrPath;
    const orig = nodesFor(d.scope, full + '.' + idx);
    rewrite(d.scope, full, (i) => (i > idx ? i + 1 : null));
    orig.slice().reverse().forEach((o) => { const c = o.cloneNode(true); c.classList.remove('ee-sel'); rewrite(c, full, (i) => (i === idx ? idx + 1 : null)); o.after(c); });
    afterStructure(d); toast('Copied. Click the copy to change it.');
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

  /* ---------- sections ---------- */
  const TOOLS_CSS = `
    [data-e],[data-eb]{cursor:text;transition:outline-color .15s}
    [data-e]:hover,[data-eb]:hover,.ed[data-e]:hover>*{outline:2px dashed rgba(212,150,125,.9);outline-offset:3px}
    .ee-editing,.ed.ee-editing>*{outline:2px solid #D4967D!important;outline-offset:3px}
    .ee-sel,.ed.ee-sel>*{outline:3px solid #D4967D!important;outline-offset:4px}
    [data-ei]{cursor:pointer}
    [data-ei]:hover{outline:3px dashed #D4967D;outline-offset:3px}
    main>[data-s]{position:relative}
    main>[data-s]:hover{box-shadow:inset 0 0 0 2px rgba(212,150,125,.7)}
    main>[data-s].ee-hot{box-shadow:inset 0 0 0 4px #D4967D}
    main>[data-s]:has([data-ebg]){cursor:copy}
    main>[data-s]:has([data-ebg]) :is([data-e],[data-eb]){cursor:text}
    .ee-bar{position:absolute;top:10px;right:10px;z-index:60;display:none;gap:4px;background:#3A1621;border-radius:10px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.3);font:500 12px/1 "Instrument Sans",system-ui,sans-serif;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 20px)}
    main>[data-s]:hover>.ee-bar,.ee-bar:focus-within,main>[data-s].ee-hot>.ee-bar{display:flex}
    .ee-bar button{all:unset;color:#fff;padding:7px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}
    .ee-bar button:hover{background:rgba(255,255,255,.16)}
    .ee-bar .ee-name{color:#D4967D;padding:7px 9px}
    .ee-bar button[data-act=add]{background:#D4967D;color:#3A1621;font-weight:600}
    .ee-bar button[data-act=add]:hover{background:#e0a993}
    .ee-flag{position:absolute;left:10px;top:10px;z-index:60;background:#FBEFD9;color:#5a3b06;font:500 12px/1.3 "Instrument Sans",system-ui,sans-serif;padding:7px 10px;border-radius:8px;max-width:280px}
    .bookbar{display:none!important}`;
  function blockLabel(type) { return (st.schema.blocks[type] || {}).label || type; }
  function decorate(node) {
    $$(':scope > .ee-bar', node).forEach((n) => n.remove());
    const bar = st.doc.createElement('div'); bar.className = 'ee-bar';
    const name = st.doc.createElement('span'); name.className = 'ee-name'; name.textContent = blockLabel(node.__sec.type);
    bar.append(name);
    const acts = [['↑', 'up', 'Move up'], ['↓', 'down', 'Move down'], ['Settings & colours', 'settings', 'Settings and colours']];
    if ($('[data-ebg]', node)) acts.push(['Background photo', 'bg', 'Change the background photo']);
    acts.push(['Copy', 'copy', 'Copy this section'], ['Delete', 'delete', 'Delete this section'], ['+ Add section below', 'add', 'Add a new section below this one']);
    acts.forEach(([t, a, title]) => { const b = st.doc.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.dataset.act = a; bar.append(b); });
    node.prepend(bar);
  }
  function sectionNodes() { return $$('main > [data-s]', st.doc); }
  function syncSections() {
    const nodes = sectionNodes();
    nodes.forEach((n, i) => (n.dataset.s = i));
    st.page.data.sections = nodes.map((n) => n.__sec);
    applyColours();
  }
  async function sectionAction(node, act) {
    finishEdit(); clearSel();
    const nodes = sectionNodes(); const i = nodes.indexOf(node);
    if (act === 'settings') return sectionSettings(node);
    if (act === 'add') return openLibrary(node);
    if (act === 'bg') return editBackground(node);
    if (act === 'delete' && !(await confirmBox('Delete this section?', 'It comes off the page when you save. Undo brings it back.'))) return;
    if ((act === 'up' && i === 0) || (act === 'down' && i === nodes.length - 1)) return;
    checkpoint();
    if (act === 'up') nodes[i - 1].before(node);
    else if (act === 'down') nodes[i + 1].after(node);
    else if (act === 'copy') { const c = node.cloneNode(true); c.__sec = structuredClone(node.__sec); node.after(c); decorate(c); flag(c, 'Copy. Edit it like any other section.'); }
    else if (act === 'delete') node.remove();
    syncSections(); markDirty(st.page.path);
    if (act !== 'delete') node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function flag(node, text) { let f = $(':scope > .ee-flag', node); if (!f) { f = st.doc.createElement('div'); f.className = 'ee-flag'; node.append(f); } f.textContent = text; clearTimeout(f.__t); f.__t = setTimeout(() => f.remove(), 6000); }

  /* section library */
  function sectionInView() {
    const nodes = sectionNodes(); const h = $('#frame').clientHeight;
    let best = nodes[nodes.length - 1], dist = Infinity;
    nodes.forEach((n) => { const r = n.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - h / 2); if (r.bottom > 0 && r.top < h && d < dist) { dist = d; best = n; } });
    return best;
  }
  function addSectionFromBar() {
    if (!st.doc || $('#frame').hidden) return toast('Open a page first.');
    const node = sectionInView(); if (!node) return;
    node.classList.add('ee-hot'); setTimeout(() => node.classList.remove('ee-hot'), 2500);
    openLibrary(node, 'It goes in below the section in the middle of your screen (outlined). You can move it after.');
  }
  function openLibrary(afterNode, where) {
    const m = openModal(true);
    m.innerHTML = '<div class="lib-head"><div><h2>Add a section</h2><p>These are the designs from your website. Choose one and it drops in matching your site. Then change the words, photos and colours. <span data-where></span></p></div><button class="ee-btn" type="button" data-x>Cancel</button></div>';
    if (where) $('[data-where]', m).textContent = where;
    const fr = document.createElement('iframe'); fr.className = 'lib-frame'; fr.title = 'Section designs'; fr.src = '/section-library.html?ee=' + Date.now();
    m.append(fr); $('[data-x]', m).onclick = closeModal;
    fr.onload = async () => {
      const lib = await readFile('pages/section-library.md', 'page');
      const d = fr.contentDocument; const st2 = d.createElement('style');
      st2.textContent = '.site-head,.drawer,.site-foot,.bookbar,.signup{display:none!important} main>[data-s]{position:relative} .ee-pick{position:absolute;top:14px;right:14px;z-index:60;all:unset;background:#D4967D;color:#3A1621;font:600 14px/1 "Instrument Sans",system-ui,sans-serif;padding:12px 18px;border-radius:999px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3)} .ee-lab{position:absolute;top:14px;left:14px;z-index:60;background:#3A1621;color:#fff;font:600 13px/1 "Instrument Sans",system-ui,sans-serif;padding:10px 14px;border-radius:999px}';
      d.head.append(st2);
      $$('main > [data-s]', d).forEach((n, i) => {
        const data = lib.data.sections[i]; if (!data) return;
        const lab = d.createElement('span'); lab.className = 'ee-lab'; lab.textContent = data.library_label || blockLabel(data.type);
        const b = d.createElement('button'); b.type = 'button'; b.className = 'ee-pick'; b.textContent = 'Add this section';
        b.onclick = () => {
          checkpoint();
          const sec = structuredClone(data); delete sec.library_label;
          const node = st.doc.importNode(n, true); $$('.ee-pick,.ee-lab', node).forEach((x) => x.remove());
          node.__sec = sec; afterNode.after(node); decorate(node); syncSections(); markDirty(st.page.path); closeModal();
          flag(node, 'New section. Click any words or photos to make them yours.');
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        n.append(lab, b);
      });
    };
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
      case 'image': { const t = document.createElement('div'); t.className = 'thumb'; const im = document.createElement('img'); im.alt = ''; if (v) im.src = v; const b = button(v ? 'Change photo' : 'Choose photo', 'ee-btn', async () => { const pic = await chooseImage(); if (!pic) return; useUpload(pic); im.src = pic.preview; set(pic.src); b.textContent = 'Change photo'; }); t.append(im, b); w.append(lab, t); if (hint) w.append(hint); return w; }
      case 'color': return colourField(def, obj, changed, w, lab, hint);
      case 'object': return def.list ? objectList(def, obj, changed) : objectGroup(def, obj, changed);
      default: { input = document.createElement('input'); input.type = 'text'; input.value = unesc(v ?? ''); input.oninput = () => set(input.value === '' ? undefined : esc(input.value)); }
    }
    input.id = id; w.append(lab, input); if (hint) w.append(hint); return w;
  }
  function colourField(def, obj, changed, w, lab, hint) {
    const row = document.createElement('div'); row.className = 'colour-row';
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip';
    const txt = document.createElement('span'); txt.className = 'ctext';
    const draw = () => { const c = obj[def.name]; chip.style.background = validColour(c) ? c : def.default || 'transparent'; chip.classList.toggle('empty', !validColour(c) && !def.default); txt.textContent = validColour(c) ? c : def.default ? 'Original (' + def.default + ')' : 'Not set'; };
    chip.onclick = () => showPalette(chip, (c) => { if (c) obj[def.name] = c; else delete obj[def.name]; draw(); changed && changed(); });
    row.append(chip, txt); draw();
    w.append(lab, row); if (hint) w.append(hint); return w;
  }
  function visible(fields) { return (fields || []).filter((f) => !f.hidden); }
  function objectGroup(def, obj, changed) {
    const d = document.createElement('details'); d.className = 'group'; if (def.name === 'colours') d.open = true;
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
      box.append(button('+ Add ' + (def.label || 'item').toLowerCase().replace(/s$/, ''), 'ee-btn', () => { arr().push({}); changed && changed(); draw(); }));
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
        inp.value = unesc(v); inp.style.flex = '1'; inp.style.font = 'inherit'; inp.style.padding = '8px 10px'; inp.style.border = '1px solid var(--line)'; inp.style.borderRadius = '8px';
        inp.oninput = () => { arr()[i] = esc(inp.value); changed && changed(); };
        row.append(inp, button('Remove', 'mini', () => { arr().splice(i, 1); changed && changed(); draw(); }));
        box.append(row);
      });
      box.append(button('+ Add', 'ee-btn', () => { arr().push(''); changed && changed(); draw(); }));
    };
    draw(); return w;
  }
  function sectionSettings(node) {
    const sec = node.__sec; const def = st.schema.blocks[sec.type];
    openPanel(blockLabel(sec.type), (body) => {
      body.append(note('Colours show straight away. Words and photos are easiest to change right on the page. Changes to layout and lists show after you save.'));
      const fields = visible(def ? def.fields : []);
      const col = fields.find((f) => f.name === 'colours');
      const order = col ? [col, ...fields.filter((f) => f !== col)] : fields;
      order.forEach((f) => body.append(field(f, sec, () => { markDirty(st.page.path); applyColours(); refreshSection(node); })));
    });
  }
  function refreshSection(node) { $$('[data-e],[data-eb]', node).forEach((el) => { const k = keyOf(el); if (k.startsWith('@') || el === st.editing) return; const v = getAt(node.__sec, k); if (v != null) render(el, v); }); }

  /* panel and modals */
  function openPanel(title, build) {
    finishEdit(); clearSel(); checkpoint(); $('#panel-title').textContent = title; const b = $('#panel-body'); b.innerHTML = ''; build(b); $('#panel').hidden = false;
  }
  function hidePanelOnly() { $('#panel').hidden = true; hidePalette(); }
  function closePanel() { if ($('#panel').hidden) return; hidePanelOnly(); dropIfUnchanged(); refreshAll(); recomputeDirty(); }
  $('#panel-close').onclick = closePanel;
  function openModal(wide) { const m = $('#modal'); const c = $('.modal-card', m); c.className = 'modal-card' + (wide ? ' wide' : ''); $('#modal-body').remove(); const b = document.createElement('div'); b.id = 'modal-body'; b.style.display = 'contents'; c.append(b); m.hidden = false; return b; }
  function closeModal() { $('#modal').hidden = true; }
  function confirmBox(title, text, yes = 'Yes, delete') {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="row"><button class="ee-btn" type="button" data-n>Cancel</button><button class="ee-btn primary" type="button" data-y></button></div>`;
      $('h2', m).textContent = title; $('p', m).textContent = text; $('[data-y]', m).textContent = yes;
      $('[data-n]', m).onclick = () => { closeModal(); res(false); }; $('[data-y]', m).onclick = () => { closeModal(); res(true); };
    });
  }
  function choose(title, text, options) {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="row"></div>`;
      $('h2', m).textContent = title; $('p', m).textContent = text;
      options.forEach(([label, val, cls]) => $('.row', m).append(button(label, 'ee-btn ' + (cls || ''), () => { closeModal(); res(val); })));
    });
  }
  function ask(title, text, value = '') {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2></h2><p></p><div class="f"><input type="text"></div><div class="row"><button class="ee-btn" type="button" data-n>Cancel</button><button class="ee-btn primary" type="button" data-y>OK</button></div>`;
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
    if (nodes.length !== secs.length) {
      $('#banner').textContent = 'Your latest changes are still being published. Give it a minute, then choose this page again to keep editing.';
      $('#banner').hidden = false; nodes.forEach((n) => (n.style.pointerEvents = 'none')); return;
    }
    $('#banner').hidden = true;
    nodes.forEach((n, i) => { n.__sec = secs[i]; decorate(n); });
    refreshAll();
    d.addEventListener('click', (e) => {
      const t = e.target;
      const bar = t.closest('.ee-bar button'); if (bar) { e.preventDefault(); e.stopPropagation(); return sectionAction(t.closest('main > [data-s]'), bar.dataset.act); }
      if (st.editing && st.editing.contains(t)) { if (t.closest('a')) e.preventDefault(); return; }
      const ei = t.closest('[data-ei]'); if (ei) { e.preventDefault(); e.stopPropagation(); finishEdit(); return select(ei); }
      const el = t.closest('[data-e],[data-eb]');
      if (el && (!keyOf(el).startsWith('@') || st.files[DATA[keyOf(el).slice(1).split(':')[0]]])) { e.preventDefault(); e.stopPropagation(); clearSel(); startEdit(el); st.sel = el; el.classList.add('ee-sel'); showET(el); return; }
      const wasEditing = !!st.editing; const hadSel = !!st.sel;
      finishEdit();
      const secNode = t.closest('main > [data-s]');
      const onEmpty = secNode && !t.closest('[data-e],[data-eb],[data-ei],[data-eg],a,button,input,select,textarea,iframe,.ee-bar,.ee-flag');
      if (!wasEditing && !hadSel && onEmpty && $('[data-ebg]', secNode)) { e.preventDefault(); return editBackground(secNode); }
      const g = t.closest('[data-eg]'); if (g && !wasEditing) { e.preventDefault(); e.stopPropagation(); return select(g); }
      clearSel();
      const a = t.closest('a'); if (a) { e.preventDefault(); const href = a.getAttribute('href') || ''; const m = href.match(/^\/?([a-z0-9-]+)\.html/); if (m && st.pages.includes(m[1])) toast('To edit that page, choose it from the page list at the top.'); }
      if (t.closest('form') || t.closest('button')) e.preventDefault();
    }, true);
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    d.addEventListener('paste', (e) => { if (!st.editing || !e.clipboardData) return; const k = kindOf(st.editing); e.preventDefault(); const txt = e.clipboardData.getData('text/plain'); d.execCommand('insertText', false, k === 'text' ? txt.replace(/\s*\n\s*/g, ' ') : txt); });
    d.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); return save(); }
      if (!st.editing) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { e.preventDefault(); const dd = describe(st.sel); return removeThing(dd, dd.isItem ? dd.item : dd.path); }
        if (e.key === 'Escape') clearSel();
        return;
      }
      if (e.key === 'Escape') { const el = st.editing; st.editing = null; el.removeAttribute('contenteditable'); el.classList.remove('ee-editing'); render(el, el.__before); hideRT(); dropIfUnchanged(); }
      if (e.key === 'Enter' && kindOf(st.editing) === 'text') { e.preventDefault(); finishEdit(); }
    });
    const follow = () => { if (st.editing && !$('#rt').hidden) showRT(st.editing); if (st.sel && !$('#et').hidden) positionET(st.sel); };
    d.addEventListener('scroll', follow); fr.contentWindow.addEventListener('resize', follow);
  }
  async function openPage(name) {
    finishEdit(); closePanel(); clearSel();
    status('Loading…');
    const path = 'pages/' + name + '.md';
    try { st.page = await readFile(path, 'page'); } catch (e) { status(''); return toast(e.message); }
    st.page.name = name; st.undo = [];
    const fr = $('#frame'); $('#placeholder').hidden = true; fr.hidden = false;
    fr.onload = () => { try { wireFrame(); updateBar(); } catch (e) { console.error(e); toast('This page could not be prepared for editing.'); } };
    fr.src = '/' + name + '.html?ee=' + Date.now();
    $('#page-select').value = name;
    try { localStorage.setItem('ember-editor-page', name); } catch (e) {}
  }
  async function switchPage(name) {
    if (hasChanges()) {
      const c = await choose('Save your changes first?', 'You have changes on this page that are not saved yet.', [['Stay here', 'stay'], ['Save and continue', 'save', 'primary']]);
      if (c !== 'save') { $('#page-select').value = st.page.name; return; }
      const ok = await save(); if (!ok) { $('#page-select').value = st.page.name; return; }
    }
    openPage(name);
  }

  /* ---------- earlier versions ---------- */
  function when(iso) { return new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  async function versions(path, kind, title) {
    finishEdit();
    let list; try { list = (await call('history', { path })).versions; } catch (e) { return toast(e.message); }
    openPanel('Earlier versions', (b) => {
      b.append(note(kind === 'page' ? 'Every time you save, a copy is kept. Choose one to put ' + title + ' back the way it was then. It publishes straight away.' : 'Every time you save, a copy is kept. Choose one to bring it back. Then press Save.'));
      const l = document.createElement('div'); l.className = 'list';
      list.forEach((v, i) => l.append(button((i === 0 ? 'Now  ·  ' : '') + when(v.date), '', () => restore(path, kind, v, i === 0))));
      if (!list.length) l.append(note('No earlier versions yet.'));
      b.append(l);
    });
  }
  async function restore(path, kind, v, isNow) {
    if (isNow) return toast('That is the version on your site now.');
    let content; try { content = (await call('read', { path, ref: v.sha })).content; } catch (e) { return toast(e.message); }
    if (kind === 'page') {
      if (!(await confirmBox('Put this page back to ' + when(v.date) + '?', 'It replaces the page on your site straight away. Any unsaved changes on this page are lost.', 'Yes, put it back'))) return;
      closePanel();
      const before = await (await fetch('/' + st.page.name + '.html?ee=' + Date.now(), { cache: 'no-store' })).text();
      try { await call('save', { files: [{ path, content }], message: 'Restore earlier version: ' + (PAGE_NAMES[st.page.name] || st.page.name) }); } catch (e) { return toast('Not restored: ' + e.message, 7000); }
      const name = st.page.name; delete st.files[path]; delete st.orig[path]; st.undo = []; recomputeDirty();
      $('#frame').hidden = true; const ph = $('#placeholder'); ph.hidden = false; ph.innerHTML = '<div><p><b>Putting your page back…</b></p><p>This takes about a minute. It opens here automatically.</p></div>';
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 6000)); const now = await (await fetch('/' + name + '.html?ee=' + Date.now(), { cache: 'no-store' })).text(); if (now !== before) return openPage(name); }
      return openPage(name);
    }
    checkpoint();
    const f = parseFile('yaml', content); st.files[path].data = f.data; markDirty(path); refreshAll(); closePanel();
    toast('Brought back. Press Save to keep it.');
  }

  /* ---------- top bar tools ---------- */
  function pageSettings() {
    const d = st.page.data;
    openPanel('Page settings', (b) => {
      visible(st.schema.pages.fields).forEach((f) => b.append(field(f, d, () => markDirty(st.page.path))));
      b.append(note('This page’s web address is /' + st.page.name + '.html'));
      b.append(button('Earlier versions of this page', 'ee-btn', () => versions(st.page.path, 'page', 'this page')));
      if (st.page.name !== 'index') b.append(button('Delete this page', 'ee-btn danger', async () => {
        if (!(await confirmBox('Delete this page?', 'It comes off the website when you save. It also comes out of your menu.'))) return;
        st.files[st.page.path].delete = true; removeFromMenus(st.page.name + '.html'); markDirty(st.page.path); closePanel(); toast('This page will be deleted when you save.');
      }));
    });
  }
  function removeFromMenus(link) {
    const s = st.files[DATA.site].data; let hit = false;
    ['menu', 'mobile_menu'].forEach((k) => { if (Array.isArray(s[k])) { const n = s[k].filter((m) => m.link !== link); if (n.length !== s[k].length) { s[k] = n; hit = true; } } });
    if (s.footer && Array.isArray(s.footer.explore_links)) { const n = s.footer.explore_links.filter((m) => m.link !== link); if (n.length !== s.footer.explore_links.length) { s.footer.explore_links = n; hit = true; } }
    if (hit) markDirty(DATA.site);
  }
  function dataForm(key, title, intro) {
    const f = st.files[DATA[key]]; const sch = st.schema[key];
    openPanel(title, (b) => {
      if (intro) b.append(note(intro));
      visible(sch.fields).forEach((fd) => b.append(field(fd, f.data, () => { markDirty(DATA[key]); })));
      b.append(button('Earlier versions', 'ee-btn', () => versions(DATA[key], 'data', title)));
    });
  }
  function brandColours() {
    const s = st.files[DATA.site].data;
    openPanel('Brand colours', (b) => {
      b.append(note('These colours are used across your whole website. Changes show straight away on the page behind. Press Save to publish them.'));
      const box = s.colours && typeof s.colours === 'object' ? s.colours : {};
      st.schema.colours.fields.forEach((fd) => b.append(field(fd, box, () => { if (Object.keys(box).length) s.colours = box; else delete s.colours; markDirty(DATA.site); applyColours(); })));
      b.append(button('Put all colours back to the original', 'ee-btn', () => { delete s.colours; markDirty(DATA.site); applyColours(); brandColours(); }));
      b.append(button('Earlier versions', 'ee-btn', () => versions(DATA.site, 'data', 'Brand colours')));
    });
  }
  function newPageDialog() {
    return new Promise((res) => {
      const m = openModal(); m.innerHTML = `<h2>New page</h2><p>What should the page be called? For example, Workshops, or the name of a new course.</p><div class="f"><input type="text" aria-label="Page name"></div><div class="f"><label for="np-from">Start from</label><select id="np-from"><option value="">A simple page (header, text, closing panel)</option></select><p class="hint">To add a new course or offer, start from a copy of your Online course page. It keeps the same layout, price options and questions, ready for you to change.</p></div><label class="chk"><input type="checkbox" checked> Add it to my menu</label><div class="row"><button class="ee-btn" type="button" data-n>Cancel</button><button class="ee-btn primary" type="button" data-y>Create page</button></div>`;
      const sel = $('#np-from', m);
      st.pages.slice().sort((a, b) => (b === 'people-pleasing') - (a === 'people-pleasing')).forEach((n) => sel.add(new Option('A copy of: ' + (PAGE_NAMES[n] || n), n)));
      const i = $('input[type=text]', m); const c = $('input[type=checkbox]', m); setTimeout(() => i.focus(), 30);
      const ok = () => { if (!i.value.trim()) return i.focus(); closeModal(); res({ name: i.value.trim(), menu: c.checked, from: sel.value }); };
      i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      $('[data-n]', m).onclick = () => { closeModal(); res(null); }; $('[data-y]', m).onclick = ok;
    });
  }
  async function newPage() {
    finishEdit();
    if (hasChanges()) {
      const c = await choose('Save your changes first?', 'Save what you have done so far, then make the new page.', [['Cancel', 'stay'], ['Save and continue', 'save', 'primary']]);
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
      (data.sections || []).forEach((sec) => { delete sec.anchor_unique; });
      const hero = (data.sections || []).find((x) => x.type === 'page_hero' || x.type === 'home_hero');
      if (hero) hero.title = esc(name);
      st.files[path] = { kind: 'page', path, data, body: src.body || '' };
    } else {
      const lib = await readFile('pages/section-library.md', 'page');
      const hero = structuredClone(lib.data.sections.find((s) => s.type === 'page_hero')); delete hero.library_label;
      Object.assign(hero, { title: esc(name), subtitle: 'A short line about this page.', top_left: 'The Ember Room', top_right: 'Norwood\nIn person and online' }); delete hero.facts;
      const panel = { type: 'panel', tone: 'stone', heading: esc(name), text: '<p>Write about this here. Click any words on the page to change them.</p>' };
      const close = structuredClone(lib.data.sections.find((s) => s.type === 'panel' && s.tone === 'close')); delete close.library_label;
      st.files[path] = { kind: 'page', path, data: { title: esc(name) + ' | The Ember Room', description: '', signup: false, sections: [hero, panel, close] }, body: '' };
    }
    const files = [{ path, content: serialize(st.files[path]) }];
    if (ans.menu) {
      const s = st.files[DATA.site].data; const item = { label: esc(name), link: sl + '.html' };
      ['menu', 'mobile_menu'].forEach((k) => { if (Array.isArray(s[k])) { const at = s[k].findIndex((x) => /about/.test(x.link)); s[k].splice(at === -1 ? s[k].length : at, 0, { ...item }); } });
      files.push({ path: DATA.site, content: serialize(st.files[DATA.site]) });
    }
    status('Creating page…');
    try { await call('save', { files, message: 'New page: ' + unesc(name) }); }
    catch (e) { delete st.files[path]; status(''); return toast('Not created: ' + e.message, 7000); }
    files.forEach((x) => (st.orig[x.path] = x.content)); delete st.files[path]; delete st.orig[path];
    st.pages.push(sl); PAGE_NAMES[sl] = unesc(name); fillPageSelect(sl); recomputeDirty();
    $('#frame').hidden = true; const ph = $('#placeholder'); ph.hidden = false;
    waitForPage(sl);
  }
  async function journal() {
    finishEdit();
    let posts = [];
    try { posts = (await call('list', { dir: '_posts' })).files.filter((f) => f.name.endsWith('.md')).reverse(); } catch (e) { return toast(e.message); }
    openPanel('Journal', (b) => {
      b.append(button('+ Write a new post', 'ee-btn primary', newPost));
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
      b.append(note('Posts appear on your Journal page about a minute after you save.'));
      b.append(button('Delete this post', 'ee-btn danger', async () => { if (!(await confirmBox('Delete this post?', 'It comes off your Journal when you save.'))) return; f.delete = true; markDirty(path); closePanel(); }));
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
      <p><b>Words:</b> click any words and type. Click outside to finish. To make words bold, a link or a colour, select them and use the small dark toolbar.</p>
      <p><b>Anything else:</b> click it. A small bar appears with what you can do: delete it, move it, copy it, change its link, or select the bigger group it sits in (like a whole card) to delete that.</p>
      <p><b>Photos:</b> click a photo to change it. For a photo behind words, click the background, or use “Background photo” on the section’s bar.</p>
      <p><b>Sections:</b> hover over a section for its bar: move, copy, delete, colours and settings, or add a new section below.</p>
      <p><b>Colours:</b> “Colours” at the top changes your whole site. A section’s “Settings &amp; colours” changes just that section.</p>
      <p><b>Undo:</b> the Undo button (or Cmd/Ctrl + Z) steps back. After saving, “Earlier versions” in Page settings can put a page back.</p>
      <p><b>Save:</b> nothing changes on your live site until you press Save. It updates about a minute later.</p>
      <div class="row"><button class="ee-btn" type="button" data-pw>Change my password</button><button class="ee-btn primary" type="button" data-x>Got it</button></div>`;
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
    $('#btn-save').disabled = true; status('Saving…');
    try {
      await call('save', { files, message: 'Website edit: ' + (st.page ? (PAGE_NAMES[st.page.name] || st.page.name) : 'settings') });
      files.forEach((x) => { if (x.content != null) st.orig[x.path] = x.content; });
      st.uploads = {}; st.undo = [];
      for (const p in st.files) if (st.files[p].delete) { delete st.files[p]; delete st.orig[p]; st.pages = st.pages.filter((n) => 'pages/' + n + '.md' !== p); fillPageSelect(); }
      recomputeDirty(); status('Saved'); toast('Saved. Your website updates in about a minute.');
      if (st.page && !st.files[st.page.path]) openPage('index');
      return true;
    } catch (e) { updateBar(); status('Not saved'); toast('Not saved: ' + e.message, 7000); return false; }
  }
  async function waitForPage(sl) {
    const ph = $('#placeholder'); ph.innerHTML = '<div><p><b>Creating your page…</b></p><p>This takes about a minute. It opens here automatically, ready to edit.</p></div>';
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 6000)); const r = await fetch('/' + sl + '.html?ee=' + Date.now(), { cache: 'no-store' }); if (r.ok) return openPage(sl); }
    ph.innerHTML = '<div><p>Your page is taking longer than usual. Choose it from the page list in a few minutes.</p></div>';
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
  function fillPageSelect(selected) {
    const s = $('#page-select'); const cur = selected || s.value; s.innerHTML = '';
    const names = st.pages.slice().sort((a, b) => (a === 'index' ? -1 : b === 'index' ? 1 : (PAGE_NAMES[a] || a).localeCompare(PAGE_NAMES[b] || b)));
    names.forEach((n) => s.add(new Option(PAGE_NAMES[n] || n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), n)));
    if (cur && names.includes(cur)) s.value = cur;
  }
  async function start(skipCheck) {
    if (!skipCheck) {
      try { const s = await call('status'); if (s.must_change) return showSetPw('first'); } catch (e) { if (!token) return; return toast(e.message, 8000); }
    }
    $('#login').hidden = true; $('#app').hidden = false; status('Loading…');
    try {
      st.schema = await (await fetch('/assets/editor/schema.json?ee=' + Date.now())).json();
      await Promise.all([readFile(DATA.site, 'yaml'), readFile(DATA.practice, 'yaml'), readFile(DATA.faq, 'yaml')]);
      st.pages = (await call('list', { dir: 'pages' })).files.map((f) => f.name.replace(/\.md$/, '')).filter((n) => !HIDDEN_PAGES.includes(n));
    } catch (e) { status(''); return toast(e.message, 8000); }
    let last = 'index'; try { last = localStorage.getItem('ember-editor-page') || 'index'; } catch (e) {}
    if (!st.pages.includes(last)) last = 'index';
    fillPageSelect(last); openPage(last);
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
  $('#page-select').onchange = (e) => switchPage(e.target.value);
  $('#btn-page').onclick = pageSettings;
  $('#btn-new').onclick = newPage;
  $('#btn-add').onclick = addSectionFromBar;
  $('#btn-colours').onclick = brandColours;
  $('#btn-fees').onclick = () => dataForm('practice', 'Fees & contact', 'Change a price or your days here once, and it updates on every page.');
  $('#btn-menu').onclick = () => dataForm('site', 'Menu & footer', 'The menu, footer and free sign-up band appear on every page. You can also click them right on the page.');
  $('#btn-faq').onclick = () => dataForm('faq', 'FAQ questions', 'These are the numbered questions on your Fees & FAQ page.');
  $('#btn-journal').onclick = journal;
  $('#btn-help').onclick = help;
  $('#btn-save').onclick = save;
  $('#btn-undo').onclick = undo;
  document.addEventListener('mousedown', (e) => { if (!$('#palette').hidden && !e.target.closest('#palette') && !e.target.closest('.chip') && !e.target.closest('#rt')) hidePalette(); });
  window.addEventListener('beforeunload', (e) => { if (hasChanges()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    const typing = e.target.closest && e.target.closest('input,textarea,[contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing && !$('#app').hidden) { e.preventDefault(); undo(); }
  });
  if (DEBUG) window.__ee = st;
  if (token) start(); else $('#login').hidden = false;
})();
