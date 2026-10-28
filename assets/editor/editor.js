/* The Ember Room website editor.
   Shows the real page in a frame. Click text to type, click photos to swap them,
   use the bar on each section to move, copy, delete, add or adjust it. Save publishes. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const API = qs.get('api') || window.EDITOR_API;
  const TOKEN_KEY = 'ember-editor-token';
  const PAGE_NAMES = { index: 'Home', 'somatic-therapy-norwood': 'Individual therapy', 'couples-therapy-adelaide': 'Couples therapy', 'guided-rest': 'Guided Rest', 'people-pleasing': 'Online course', 'fees-faq': 'Fees & FAQ', book: 'Book', about: 'About', privacy: 'Privacy' };
  const HIDDEN_PAGES = ['section-library'];
  const DATA = { site: '_data/site.yml', practice: '_data/practice.yml', faq: '_data/faq.yml' };
  let token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}

  const st = { files: {}, dirty: new Set(), uploads: {}, page: null, schema: null, pages: [], doc: null, editing: null, newPage: null };

  /* ---------- server ---------- */
  async function call(action, data = {}) {
    if (!API) throw new Error('The editor is not connected yet.');
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data }) });
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
  async function readFile(path, kind) {
    if (st.files[path]) return st.files[path];
    const r = await call('read', { path });
    const f = kind === 'yaml' ? { kind, data: jsyaml.load(r.content) || {} } : { kind, ...parseFront(r.content) };
    f.path = path; st.files[path] = f; return f;
  }
  function markDirty(path) {
    st.dirty.add(path);
    $('#btn-save').disabled = false;
    status('Unsaved changes');
  }

  /* ---------- helpers ---------- */
  function getAt(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[/^\d+$/.test(k) ? +k : k]), o); }
  function setAt(o, path, v) {
    const ks = path.split('.'); let a = o;
    ks.slice(0, -1).forEach((k, i) => { const key = /^\d+$/.test(k) ? +k : k; if (a[key] == null) a[key] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[key]; });
    const last = ks[ks.length - 1]; a[/^\d+$/.test(last) ? +last : last] = v;
  }
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

  /* clean up what the browser produces while typing */
  const BLOCK_OK = new Set(['P', 'H3', 'UL', 'OL', 'LI', 'BR', 'B', 'STRONG', 'EM', 'I', 'A']);
  function clean(html, inline) {
    const d = document.createElement('div'); d.innerHTML = html;
    (function walk(n) {
      [...n.childNodes].forEach((c) => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        walk(c);
        if (c.tagName === 'DIV') { const p = document.createElement(inline ? 'span' : 'p'); p.append(...c.childNodes); c.replaceWith(p); if (inline) p.replaceWith(...p.childNodes); return; }
        if (!BLOCK_OK.has(c.tagName) || (inline && ['P', 'H3', 'UL', 'OL', 'LI'].includes(c.tagName))) { if (inline && c.tagName === 'P' && c.nextSibling) c.after(document.createElement('br')); c.replaceWith(...c.childNodes); return; }
        [...c.attributes].forEach((a) => { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
      });
    })(d);
    let out = d.innerHTML.replace(/<p><\/p>/g, '').replace(/(<br>)+$/, '').trim();
    if (!inline && out && !/^<(p|h3|ul|ol)/.test(out)) out = '<p>' + out + '</p>';
    return out;
  }

  /* ---------- reading values for an element ---------- */
  function target(el) {
    const key = el.dataset.e;
    if (key.startsWith('@')) { const [file, path] = key.slice(1).split(':'); return { file: DATA[file], obj: st.files[DATA[file]].data, path }; }
    const sec = el.closest('[data-s]');
    return { file: st.page.path, obj: sec.__sec, path: key };
  }
  function kindOf(el) { return el.dataset.et || 'text'; }
  function render(el, v) {
    const k = kindOf(el);
    if (k === 'text') el.innerHTML = fill(v);
    else if (k === 'lines') el.innerHTML = fill(v).trim().replace(/\n/g, '<br>');
    else if (k === 'inline') el.innerHTML = fill(v).replace(/<\/?p>/g, '').trim();
    else { el.innerHTML = fill(v); if (el.closest('.panel') && /\.body$/.test(el.dataset.e)) $$('p', el).forEach((p) => p.classList.add('body')); }
  }

  /* ---------- inline editing ---------- */
  function startEdit(el) {
    if (st.editing === el) return;
    finishEdit();
    const t = target(el); const v = getAt(t.obj, t.path) ?? '';
    const k = kindOf(el);
    st.editing = el; el.__before = v;
    if (k === 'text' || k === 'lines') { el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.innerText = unesc(v); }
    else { el.contentEditable = 'true'; el.innerHTML = v; if (k === 'rich' && el.closest('.panel') && /\.body$/.test(el.dataset.e)) $$('p', el).forEach((p) => p.classList.add('body')); st.doc.execCommand('defaultParagraphSeparator', false, 'p'); }
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
    return c.textContent.replace(/\u00a0/g, ' ');
  }
  function finishEdit() {
    const el = st.editing; if (!el) return;
    st.editing = null; hideRT();
    const k = kindOf(el); const t = target(el);
    let v;
    if (k === 'text') v = esc(plain(el).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim());
    else if (k === 'lines') v = esc(plain(el).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim());
    else v = clean(el.innerHTML, k === 'inline');
    el.contentEditable = 'false'; el.removeAttribute('contenteditable'); el.classList.remove('ee-editing');
    if (v !== (el.__before ?? '')) { setAt(t.obj, t.path, v); markDirty(t.file); if (t.file !== st.page.path && t.file === DATA.practice) refreshAll(); }
    render(el, getAt(t.obj, t.path));
  }
  function refreshAll() { if (!st.doc) return; $$('[data-e]', st.doc).forEach((el) => { if (el === st.editing) return; try { const t = target(el); const v = getAt(t.obj, t.path); if (v != null) render(el, v); } catch (e) {} }); }

  /* rich text toolbar */
  function showRT(el) {
    const bar = $('#rt'); bar.hidden = false;
    const fr = $('#frame').getBoundingClientRect(); const r = el.getBoundingClientRect();
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
      const url = await ask('Add a link', 'Paste the web address, or a page like fees-faq.html', 'https://');
      if (!url) return;
      st.editing.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
      st.doc.execCommand('createLink', false, url);
    } else st.doc.execCommand(cmd, false, null);
  });

  /* ---------- buttons ---------- */
  function editButton(a) {
    finishEdit();
    const sec = a.closest('[data-s]'); const path = a.dataset.eb; const b = getAt(sec.__sec, path) || {};
    openPanel('Button', (body) => {
      body.append(note('Change what the button says and where it goes.'));
      body.append(field({ name: 'label', label: 'Button text', type: 'string' }, b, () => { a.textContent = unesc(fill(b.label)); dirtyPage(); }));
      body.append(field({ name: 'link', label: 'Link', type: 'string', description: 'A page (e.g. fees-faq.html), a section (#faq) or a full web address.' }, b, dirtyPage));
      body.append(field({ name: 'ghost', label: 'Outline style', type: 'boolean' }, b, () => { a.classList.toggle('ghost', !!b.ghost); dirtyPage(); }));
      body.append(field({ name: 'new_tab', label: 'Open in a new tab', type: 'boolean' }, b, dirtyPage));
      const del = button('Remove this button', 'ee-btn danger', () => { const arr = getAt(sec.__sec, path.replace(/\.\d+$/, '')); arr.splice(+path.split('.').pop(), 1); a.remove(); dirtyPage(); closePanel(); });
      body.append(del);
    });
  }
  function dirtyPage() { markDirty(st.page.path); }

  /* ---------- photos ---------- */
  async function chooseImage() {
    return new Promise((res) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return res(null);
        status('Preparing photo…');
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.86);
        const name = slug(file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36) + '.jpg';
        const path = 'assets/img/uploads/' + name;
        st.uploads[path] = url.split(',')[1];
        $('#btn-save').disabled = false; status('Unsaved changes');
        res({ src: '/' + path, preview: url, width: c.width, height: c.height });
      };
      inp.click();
    });
  }
  async function editImage(img) {
    finishEdit();
    const sec = img.closest('[data-s]'); const path = img.dataset.ei;
    const pic = await chooseImage(); if (!pic) return;
    setAt(sec.__sec, path, pic.src); img.src = pic.preview; img.removeAttribute('srcset');
    if (path === 'photo' && sec.__sec.photo_width) { sec.__sec.photo_width = String(pic.width); sec.__sec.photo_height = String(pic.height); }
    dirtyPage();
    const altKey = path + '_alt';
    const alt = await ask('Describe the photo', 'A short description helps people using screen readers, and Google.', unesc(getAt(sec.__sec, altKey) || ''));
    if (alt != null) { setAt(sec.__sec, altKey, esc(alt)); img.alt = alt; }
  }

  /* ---------- sections ---------- */
  const TOOLS_CSS = `
    [data-e]{cursor:text;transition:outline-color .15s}
    [data-e]:hover{outline:2px dashed rgba(212,150,125,.9);outline-offset:3px}
    .ee-editing{outline:2px solid #D4967D!important;outline-offset:3px;background:rgba(255,255,255,.06)}
    [data-ei],[data-eb]{cursor:pointer}
    [data-ei]:hover,[data-eb]:hover{outline:2px dashed #D4967D;outline-offset:3px}
    main>[data-s]{position:relative}
    main>[data-s]:hover{box-shadow:inset 0 0 0 2px rgba(212,150,125,.7)}
    .ee-bar{position:absolute;top:10px;right:10px;z-index:60;display:none;gap:4px;background:#3A1621;border-radius:10px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.3);font:500 12px/1 "Instrument Sans",system-ui,sans-serif}
    main>[data-s]:hover>.ee-bar,.ee-bar:focus-within{display:flex}
    .ee-bar button{all:unset;color:#fff;padding:7px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}
    .ee-bar button:hover{background:rgba(255,255,255,.16)}
    .ee-bar .ee-name{color:#D4967D;padding:7px 9px}
    .ee-bar button[data-act=add]{background:#D4967D;color:#3A1621;font-weight:600}
    .ee-bar button[data-act=add]:hover{background:#e0a993}
    .ee-flag{position:absolute;left:10px;top:10px;z-index:60;background:#FBEFD9;color:#5a3b06;font:500 12px/1.3 "Instrument Sans",system-ui,sans-serif;padding:7px 10px;border-radius:8px;max-width:260px}
    .bookbar{display:none!important}`;
  function blockLabel(type) { return (st.schema.blocks[type] || {}).label || type; }
  function decorate(node) {
    $$(':scope > .ee-bar', node).forEach((n) => n.remove());
    const bar = st.doc.createElement('div'); bar.className = 'ee-bar';
    const name = st.doc.createElement('span'); name.className = 'ee-name'; name.textContent = blockLabel(node.__sec.type);
    bar.append(name);
    [['↑', 'up', 'Move up'], ['↓', 'down', 'Move down'], ['Settings', 'settings', 'Settings'], ['Copy', 'copy', 'Copy this section'], ['Delete', 'delete', 'Delete this section'], ['+ Add section below', 'add', 'Add a new section below this one']].forEach(([t, a, title]) => {
      const b = st.doc.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.dataset.act = a; bar.append(b);
    });
    node.prepend(bar);
  }
  function sectionNodes() { return $$('main > [data-s]', st.doc); }
  function syncSections() {
    const nodes = sectionNodes();
    nodes.forEach((n, i) => (n.dataset.s = i));
    st.page.data.sections = nodes.map((n) => n.__sec);
  }
  async function sectionAction(node, act) {
    finishEdit();
    const nodes = sectionNodes(); const i = nodes.indexOf(node);
    if (act === 'up' && i > 0) nodes[i - 1].before(node);
    else if (act === 'down' && i < nodes.length - 1) nodes[i + 1].after(node);
    else if (act === 'copy') { const c = node.cloneNode(true); c.__sec = structuredClone(node.__sec); node.after(c); decorate(c); flag(c, 'Copy. Edit it like any other section.'); }
    else if (act === 'delete') { if (!(await confirmBox('Delete this section?', 'It disappears from the page when you save. You can always add a section back.'))) return; node.remove(); }
    else if (act === 'settings') return sectionSettings(node);
    else if (act === 'add') return openLibrary(node);
    else return;
    syncSections(); dirtyPage();
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function flag(node, text) { let f = $(':scope > .ee-flag', node); if (!f) { f = st.doc.createElement('div'); f.className = 'ee-flag'; node.append(f); } f.textContent = text; }

  /* section library */
  function openLibrary(afterNode) {
    const m = openModal(true);
    m.innerHTML = '<div class="lib-head"><div><h2>Add a section</h2><p>Scroll through the designs and choose one. You can change all the words and photos after.</p></div><button class="ee-btn" type="button" data-x>Cancel</button></div>';
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
          const sec = structuredClone(data); delete sec.library_label;
          const node = st.doc.importNode(n, true); $$('.ee-pick,.ee-lab', node).forEach((x) => x.remove());
          node.__sec = sec; afterNode.after(node); decorate(node); syncSections(); dirtyPage(); closeModal();
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
    const set = (nv) => { obj[def.name] = nv; changed && changed(nv); };
    let input;
    if (def.list && def.type !== 'object') return listField(def, obj, changed);
    switch (def.type) {
      case 'boolean': { const l = document.createElement('label'); l.className = 'chk'; input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = !!v; input.onchange = () => set(input.checked); l.append(input, document.createTextNode(def.label)); w.append(l); if (hint) w.append(hint); return w; }
      case 'select': { input = document.createElement('select'); input.add(new Option('—', '')); ((def.options || {}).values || []).forEach((o) => input.add(new Option(o.label, o.name))); input.value = v || ''; input.onchange = () => set(input.value || undefined); break; }
      case 'number': { input = document.createElement('input'); input.type = 'number'; input.min = 0; input.value = v ?? ''; input.oninput = () => set(input.value === '' ? undefined : Number(input.value)); break; }
      case 'date': { input = document.createElement('input'); input.type = 'date'; input.value = v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : ''; input.oninput = () => set(input.value); break; }
      case 'text': { input = document.createElement('textarea'); input.value = unesc(v ?? ''); input.oninput = () => set(input.value === '' ? undefined : esc(input.value)); break; }
      case 'rich-text': { input = document.createElement('div'); input.className = 'rich'; input.contentEditable = 'true'; input.innerHTML = v || ''; input.oninput = () => set(clean(input.innerHTML, false) || undefined); input.onkeydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); } }; break; }
      case 'image': { const t = document.createElement('div'); t.className = 'thumb'; const im = document.createElement('img'); im.alt = ''; if (v) im.src = v; const b = button(v ? 'Change photo' : 'Choose photo', 'ee-btn', async () => { const pic = await chooseImage(); if (!pic) return; im.src = pic.preview; set(pic.src); b.textContent = 'Change photo'; }); t.append(im, b); w.append(lab, t); if (hint) w.append(hint); return w; }
      case 'object': return def.list ? objectList(def, obj, changed) : objectGroup(def, obj, changed);
      default: { input = document.createElement('input'); input.type = 'text'; input.value = unesc(v ?? ''); input.oninput = () => set(input.value === '' ? undefined : esc(input.value)); }
    }
    input.id = id; w.append(lab, input); if (hint) w.append(hint); return w;
  }
  function visible(fields) { return (fields || []).filter((f) => !f.hidden); }
  function objectGroup(def, obj, changed) {
    const d = document.createElement('details'); d.className = 'group';
    const s = document.createElement('summary'); s.textContent = def.label; d.append(s);
    const sub = obj[def.name] && typeof obj[def.name] === 'object' ? obj[def.name] : {};
    visible(def.fields).forEach((f) => d.append(field(f, sub, () => { obj[def.name] = sub; changed && changed(); })));
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
      body.append(note('Words and photos can also be changed right on the page. Changes to colours, lists and backgrounds show after you save.'));
      visible(def ? def.fields : []).forEach((f) => body.append(field(f, sec, () => { dirtyPage(); flag(node, 'Updated. Some changes show after you save.'); refreshSection(node); })));
    });
  }
  function refreshSection(node) { $$('[data-e]', node).forEach((el) => { if (el.dataset.e.startsWith('@') || el === st.editing) return; const v = getAt(node.__sec, el.dataset.e); if (v != null) render(el, v); }); }

  /* panel and modals */
  function openPanel(title, build) {
    finishEdit(); $('#panel-title').textContent = title; const b = $('#panel-body'); b.innerHTML = ''; build(b); $('#panel').hidden = false;
  }
  function closePanel() { $('#panel').hidden = true; refreshAll(); }
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
      const bar = t.closest('.ee-bar button'); if (bar) { e.preventDefault(); e.stopPropagation(); return sectionAction(t.closest('[data-s]'), bar.dataset.act); }
      if (st.editing && st.editing.contains(t)) { if (t.closest('a')) e.preventDefault(); return; }
      const eb = t.closest('[data-eb]'); if (eb) { e.preventDefault(); e.stopPropagation(); return editButton(eb); }
      const ei = t.closest('[data-ei]'); if (ei) { e.preventDefault(); e.stopPropagation(); return editImage(ei); }
      const el = t.closest('[data-e]'); if (el && (!el.dataset.e.startsWith('@') || st.files[DATA[el.dataset.e.slice(1).split(':')[0]]])) { e.preventDefault(); e.stopPropagation(); return startEdit(el); }
      finishEdit();
      const a = t.closest('a'); if (a) { e.preventDefault(); const href = a.getAttribute('href') || ''; const m = href.match(/^([a-z0-9-]+)\.html/); if (m && st.pages.includes(m[1])) toast('To edit that page, choose it from the page list at the top.'); }
      if (t.closest('form')) e.preventDefault();
    }, true);
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    d.addEventListener('paste', (e) => { if (!st.editing) return; const k = kindOf(st.editing); if (k === 'text' || k === 'lines' || !e.clipboardData) { e.preventDefault(); const txt = e.clipboardData.getData('text/plain'); d.execCommand('insertText', false, k === 'text' ? txt.replace(/\s*\n\s*/g, ' ') : txt); } else { e.preventDefault(); d.execCommand('insertText', false, e.clipboardData.getData('text/plain')); } });
    d.addEventListener('keydown', (e) => {
      if (!st.editing) return;
      if (e.key === 'Escape') { const el = st.editing; el.innerHTML = ''; st.editing = null; el.removeAttribute('contenteditable'); el.classList.remove('ee-editing'); render(el, el.__before); hideRT(); }
      if (e.key === 'Enter' && kindOf(st.editing) === 'text') { e.preventDefault(); finishEdit(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
    d.addEventListener('scroll', () => { if (st.editing && !$('#rt').hidden) showRT(st.editing); });
  }
  async function openPage(name) {
    finishEdit(); closePanel();
    status('Loading…');
    const path = 'pages/' + name + '.md';
    try { st.page = await readFile(path, 'page'); } catch (e) { status(''); return toast(e.message); }
    st.page.name = name;
    const fr = $('#frame'); $('#placeholder').hidden = true; fr.hidden = false;
    fr.onload = () => { try { wireFrame(); status(st.dirty.size ? 'Unsaved changes' : ''); } catch (e) { console.error(e); toast('This page could not be prepared for editing.'); } };
    fr.src = '/' + name + '.html?ee=' + Date.now();
    try { localStorage.setItem('ember-editor-page', name); } catch (e) {}
  }

  /* ---------- top bar tools ---------- */
  function pageSettings() {
    const d = st.page.data;
    openPanel('Page settings', (b) => {
      visible(st.schema.pages.fields).forEach((f) => b.append(field(f, d, dirtyPage)));
      b.append(note('This page’s web address is /' + st.page.name + '.html'));
      if (st.page.name !== 'index') b.append(button('Delete this page', 'ee-btn danger', async () => {
        if (!(await confirmBox('Delete this page?', 'It comes off the website when you save. Remember to take it out of the menu too.'))) return;
        st.files[st.page.path].delete = true; markDirty(st.page.path); closePanel(); toast('This page will be deleted when you save.');
      }));
    });
  }
  function dataForm(key, title, intro) {
    const f = st.files[DATA[key]]; const sch = st.schema[key];
    openPanel(title, (b) => { if (intro) b.append(note(intro)); visible(sch.fields).forEach((fd) => b.append(field(fd, f.data, () => { markDirty(DATA[key]); }))); });
  }
  async function newPage() {
    finishEdit();
    const name = await ask('New page', 'What should the page be called? For example, Workshops.');
    if (!name) return;
    const sl = slug(name);
    if (st.pages.includes(sl)) return toast('There is already a page with that name.');
    const path = 'pages/' + sl + '.md';
    const lib = await readFile('pages/section-library.md', 'page');
    const hero = structuredClone(lib.data.sections.find((s) => s.type === 'page_hero')); delete hero.library_label;
    Object.assign(hero, { title: esc(name), subtitle: 'A short line about this page.', top_left: 'The Ember Room', top_right: 'Norwood\nIn person and online' }); delete hero.facts;
    const panel = { type: 'panel', tone: 'stone', heading: esc(name), text: '<p>Write about this here. Click any words on the page to change them.</p>' };
    const close = structuredClone(lib.data.sections.find((s) => s.type === 'panel' && s.tone === 'close')); delete close.library_label;
    st.files[path] = { kind: 'page', path, data: { title: esc(name) + ' | The Ember Room', description: '', signup: false, sections: [hero, panel, close] }, body: '' };
    st.pages.push(sl); fillPageSelect(sl); markDirty(path);
    st.page = st.files[path]; st.page.name = sl;
    $('#frame').hidden = true; const ph = $('#placeholder'); ph.hidden = false;
    ph.innerHTML = '<div><p><b>Your new page is ready to create.</b></p><p>Press Save. It takes about a minute to appear, then you can edit it here like any other page.</p><p>Tip: add it to your menu in “Menu &amp; footer”.</p></div>';
    st.newPage = sl;
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
      <p><b>Words:</b> click any words on the page and type. Click outside to finish. Bold and links: select words and use the small dark toolbar.</p>
      <p><b>Photos and buttons:</b> click them to change.</p>
      <p><b>Sections:</b> hover over a section to see its bar: move it up or down, copy it, delete it, open its settings, or add a new section below.</p>
      <p><b>Prices and days:</b> change them once in “Fees &amp; contact”. In any text, codes like [days] or $[individual-60] fill in for you.</p>
      <p><b>Save:</b> nothing changes on your live site until you press Save. It updates about a minute later.</p>
      <div class="row"><button class="ee-btn primary" type="button" data-x>Got it</button></div>`;
    $('[data-x]', m).onclick = closeModal;
  }

  /* ---------- save ---------- */
  async function save() {
    finishEdit();
    if (!st.dirty.size && !Object.keys(st.uploads).length) return;
    const files = [];
    for (const p of st.dirty) { const f = st.files[p]; if (!f) continue; files.push(f.delete ? { path: p, delete: true } : { path: p, content: serialize(f) }); }
    for (const p in st.uploads) files.push({ path: p, base64: st.uploads[p] });
    $('#btn-save').disabled = true; status('Saving…');
    try {
      await call('save', { files, message: 'Website edit: ' + (st.page ? (PAGE_NAMES[st.page.name] || st.page.name) : 'settings') });
      st.dirty.clear(); st.uploads = {};
      for (const p in st.files) if (st.files[p].delete) { delete st.files[p]; st.pages = st.pages.filter((n) => 'pages/' + n + '.md' !== p); fillPageSelect(); }
      status('Saved'); toast('Saved. Your website updates in about a minute.');
      if (st.newPage) { const sl = st.newPage; st.newPage = null; waitForPage(sl); }
    } catch (e) { $('#btn-save').disabled = false; status('Not saved'); toast('Not saved: ' + e.message, 7000); }
  }
  async function waitForPage(sl) {
    const ph = $('#placeholder'); ph.innerHTML = '<div><p><b>Creating your page…</b></p><p>This takes about a minute. It opens here automatically.</p></div>';
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 6000)); const r = await fetch('/' + sl + '.html?ee=' + Date.now(), { cache: 'no-store' }); if (r.ok) { delete st.files['pages/' + sl + '.md']; return openPage(sl); } }
    ph.innerHTML = '<div><p>Your page is taking longer than usual. Choose it from the page list in a few minutes.</p></div>';
  }

  /* ---------- start ---------- */
  function fillPageSelect(selected) {
    const s = $('#page-select'); const cur = selected || s.value; s.innerHTML = '';
    const names = st.pages.slice().sort((a, b) => (a === 'index' ? -1 : b === 'index' ? 1 : (PAGE_NAMES[a] || a).localeCompare(PAGE_NAMES[b] || b)));
    names.forEach((n) => s.add(new Option(PAGE_NAMES[n] || n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), n)));
    if (cur && names.includes(cur)) s.value = cur;
  }
  async function start() {
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
    token = null; $('#app').hidden = true; $('#login').hidden = false; if (msg) $('#login-msg').textContent = msg;
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#login-msg').textContent = '';
    try { const r = await call('login', { password: $('#pw').value }); token = r.token; try { localStorage.setItem(TOKEN_KEY, token); } catch (er) {} start(); }
    catch (er) { $('#login-msg').textContent = er.message; }
  });
  $('#page-select').onchange = (e) => openPage(e.target.value);
  $('#btn-page').onclick = pageSettings;
  $('#btn-new').onclick = newPage;
  $('#btn-fees').onclick = () => dataForm('practice', 'Fees & contact', 'Change a price or your days here once, and it updates on every page.');
  $('#btn-menu').onclick = () => dataForm('site', 'Menu & footer', 'The menu, footer and free sign-up band appear on every page.');
  $('#btn-faq').onclick = () => dataForm('faq', 'FAQ questions', 'These are the numbered questions on your Fees & FAQ page.');
  $('#btn-journal').onclick = journal;
  $('#btn-help').onclick = help;
  $('#btn-save').onclick = save;
  window.addEventListener('beforeunload', (e) => { if (st.dirty.size || Object.keys(st.uploads).length) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  if (token) start(); else $('#login').hidden = false;
})();
