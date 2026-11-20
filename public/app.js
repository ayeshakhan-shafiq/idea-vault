/* Idea Vault v2 front end — mobile-style screens on top of the REST API (/api). */
(function () {
  'use strict';

  // ---------- constants ----------
  const CATEGORIES = [
    { key: 'content', label: 'Content', prompt: 'Video or post idea', hint: 'YouTube, reels, podcast…' },
    { key: 'business', label: 'Business', prompt: 'Business idea', hint: 'Startups, side hustles…' },
    { key: 'writing', label: 'Writing', prompt: 'Blog or article', hint: 'Topics, outlines, hooks…' },
    { key: 'story', label: 'Story', prompt: 'Story plot', hint: 'Characters, scenes, twists…' },
    { key: 'product', label: 'Product', prompt: 'Product feature', hint: 'Apps, tools, designs…' },
    { key: 'personal', label: 'Personal', prompt: 'Life & habits', hint: 'Goals, routines, learning…' },
  ];
  const CAT_KEYS = CATEGORIES.map((c) => c.key);
  const NAME_KEY = 'idea-vault-name';

  const $ = (sel) => document.querySelector(sel);
  const state = {
    screen: null, history: [], ideas: [], all: [], titles: new Map(), current: null, dirty: false,
    cat: '', type: '', suggestIndex: 0, graph: null, captureCat: '',
  };

  // ---------- storage for the user's display name ----------
  const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return state.name || ''; } };
  const setName = (n) => { state.name = n; try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* private mode */ } };

  // ---------- API ----------
  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || `Request failed (${res.status})`); err.status = res.status; throw err; }
    return data;
  }

  // ---------- helpers ----------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return node;
  }
  function icon(id, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  }
  const catOf = (idea) => CATEGORIES.find((c) => idea.tags.includes(c.key)) || null;
  const catIcon = (idea) => { const c = catOf(idea); return c ? `i-${c.key}` : 'i-spark'; };
  function snippet(body) {
    return body.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[#*`>-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Tap to develop this idea';
  }
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Hey, good morning!' : h < 17 ? 'Hey, good afternoon!' : 'Hey, good evening!';
  }

  // ---------- motion helpers ----------
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Give each node a staggered "pop-in" entrance. */
  function stagger(nodes, start = 0) {
    nodes.forEach((n, i) => { n.classList.add('pop'); n.style.setProperty('--i', start + i); });
    return nodes;
  }
  /** Count a number up from 0 for a lively stats row. */
  function countUp(node, to) {
    if (reduceMotion() || to === 0) { node.textContent = to; return; }
    const t0 = performance.now();
    const dur = 700;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  /** Small confetti burst from an element (used when an idea is saved). */
  function confetti(from) {
    if (reduceMotion() || !from) return;
    const phone = document.querySelector('.phone');
    const a = from.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const colors = ['#DBD8E3', '#B49CFF', '#FFD34D', '#FF9FCB', '#6FE0BE', '#FFB45E'];
    for (let i = 0; i < 18; i++) {
      const c = el('span', { class: 'confetti' });
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 70;
      c.style.left = `${a.left - p.left + a.width / 2}px`;
      c.style.top = `${a.top - p.top + a.height / 2}px`;
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      c.style.setProperty('--dy', `${Math.sin(ang) * dist - 40}px`);
      c.style.setProperty('--rot', `${Math.random() * 540 - 270}deg`);
      phone.append(c);
      setTimeout(() => c.remove(), 1000);
    }
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : ms));

  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- navigation ----------
  const TAB_SCREENS = ['home', 'ideas', 'connect', 'profile'];
  async function go(name, { push = true, dir = 'fwd' } = {}) {
    if (state.screen === 'detail' && name !== 'detail' && !(await saveIfDirty())) return;
    // The capture screen is a one-off: going back from an idea opened there returns to the screen before it.
    if (push && state.screen && state.screen !== name && state.screen !== 'capture' && state.screen !== 'welcome') state.history.push(state.screen);
    if (TAB_SCREENS.includes(name)) state.history = [];
    state.screen = name;
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.remove('fwd', 'back');
      s.classList.toggle('active', s.id === `s-${name}`);
    });
    if (!TAB_SCREENS.includes(name) || dir === 'back') $(`#s-${name}`).classList.add(dir);
    const scr = $(`#s-${name}`);
    scr.scrollTop = 0;
    $('#tabbar').hidden = scr.dataset.tabbar === 'off';
    document.querySelectorAll('#tabbar [data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    if (name !== 'connect' && state.graph) state.graph.stop();
    if (name === 'home') renderHome();
    if (name === 'ideas') refreshIdeas();
    if (name === 'connect') showGraph();
    if (name === 'profile') renderProfile();
    if (name === 'capture') openCapture();
  }
  function back() { go(state.history.pop() || 'home', { push: false, dir: 'back' }); }

  // ---------- data ----------
  async function loadAll() {
    const [all, stats] = await Promise.all([api('/ideas'), api('/stats')]);
    state.all = all;
    state.stats = stats;
    state.titles = new Map(all.map((i) => [i.title.toLowerCase(), i]));
  }

  function statTiles(target) {
    const s = state.stats || { totalIdeas: 0, totalLinks: 0, orphanIdeas: 0 };
    const tiles = [[s.totalIdeas, 'Ideas'], [s.totalLinks, 'Connections'], [s.orphanIdeas, 'Unconnected']].map(([n, label]) => {
      const b = el('b', {}, 0);
      countUp(b, n);
      return el('div', { class: 'stat' }, b, el('span', {}, label));
    });
    target.replaceChildren(...stagger(tiles, 2));
  }

  function linkCount(idea) {
    const key = idea.title.toLowerCase();
    const out = (idea.body.match(/\[\[[^\]]+\]\]/g) || []).length;
    const inc = state.all.filter((o) => o.id !== idea.id && o.body.toLowerCase().includes(`[[${key}]]`)).length;
    return out + inc;
  }

  function ideaCard(idea) {
    const c = catOf(idea);
    const n = linkCount(idea);
    return el('li', { class: `idea-card ${c ? 'c-' + c.key : ''}`, onclick: () => openIdea(idea.id), tabindex: '0',
      onkeydown: (e) => { if (e.key === 'Enter') openIdea(idea.id); } },
      el('span', { class: 'ico' }, icon(catIcon(idea))),
      el('span', { class: 'txt' },
        el('b', {}, idea.pinned ? icon('i-pin') : null, el('i', { class: `dot ${idea.type}`, title: idea.type }), idea.title),
        el('small', {}, snippet(idea.body))),
      n ? el('span', { class: 'links', title: `${n} connections` }, icon('i-link'), n) : null);
  }

  // ---------- welcome ----------
  $('#welcome-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setName($('#welcome-name').value.trim() || 'Creator');
    go('home', { push: false });
  });

  // ---------- home ----------
  async function renderHome() {
    try { await loadAll(); } catch (err) { toast('Could not reach the server', true); return; }
    const name = getName() || 'Creator';
    $('#home-name').textContent = name;
    $('#home-greeting').textContent = greeting();
    $('#home-avatar').textContent = name[0].toUpperCase();
    statTiles($('#stats-row'));

    const grid = $('#cat-grid');
    grid.replaceChildren(...stagger(CATEGORIES.map((c) => {
      const count = state.all.filter((i) => i.tags.includes(c.key)).length;
      return el('button', { type: 'button', class: `cat-tile c-${c.key}`, onclick: () => { state.cat = c.key; go('ideas'); } },
        el('span', { class: 'ico' }, icon(`i-${c.key}`)), el('b', {}, c.label), el('small', {}, `${count} idea${count === 1 ? '' : 's'}`));
    }), 4));

    const recent = state.all.slice(0, 4);
    const list = $('#recent-list');
    list.replaceChildren(...(recent.length ? stagger(recent.map(ideaCard), 8)
      : [el('li', { class: 'empty-note' }, 'No ideas yet. Tap “New Idea” to capture your first one!')]));
  }
  $('#hero-new').addEventListener('click', () => go('capture'));
  $('#home-spark').addEventListener('click', spark);
  $('#home-random').addEventListener('click', surprise);
  $('#home-surprise').addEventListener('click', surprise);
  $('#see-all').addEventListener('click', () => { state.cat = ''; go('ideas'); });

  // ---------- capture (chat style) ----------
  function fillCatSelect(select, withNone) {
    select.replaceChildren(
      ...(withNone ? [el('option', { value: '' }, 'No category')] : [el('option', { value: '' }, 'Category')]),
      ...CATEGORIES.map((c) => el('option', { value: c.key }, c.label)));
  }

  function openCapture() {
    $('#thread').replaceChildren();
    $('#capture-intro').hidden = false;
    state.captureCat = '';
    $('#composer-cat').value = '';
    const grid = $('#prompt-grid');
    grid.replaceChildren(...stagger(CATEGORIES.slice(0, 4).map((c) => el('button', {
      type: 'button', class: 'prompt', 'data-cat': c.key,
      onclick: (e) => {
        state.captureCat = c.key;
        $('#composer-cat').value = c.key;
        grid.querySelectorAll('.prompt').forEach((p) => p.classList.toggle('on', p === e.currentTarget));
        $('#composer-input').placeholder = `Describe your ${c.prompt.toLowerCase()}…`;
        $('#composer-input').focus();
      },
    }, el('b', {}, c.prompt), el('small', {}, c.hint))), 2));
    $('#composer-input').placeholder = 'Type your idea…';
    setTimeout(() => $('#composer-input').focus(), 300);
  }

  function addMsg(who, ...content) {
    const m = el('div', { class: `msg ${who}` }, ...content);
    $('#thread').append(m);
    const body = $('#capture-body');
    body.scrollTop = body.scrollHeight;
    return m;
  }

  $('#composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#composer-input');
    const raw = input.value.trim();
    if (!raw) return;
    const cat = $('#composer-cat').value;
    // First line (cleaned) becomes the title; a longer text is kept as the body too.
    let title = raw.split('\n')[0].replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
    let body = '';
    if (title.length > 90) { body = raw; title = title.slice(0, 87).replace(/\s+\S*$/, '') + '…'; }
    $('#capture-intro').hidden = true;
    addMsg('me', raw);
    input.value = '';
    const typing = addMsg('bot typing', el('i'), el('i'), el('i'));
    try {
      const idea = await api('/ideas', { method: 'POST', body: { title, body, type: 'fleeting', tags: cat ? [cat] : [] } });
      const detail = await api(`/ideas/${idea.id}`);
      await wait(700);
      typing.remove();
      confetti($('#composer .send'));
      const reply = addMsg('bot', el('span', {}, '✓ Saved to your vault! ', cat ? `Filed under ${CATEGORIES.find((c) => c.key === cat).label}.` : ''));
      if (detail.suggestions.length) {
        reply.append(el('span', {}, 'These ideas look related — connect them?'));
        reply.append(el('div', { class: 'row' }, detail.suggestions.slice(0, 3).map((s) => {
          const b = el('button', { type: 'button', class: 'pill-btn', onclick: async () => {
            if (b.classList.contains('done')) return;
            await appendLink(idea.id, s.title);
            confetti(b);
            b.classList.add('done'); b.textContent = `✓ ${s.title}`;
          } }, `+ ${s.title}`);
          return b;
        })));
      } else if (!cat) {
        reply.append(el('span', {}, 'Tip: pick a category so I can suggest connections.'));
      }
      reply.append(el('div', { class: 'row' },
        el('button', { type: 'button', class: 'pill-btn', onclick: () => openIdea(idea.id) }, 'Open & develop →')));
    } catch (err) {
      await wait(500);
      typing.remove();
      addMsg('bot', err.status === 409 ? `You already have an idea called “${title}”. Try a different title.` : err.message);
    }
  });

  async function appendLink(id, title) {
    const idea = await api(`/ideas/${id}`);
    const body = `${idea.body.replace(/\s*$/, '')}\n\nRelated: [[${title}]]`.trimStart();
    await api(`/ideas/${id}`, { method: 'PUT', body: { body } });
    toast(`Connected to “${title}”`);
  }

  // ---------- ideas library ----------
  function renderChips() {
    const row = $('#cat-chips');
    const all = [{ key: '', label: 'All' }, ...CATEGORIES];
    row.replaceChildren(...all.map((c) => el('button', {
      type: 'button', class: `chip ${c.key ? 'c-' + c.key : ''} ${state.cat === c.key ? 'on' : ''}`,
      onclick: () => { state.cat = c.key; refreshIdeas(); },
    }, c.label)));
  }
  async function refreshIdeas() {
    renderChips();
    document.querySelectorAll('#type-seg button').forEach((b) => b.classList.toggle('on', b.dataset.type === state.type));
    const p = new URLSearchParams();
    const q = $('#search').value.trim();
    if (q) p.set('q', q);
    if (state.cat) p.set('tag', state.cat);
    if (state.type) p.set('type', state.type);
    try {
      await loadAll();
      state.ideas = await api(`/ideas?${p}`);
    } catch (err) { toast(err.message, true); return; }
    $('#ideas-count').textContent = state.ideas.length;
    $('#idea-list').replaceChildren(...(state.ideas.length ? stagger(state.ideas.map(ideaCard))
      : [el('li', { class: 'empty-note' }, state.all.length ? 'No ideas match. Try another search or category.' : 'Your vault is empty. Tap + to capture an idea.')]));
  }
  let searchT;
  $('#search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(refreshIdeas, 200); });
  document.querySelectorAll('#type-seg button').forEach((b) => b.addEventListener('click', () => { state.type = b.dataset.type; refreshIdeas(); }));

  // ---------- idea detail ----------
  async function openIdea(id) {
    if (state.screen === 'detail' && !(await saveIfDirty())) return;
    try {
      await loadAll();
      const idea = await api(`/ideas/${id}`);
      state.current = idea;
      fillForm(idea);
      renderConnections(idea);
      if (state.screen !== 'detail') go('detail');
      else $('#s-detail').scrollTop = 0;
    } catch (err) { toast(err.message, true); }
  }

  function setSeg(container, attr, value) {
    container.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }

  function fillForm(idea) {
    const c = catOf(idea);
    $('#f-title').value = idea.title;
    $('#f-cat').value = c ? c.key : '';
    setSeg($('#f-type'), 'type', idea.type);
    $('#f-tags').value = idea.tags.filter((t) => !CAT_KEYS.includes(t)).join(', ');
    $('#f-source').value = idea.source || '';
    $('#f-body').value = idea.body;
    $('#btn-pin').classList.toggle('on', !!idea.pinned);
    $('#dates').textContent = `Created ${fmtDate(idea.createdAt)} · Edited ${fmtDate(idea.updatedAt)}`;
    $('#save-status').textContent = '';
    state.dirty = false;
    setTab('write');
    requestAnimationFrame(() => autoGrow($('#f-title')));
  }

  function readForm() {
    const cat = $('#f-cat').value;
    const extra = $('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
    const typeBtn = $('#f-type button.on');
    return {
      title: $('#f-title').value.replace(/\n/g, ' '),
      type: typeBtn ? typeBtn.dataset.type : 'fleeting',
      tags: [...(cat ? [cat] : []), ...extra],
      source: $('#f-source').value,
      pinned: $('#btn-pin').classList.contains('on'),
      body: $('#f-body').value,
    };
  }

  async function save() {
    if (!state.current) return true;
    clearTimeout(markDirty.t);
    try {
      await api(`/ideas/${state.current.id}`, { method: 'PUT', body: readForm() });
      state.dirty = false;
      $('#save-status').textContent = 'Saved ✓';
      $('#save-status').classList.remove('saved'); void $('#save-status').offsetWidth; $('#save-status').classList.add('saved');
      await loadAll();
      const fresh = await api(`/ideas/${state.current.id}`);
      state.current = fresh;
      $('#dates').textContent = `Created ${fmtDate(fresh.createdAt)} · Edited ${fmtDate(fresh.updatedAt)}`;
      renderConnections(fresh);
      return true;
    } catch (err) {
      $('#save-status').textContent = 'Not saved';
      toast(err.message, true);
      return false;
    }
  }
  async function saveIfDirty() { return state.dirty ? save() : true; }
  function markDirty() {
    state.dirty = true;
    $('#save-status').textContent = 'Saving…';
    $('#save-status').classList.remove('saved');
    clearTimeout(markDirty.t);
    markDirty.t = setTimeout(() => { if (state.dirty) save(); }, 1200); // autosave
  }

  function connItem(main, sub, action) {
    return el('li', { class: 'conn-item' }, el('span', { class: 't' }, main, sub ? el('small', {}, sub) : null), action || null);
  }
  function renderConnections(idea) {
    const out = $('#outgoing');
    const back = $('#backlinks');
    const sug = $('#suggestions');
    out.replaceChildren(...(idea.outgoing.length ? stagger(idea.outgoing.map((l) => (l.exists
      ? connItem(el('a', { onclick: () => openIdea(l.id) }, l.title), 'Opens linked idea')
      : connItem(el('span', { class: 'missing' }, l.title), 'Not written yet',
        el('button', { type: 'button', class: 'pill-btn', onclick: () => createAndOpen(l.title) }, 'Create')))))
      : [el('li', { class: 'conn-none' }, 'No links yet. Type [[ in the text to link another idea.')]));
    back.replaceChildren(...(idea.backlinks.length ? idea.backlinks.map((l) => connItem(el('a', { onclick: () => openIdea(l.id) }, l.title), 'Links to this idea'))
      : [el('li', { class: 'conn-none' }, 'No other idea links here yet.')]));
    sug.replaceChildren(...(idea.suggestions.length ? stagger(idea.suggestions.map((s) => connItem(
      el('a', { onclick: () => openIdea(s.id) }, s.title), s.reason,
      el('button', { type: 'button', class: 'pill-btn', onclick: () => linkCurrentTo(s.title) }, '+ Connect'))))
      : [el('li', { class: 'conn-none' }, 'Pick a category or add tags to get suggestions.')]));
  }

  async function linkCurrentTo(title) {
    const body = $('#f-body');
    body.value = `${body.value.replace(/\s*$/, '')}\n\nRelated: [[${title}]]`.trimStart();
    state.dirty = true;
    if (await save()) { toast(`Connected to “${title}”`); confetti($('#suggestions')); }
  }

  async function createAndOpen(title, extra = {}) {
    try {
      const idea = await api('/ideas', { method: 'POST', body: { title, ...extra } });
      await openIdea(idea.id);
    } catch (err) { toast(err.message, true); }
  }

  // write / preview tabs
  function renderPreview() {
    $('#preview').innerHTML = window.IVMarkdown.render($('#f-body').value, (t) => state.titles.has(t.toLowerCase()));
  }
  function setTab(name) {
    setSeg($('#body-tabs'), 'tab', name);
    $('#f-body').hidden = name !== 'write';
    $('#preview').hidden = name !== 'preview';
    $('#link-suggest').hidden = true;
    if (name === 'preview') renderPreview();
  }
  document.querySelectorAll('#body-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#preview').addEventListener('click', (e) => {
    const a = e.target.closest('a.wikilink');
    if (!a) return;
    const target = state.titles.get(a.dataset.title.toLowerCase());
    if (target) openIdea(target.id); else createAndOpen(a.dataset.title);
  });

  // [[ autocomplete
  function linkQuery() {
    const ta = $('#f-body');
    const m = /\[\[([^\]\n]*)$/.exec(ta.value.slice(0, ta.selectionStart));
    return m ? m[1] : null;
  }
  function updateSuggest() {
    const box = $('#link-suggest');
    const q = linkQuery();
    if (q === null) { box.hidden = true; return; }
    const ql = q.toLowerCase();
    const matches = [...state.titles.values()]
      .filter((i) => (!state.current || i.id !== state.current.id) && i.title.toLowerCase().includes(ql))
      .slice(0, 5).map((i) => ({ title: i.title }));
    if (q.trim() && !state.titles.has(ql.trim())) matches.push({ title: q.trim(), isNew: true });
    if (!matches.length) { box.hidden = true; return; }
    state.suggestIndex = Math.min(state.suggestIndex, matches.length - 1);
    state.matches = matches;
    box.replaceChildren(...matches.map((m, i) => el('li', {
      class: i === state.suggestIndex ? 'sel' : '',
      onmousedown: (e) => { e.preventDefault(); insertLink(m.title); },
    }, m.isNew ? `New idea: “${m.title}”` : m.title)));
    box.hidden = false;
  }
  function insertLink(title) {
    const ta = $('#f-body');
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos).replace(/\[\[([^\]\n]*)$/, `[[${title}]]`);
    let after = ta.value.slice(pos);
    if (after.startsWith(']]')) after = after.slice(2);
    ta.value = before + after;
    ta.selectionStart = ta.selectionEnd = before.length;
    $('#link-suggest').hidden = true;
    markDirty();
  }
  $('#f-body').addEventListener('input', () => { markDirty(); state.suggestIndex = 0; updateSuggest(); });
  $('#f-body').addEventListener('click', updateSuggest);
  $('#f-body').addEventListener('blur', () => setTimeout(() => { $('#link-suggest').hidden = true; }, 120));
  $('#f-body').addEventListener('keydown', (e) => {
    const box = $('#link-suggest');
    if (box.hidden || !state.matches) return;
    const n = state.matches.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); state.suggestIndex = (state.suggestIndex + 1) % n; updateSuggest(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.suggestIndex = (state.suggestIndex - 1 + n) % n; updateSuggest(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertLink(state.matches[state.suggestIndex].title); }
    else if (e.key === 'Escape') box.hidden = true;
  });

  // other detail fields
  $('#f-title').addEventListener('input', (e) => { autoGrow(e.target); markDirty(); });
  $('#f-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  ['#f-tags', '#f-source'].forEach((s) => $(s).addEventListener('input', markDirty));
  $('#f-cat').addEventListener('change', markDirty);
  document.querySelectorAll('#f-type button').forEach((b) => b.addEventListener('click', () => { setSeg($('#f-type'), 'type', b.dataset.type); markDirty(); }));
  $('#btn-pin').addEventListener('click', () => { $('#btn-pin').classList.toggle('on'); markDirty(); toast($('#btn-pin').classList.contains('on') ? 'Pinned to top' : 'Unpinned'); });
  $('#idea-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });

  $('#btn-delete').addEventListener('click', () => {
    if (!state.current) return;
    openSheet(
      el('h3', { id: 'sheet-title' }, 'Delete this idea?'),
      el('p', {}, `“${state.current.title}” will be removed. Links to it will show as missing.`),
      el('div', { class: 'sheet-actions' },
        el('button', { type: 'button', class: 'btn-danger', onclick: async () => {
          try {
            await api(`/ideas/${state.current.id}`, { method: 'DELETE' });
            state.current = null; state.dirty = false;
            closeSheet(); toast('Idea deleted'); back();
          } catch (err) { toast(err.message, true); }
        } }, 'Delete'),
        el('button', { type: 'button', class: 'btn-plain', onclick: closeSheet }, 'Cancel')));
  });

  // ---------- sheet ----------
  function openSheet(...content) {
    $('#sheet-content').replaceChildren(...content);
    $('#sheet').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; }
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  // ---------- spark & surprise ----------
  async function spark() {
    let s;
    try { s = await api('/spark'); } catch (err) { toast(err.message, true); return; }
    const card = (idea) => el('div', { class: 'spark-card', role: 'button', tabindex: '0', onclick: () => { closeSheet(); openIdea(idea.id); } }, idea.title);
    openSheet(
      el('h3', { id: 'sheet-title' }, '✨ Idea Spark'),
      el('p', {}, 'What if you combined these two ideas? Great ideas are often two old ones connected.'),
      el('div', { class: 'spark-pair' }, card(s.a), el('span', { class: 'spark-plus' }, icon('i-plus')), card(s.b)),
      el('div', { class: 'sheet-actions' },
        el('button', { type: 'button', class: 'btn-gradient', onclick: async () => {
          const combo = `${s.a.title} × ${s.b.title}`.replace(/[\[\]]/g, '').slice(0, 200);
          closeSheet();
          await createAndOpen(combo, {
            type: 'fleeting',
            tags: [...new Set([...s.a.tags, ...s.b.tags])].slice(0, 20),
            body: `Sparked by combining [[${s.a.title}]] and [[${s.b.title}]].\n\nWhat would this look like?`,
          });
          toast('New combined idea created');
        } }, 'Create combined idea'),
        el('button', { type: 'button', class: 'btn-plain', onclick: spark }, 'Another spark')));
  }
  async function surprise() {
    try {
      const idea = await api('/random');
      await openIdea(idea.id);
      toast(`Resurfaced: ${idea.title}`);
    } catch (err) { toast(err.message, true); }
  }

  // ---------- connect (graph) ----------
  async function showGraph() {
    if (!state.graph) state.graph = window.IdeaGraph($('#graph-canvas'), (id) => openIdea(id));
    try {
      const data = await api('/graph');
      requestAnimationFrame(() => state.graph.setData(data));
    } catch (err) { toast(err.message, true); }
  }
  $('#connect-spark').addEventListener('click', spark);

  // ---------- profile ----------
  async function renderProfile() {
    const name = getName() || 'Creator';
    $('#profile-name').value = name;
    $('#profile-avatar').textContent = name[0].toUpperCase();
    try { await loadAll(); } catch (e) { /* shown elsewhere */ }
    statTiles($('#profile-stats'));
    stagger([...document.querySelectorAll('#s-profile .menu > *')], 3);
  }
  $('#profile-name').addEventListener('input', (e) => {
    const n = e.target.value.trim() || 'Creator';
    setName(n);
    $('#profile-avatar').textContent = n[0].toUpperCase();
  });
  $('#btn-export').addEventListener('click', () => { window.location.href = '/api/export'; });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await api('/import', { method: 'POST', body: JSON.parse(await file.text()) });
      toast(`Imported ${r.imported} ideas${r.skipped ? `, skipped ${r.skipped}` : ''}`);
      renderProfile();
    } catch (err) { toast(`Import failed: ${err.message}`, true); }
  });
  $('#btn-welcome').addEventListener('click', () => { $('#welcome-name').value = getName(); go('welcome', { push: false }); });

  // ---------- global wiring ----------
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', back));
  document.querySelectorAll('#tabbar [data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  fillCatSelect($('#composer-cat'), false);
  fillCatSelect($('#f-cat'), true);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.screen === 'detail') save(); return; }
    if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing || e.ctrlKey || e.metaKey || e.altKey || state.screen === 'welcome') return;
    if (e.key === 'n') { e.preventDefault(); go('capture'); }
    else if (e.key === '/') { e.preventDefault(); go('ideas').then(() => $('#search').focus()); }
  });
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  go(getName() ? 'home' : 'welcome', { push: false });
})();
