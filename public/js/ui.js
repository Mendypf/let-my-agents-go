// Everything drawn in HTML on top of the canvas: name tags, speech bubbles, the scripture scroll,
// the roll call, the chronicle, stats, controls.
import { MOMENTS, APP, LEVITE_NOTE, VERB, SHORT } from './copy.js';
import { fmtTokens } from './world.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

export class UI {
  constructor(world, app) {
    this.world = world; this.app = app;
    this.tags = new Map();
    this.layer = $('#tags');
    this.queue = [];
    this.showing = null;
    this.lastRoll = 0; this.lastStats = 0;
    this.buildStatic();
  }

  buildStatic() {
    $('#title').textContent = APP.title;
    $('#tagline').textContent = APP.tagline;
    $('#scroll-close').addEventListener('click', () => this.nextCaption(true));
  }

  // ---------- per frame
  frame(view) {
    const w = this.world;
    if (this.showing && this.queue.length && !this.queue[0].note && performance.now() - this.shownAt > 4000) this.nextCaption(true);
    const seen = new Set();
    const items = [];
    const zoom = view.scale / (view.base || view.scale);
    const put = (id, x, y, html, cls, color, stack, prio = 1, wid = null) => {
      seen.add(id);
      let t = this.tags.get(id);
      if (!t) { t = el('div', 'tag'); this.layer.appendChild(t); this.tags.set(id, t); t._html = ''; t._cls = ''; }
      if (t._html !== html) { t.innerHTML = html; t._html = html; t._size = null; }
      const cl = `tag ${cls || ''}`;
      if (t._cls !== cl) { t.className = cl; t._cls = cl; t._size = null; }
      if (color && t._color !== color) { t.style.setProperty('--crew', color); t._color = color; }
      const p = view.toScreen(x, y);
      items.push({ t, x: p.x, y: p.y, visible: p.visible, stack, prio, wid });
    };
    const details = !this.app.privacy;
    const talkers = [...w.workers.values()].filter((x) => x.bubble && w.t < x.bubble.until && x.bubble.kind === 'say').sort((a, b) => b.bubble.until - a.bubble.until);
    const talker = talkers.length ? talkers[0].id : null;
    const recentList = [...w.workers.values()].filter((x) => x.task && x.toolAt != null && w.t - x.toolAt < 3.5).sort((a, b) => b.toolAt - a.toolAt).slice(0, 3).map((x) => x.id);
    const recent = new Set(recentList);
    const hideAll = !!w.dim; // the strike gets the stage to itself
    const clipSay = (t) => { t = String(t).replace(/\s+/g, ' ').trim(); const first = t.split(/(?<=[.!?])\s/)[0]; t = first.length >= 12 ? first : t; return t.length > 80 ? t.slice(0, 79) + '…' : t; };
    for (const wk of w.workers.values()) {
      if (wk.x < -8 || hideAll) continue;
      // what the agent is doing, in words; nothing while resting or walking in
      const kind = w.doing(wk);
      const verb = !kind ? '' : wk.kind === 'levite' && kind === 'scroll' ? 'Levite, reading' : VERB[kind] || '';
      let bub = '';
      if (wk.bubble && w.t < wk.bubble.until && (wk.bubble.kind !== 'say' || wk.id === talker)) {
        const k = wk.bubble.kind;
        const txt = k === 'think' ? '<span class="dots"><i></i><i></i><i></i></span>' : esc(details ? (k === 'say' ? clipSay(wk.bubble.text) : wk.bubble.text) : k === 'ask' ? 'Needs your answer' : k === 'err' ? '✗ failed' : '…');
        bub = `<p class="bub ${k}">${txt}</p>`;
      }
      const alert = wk.act === 'wait' || wk.act === 'ask';
      const chip = !!kind && (alert || recent.has(wk.id));
      if (!kind && !bub) continue;
      // the newest actions and anyone waiting on you also get a name and the file or command
      const tgt = details && chip && wk.target && !['think', 'sleep', 'survey', 'conscript', 'ask'].includes(kind) ? wk.target : '';
      const text = tgt && SHORT[kind] ? `${SHORT[kind]} ${tgt}` : verb;
      const body = !kind ? '' : chip
        ? `<span class="row"><b><s></s>${esc(wk.name)}</b><em>${esc(text)}</em></span>`
        : `<span class="row"><em class="plain"><s></s>${esc(verb)}</em></span>`;
      const prio = alert ? 5 : wk.id === recentList[0] ? 2.5 : chip ? 2 : kind ? 1.5 : 1;
      put(`w:${wk.id}`, wk.x, w.headY(wk), `${bub}${body}`, `worker ${kind ? 'lbl' : ''} ${chip ? 'chip' : ''} ${alert ? 'alert' : ''} ${wk.kind}`, wk.crew.color, true, prio, wk.id);
    }
    for (const c of w.crews.values()) {
      const tm = c.taskmaster;
      if (!tm || tm.state === 'buried' || tm.state === 'dead') continue;
      const bub = tm.bubble && w.t < tm.bubble.until ? `<p class="bub say">${esc(tm.bubble.text)}</p>` : '';
      const busy = bub || ['windup', 'crack', 'recoil', 'frozen', 'point'].includes(tm.state);
      if (!busy || (hideAll && tm.state !== 'frozen')) continue;
      put(`t:${c.id}`, tm.x, tm.y - 24, `${bub}<b>Overseer ${esc(tm.name)}</b>`, 'overseer', c.color, true, tm.state === 'frozen' ? 3 : 2, `t:${c.id}`);
    }
    const ph = w.pharaoh;
    const pbub = ph.bubble && w.t < ph.bubble.until ? `<p class="bub decree">${esc(details ? ph.bubble.text : 'Pharaoh issues a decree.')}</p>` : '';
    if (!hideAll) put('pharaoh', ph.x, ph.y - (ph.state === 'sit' || ph.state === 'decree' ? 25 : 29), `${pbub}<b>${esc(APP.pharaoh)}</b>`, 'royal', null, true, pbub ? 3 : 2);
    const magiBub = w.magi.map((m) => (m.bubble && w.t < m.bubble.until ? m.bubble.text : '')).filter(Boolean)[0];
    if (!hideAll && (magiBub || w.magi.some((m) => m.act && m.act !== 'mutter'))) {
      put('magi', (w.magi[0].x + w.magi[1].x) / 2, w.magi[0].y - 30, `${magiBub ? `<p class="bub say">${esc(magiBub)}</p>` : ''}<b>Yochana &amp; Mamre</b>`, 'royal small', null, true, 2);
    }
    if (w.moses) put('moses', w.moses.x, w.moses.y - 33, '<b>Moses</b>', 'moses', null, true, 5);
    for (const m of w.mounds) put(`m:${m.t}`, m.x, m.y + 13, `<em>${esc(m.name)}</em>`, 'grave', null, false);
    const pyr = w.pyramid;
    const top = pyr.top();
    if (!hideAll) put('pyramid', pyr.x0 + 178, pyr.baseY - 8, `<b>${fmt(pyr.total)}</b><em>stones</em>`, 'pyr', null, false);

    // place tags: most important first; kept inside the screen; a low-priority label that would land
    // on another label or on someone's body is dropped (that worker keeps the icon over their head)
    const big = zoom > 1.5;
    for (const it of items) if (it.t._big !== big) { it.t.style.fontSize = big ? '1.25em' : ''; it.t._big = big; it.t._size = null; }
    const sc = view.scale / view.dpr, bodies = [];
    const addBody = (a, h, id) => { const p = view.toScreen(a.x, a.y); bodies.push({ id, x: p.x - 5 * sc, y: p.y - h * sc, w: 10 * sc, h: h * sc }); };
    for (const wk of w.workers.values()) addBody(wk, 22, wk.id);
    for (const c of w.crews.values()) if (c.taskmaster && c.taskmaster.alive) addBody(c.taskmaster, 24, `t:${c.id}`);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const M = 24;
    const stacked = items.filter((i) => i.stack && i.visible).sort((a, b) => b.prio - a.prio || b.y - a.y);
    const placed = [];
    const clear = (r, own) => r.x >= M && r.x + r.w <= innerWidth - M && r.y >= 4 && r.y + r.h <= innerHeight - 4 &&
      !placed.some((p) => hit(p, r)) && !bodies.some((b) => b.id !== own && hit({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, b));
    // a label hidden last frame measures as 0 wide, so show it before measuring
    const size = (t) => { if (!t._size || !t._size.w) { t.style.display = ''; t._size = { w: t.offsetWidth, h: t.offsetHeight }; } return t._size; };
    for (const it of stacked) {
      const { w: tw, h: th } = size(it.t);
      // where the label can go: above the head, or beside it with a short side stem
      const cands = [{ side: '', x: it.x, y: it.y, r: { x: it.x - tw / 2, y: it.y - th, w: tw, h: th } }];
      const tmId = typeof it.wid === 'string' && it.wid.startsWith('t:') ? it.wid.slice(2) : null;
      const who = tmId ? (w.crews.get(tmId) || {}).taskmaster : it.wid != null && w.workers.get(it.wid);
      if (who) {
        const hp = view.toScreen(who.x, tmId ? who.y - 26 : w.headY(who)), d = 5 * sc + 8, hy = hp.y + 5 * sc;
        cands.push({ side: 'r', x: hp.x + d, y: hy, r: { x: hp.x + d, y: hy - th / 2, w: tw, h: th } });
        cands.push({ side: 'l', x: hp.x - d, y: hy, r: { x: hp.x - d - tw, y: hy - th / 2, w: tw, h: th } });
      }
      let pick = cands.find((c) => clear(c.r, it.wid));
      if (!pick) {
        if (it.prio < 3) { it.hide = true; continue; }
        // important labels stay: above the head, kept on screen, stacked over anything in the way
        pick = cands[0];
        pick.x = Math.max(M + tw / 2, Math.min(innerWidth - M - tw / 2, pick.x));
        pick.r = { x: pick.x - tw / 2, y: pick.y - th, w: tw, h: th };
        for (let guard = 0; guard < 12; guard++) {
          const p = placed.find((q) => hit(q, pick.r));
          if (!p) break;
          pick.y = p.y - 2; pick.r = { x: pick.r.x, y: pick.y - th, w: tw, h: th };
        }
        if (pick.r.y < 4) { pick.y += 4 - pick.r.y; pick.r.y = 4; }
      }
      it.x = pick.x; it.y = pick.y; it.side = pick.side;
      placed.push(pick.r);
    }
    for (const it of items) {
      if (!it.stack) {
        const half = size(it.t).w / 2;
        if (it.x - half < 4 || it.x + half > innerWidth - 4 || it.y < 30 || it.y > innerHeight - 4) it.hide = true;
      }
      const shift = it.side === 'r' ? 'translate(0, -50%)' : it.side === 'l' ? 'translate(-100%, -50%)' : 'translate(-50%, -100%)';
      it.t.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) ${shift}`;
      it.t.classList.toggle('side-r', it.side === 'r');
      it.t.classList.toggle('side-l', it.side === 'l');
      it.t.style.display = it.visible && !it.hide ? '' : 'none';
    }
    for (const [id, t] of this.tags) if (!seen.has(id)) { t.remove(); this.tags.delete(id); }

    const now = performance.now();
    if (now - this.lastStats > 300) { this.lastStats = now; this.renderStats(); }
    if (now - this.lastRoll > 700) { this.lastRoll = now; this.renderRoll(); }
  }

  renderStats() {
    const s = this.world.summary();
    const set = (id, v) => { const e = document.getElementById(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('st-working', s.working);
    set('st-stones', fmt(s.stones));
    set('st-pyramids', fmt(s.completed));
    set('st-whips', fmt(s.whips));
    set('st-tax', fmtTokens(s.tax));
  }

  renderRoll() {
    const w = this.world;
    const box = $('#roll-list');
    const crews = [...w.crews.values()].sort((a, b) => a.idx - b.idx);
    const parts = [];
    for (const c of crews) {
      const tm = c.taskmaster;
      const workers = c.workers().sort((a, b) => (a.sub - b.sub) || a.name.localeCompare(b.name));
      const cool = Math.max(0, Math.ceil(w.mosesReadyAt - w.t));
      let btn;
      if (!tm || !tm.alive) btn = `<span class="nobody">${c.appointAt ? 'No overseer. Pharaoh is sending one.' : 'No overseer'}</span>`;
      else if (w.moses || cool > 0) btn = '';
      else btn = `<button class="kill" data-crew="${esc(c.id)}">send Moses</button>`;
      parts.push(`<section class="crew" style="--crew:${c.color}">
        <header><s></s><div><b>${esc(this.app.privacy ? c.safeLabel : (c.title || c.projName || 'Untitled session'))}</b><small>${esc(this.app.privacy ? '' : (c.projName || ''))}</small></div></header>
        <div class="tm"><span>${tm && tm.alive ? `Overseer ${esc(tm.name)} · ${tm.whips} lash${tm.whips === 1 ? '' : 'es'}` : `${c.buried ? `${c.buried} buried in the sand` : ''}`}</span>${btn}</div>
        <ul>${workers.map((x) => {
          const role = x.kind === 'levite' ? 'Levite' : x.sub ? 'Helper' : 'Foreman';
          const action = x.act === 'wait' ? 'needs your OK' : x.label;
          const tgt = !this.app.privacy && x.target ? ` · ${esc(x.target)}` : '';
          const hot = x.act === 'wait' || x.act === 'ask';
          return `<li class="${hot ? 'hot' : ''}" title="${x.kind === 'levite' ? esc(LEVITE_NOTE) : ''}"><b>${esc(x.name)}</b><i>${role}</i><em>${esc(action)}${tgt}</em></li>`;
        }).join('')}</ul>
      </section>`);
    }
    const html = parts.join('') || '<p class="empty-roll">No crews on site.</p>';
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
    const n = [...w.workers.values()].length;
    $('#roll-count').textContent = `${crews.length} crew${crews.length === 1 ? '' : 's'} · ${n} worker${n === 1 ? '' : 's'}`;
    const mb = $('#btn-moses');
    const cool = Math.max(0, Math.ceil(w.mosesReadyAt - w.t));
    const anyTm = crews.some((c) => c.taskmaster && c.taskmaster.alive);
    const label = w.moses ? 'Moses is on his way' : cool > 0 ? `Moses is in Midian · ${cool}s` : anyTm ? 'Send Moses' : 'No overseer to strike';
    if (mb._label !== label) { mb.querySelector('span').textContent = label; mb.disabled = label !== 'Send Moses'; mb._label = label; }
  }

  // ---------- chronicle
  log(text, kind, safe) {
    const list = $('#chron-list');
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (kind === 'decree') safe = 'Pharaoh issued a decree';
    const li = el('li', `k-${kind || 'info'}`, `<time>${time}</time><span></span>`);
    li._full = text; li._safe = safe || text;
    li.lastChild.textContent = this.app.privacy ? li._safe : li._full;
    list.prepend(li);
    while (list.children.length > 6) list.lastChild.remove();
    $('#chron').hidden = false;
  }

  refreshPrivacy() {
    for (const li of $('#chron-list').children) if (li._full) li.lastChild.textContent = this.app.privacy ? li._safe : li._full;
    if (this.showing) { this.queue.unshift(this.showing); this.nextCaption(); }
  }

  // ---------- scripture scroll
  moment(key, ctx, priority) {
    const m = MOMENTS[key];
    if (!m) return;
    // notes explain something with no action on screen; scenes caption what the camera shows
    const note = NOTES.has(key);
    const item = { key, m, ctx: ctx || {}, at: performance.now(), note };
    if (priority) {
      this.queue.unshift(item);
      if (this.showing) this.nextCaption(true); else this.nextCaption();
      return;
    }
    // only the newest thing waits in line, so the caption matches where the camera is
    if (note) { if (this.showing || this.queue.length) return; this.queue = [item]; }
    else this.queue = [item];
    if (!this.showing) { this.nextCaption(); return; }
    const up = performance.now() - this.shownAt;
    if (!note && (up > 4000 || (this.showing.note && up > 1500))) this.nextCaption(true);
  }

  nextCaption(force) {
    const box = $('#scroll');
    clearTimeout(this.capTimer);
    if (force && this.showing) { box.classList.remove('open'); this.showing = null; setTimeout(() => this.nextCaption(), 350); return; }
    while (this.queue.length && performance.now() - this.queue[0].at > 12000) this.queue.shift();
    const item = this.queue.shift();
    if (!item) { box.classList.remove('open'); this.showing = null; return; }
    this.showing = item;
    this.shownAt = performance.now();
    const { m, ctx } = item;
    let gloss = '';
    const c = this.app.privacy ? { ...ctx, file: '', cmd: '', title: '', err: '', text: '', crew: ctx.crewSafe || 'The crew' } : ctx;
    try { gloss = m.gloss ? m.gloss(c) : ''; } catch { gloss = ''; }
    $('#sc-he').textContent = m.he || '';
    $('#sc-en').textContent = m.en || '';
    $('#sc-src').textContent = [m.src, m.rashiSrc].filter(Boolean).join('  ·  ');
    const r = $('#sc-rashi');
    r.hidden = !(m.rashi || m.rashiEn);
    $('#sc-rashi-he').textContent = m.rashi || '';
    $('#sc-rashi-he').hidden = !m.rashi;
    $('#sc-rashi-en').textContent = m.rashiEn || '';
    $('#sc-rashi-src').textContent = '';
    $('#sc-gloss').textContent = gloss;
    $('#sc-gloss').hidden = !gloss;
    box.classList.remove('open', 'page2');
    clearTimeout(this.pageTimer);
    if (this.app.film && (m.rashi || m.rashiEn)) this.pageTimer = setTimeout(() => { if (this.showing === item) box.classList.add('page2'); }, 4500);
    void box.offsetWidth;
    box.classList.add('open');
    const words = `${m.en} ${m.rashiEn || ''} ${gloss}`.split(/\s+/).length;
    this.capTimer = setTimeout(() => this.nextCaption(true), Math.max(7000, words * 330));
  }
}

// captions that explain rather than show: they give way to anything happening on screen
const NOTES = new Set(['midwives', 'afarayim', 'taxes', 'sixAtOnce', 'officers', 'newKing', 'heart', 'matzah']);
