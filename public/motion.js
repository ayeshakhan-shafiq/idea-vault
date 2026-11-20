/* Idea Vault motion layer: headline reveal, 3D phone tilt, parallax badges,
 * card tilt + glare, tap ripples, sliding tab indicator and scroll effects.
 * Everything is skipped when the user prefers reduced motion. */
(function () {
  'use strict';

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s) => document.querySelector(s);
  const phone = $('#phone');
  
  // ---------- 1. Headline words + feature list (desktop pitch) ----------
  const h1 = $('.pitch h1');
  if (h1) {
    let i = 0;
    const out = [];
    h1.childNodes.forEach((node) => {
      const grad = node.nodeType === 1; // the coloured <span>
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { out.push(document.createTextNode(part)); return; }
        const w = document.createElement('i');
        w.className = grad ? 'w grad' : 'w';
        w.textContent = part;
        w.style.setProperty('--i', i++);
        out.push(w);
      });
    });
    h1.replaceChildren(...out);
  }
  document.querySelectorAll('.pitch li').forEach((li, i) => li.style.setProperty('--i', i));
  // intro title letters (animated by the 3D intro)
  const introWord = $('#intro-word');
  if (introWord) {
    introWord.replaceChildren(...[...introWord.textContent].map((ch, i) => {
      const sp = document.createElement('span');
      sp.textContent = ch;
      sp.style.setProperty('--i', i);
      return sp;
    }));
  }

  // ---------- 2. Intro safety net ----------
  // The 3D intro (scene.js) ends itself; if that script fails to load, never keep the app hidden.
  const sceneScript = document.querySelector('script[src="scene.js"]');
  const forceEnd = () => { if (window.IVEndIntro) window.IVEndIntro(); else { document.body.classList.remove('intro'); document.body.classList.add('intro-done'); } };
  if (sceneScript) sceneScript.addEventListener('error', forceEnd);
  // no 3D script after 4 s -> show the app; a running intro gets up to 15 s on very slow devices
  setTimeout(() => { if (!window.IVEndIntro && document.body.classList.contains('intro')) forceEnd(); }, 4000);
  setTimeout(() => { if (document.body.classList.contains('intro')) forceEnd(); }, 15000);

  if (reduce) return; // nothing below is essential

  // ---------- 3. 3D phone tilt, glare and parallax badges (desktop) ----------
  const badges = [...document.querySelectorAll('.float-badge')];
  if (finePointer) {
    let tx = 0, ty = 0, cx = 0, cy = 0, gx = 50, gy = 0, inside = false;
    window.addEventListener('pointermove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      tx = -ny * 6; // rotateX
      ty = nx * 8; // rotateY
      const r = phone.getBoundingClientRect();
      gx = ((e.clientX - r.left) / r.width) * 100;
      gy = ((e.clientY - r.top) / r.height) * 100;
      inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
      badges.forEach((b, i) => {
        const depth = [28, -22, 18][i] || 20;
        b.style.setProperty('--px', `${nx * depth}px`);
        b.style.setProperty('--py', `${ny * depth}px`);
      });
    });
    document.addEventListener('pointerleave', () => { tx = 0; ty = 0; inside = false; });
    // spring-like smoothing
    (function loop() {
      // hold still while the user is typing so the text field doesn't move
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      const k = 0.08;
      cx += ((typing ? 0 : tx) - cx) * k;
      cy += ((typing ? 0 : ty) - cy) * k;
      phone.style.setProperty('--rx', `${cx.toFixed(2)}deg`);
      phone.style.setProperty('--ry', `${cy.toFixed(2)}deg`);
      phone.style.setProperty('--gx', `${gx.toFixed(1)}%`);
      phone.style.setProperty('--gy', `${gy.toFixed(1)}%`);
      phone.style.setProperty('--go', inside && !typing ? '0.55' : '0');
      requestAnimationFrame(loop);
    })();
  }

  // ---------- 4. Card tilt + glare ----------
  const TILT = '.cat-tile, .idea-card, .duo-btn, .spark-card, .hero-card, .stat, .prompt';
  const markTilt = (root) => root.querySelectorAll && root.querySelectorAll(TILT).forEach((n) => n.classList.add('tilt'));
  markTilt(document);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches(TILT)) n.classList.add('tilt');
    markTilt(n);
  }))).observe(phone, { childList: true, subtree: true });

  if (finePointer) {
    let current = null;
    const reset = (n) => { n.classList.remove('tilting'); n.style.setProperty('--tx', '0deg'); n.style.setProperty('--ty', '0deg'); };
    phone.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.tilt');
      if (current && current !== card) { reset(current); current = null; }
      if (!card) return;
      current = card;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const max = card.classList.contains('hero-card') ? 5 : 9;
      card.style.setProperty('--tx', `${((0.5 - py) * max).toFixed(2)}deg`);
      card.style.setProperty('--ty', `${((px - 0.5) * max).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      card.classList.add('tilting');
    });
    phone.addEventListener('pointerleave', () => { if (current) { reset(current); current = null; } });
  }

  // ---------- 5. Ripple on tap ----------
  const RIPPLE = '.btn-gradient, .pill-btn, .chip, .duo-btn, .menu > button, .menu-item, .prompt, .send, .btn-plain, .btn-danger';
  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest(RIPPLE);
    if (!host) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    setTimeout(() => dot.remove(), 650);
  });

  // ---------- 6. Sliding tab indicator ----------
  const ind = $('#tab-ind');
  const tabbar = $('#tabbar');
  function placeIndicator() {
    const on = tabbar.querySelector('button.on:not(.fab)');
    if (!on || tabbar.hidden) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.transform = `translateX(${on.offsetLeft + on.offsetWidth / 2 - 9}px)`;
  }
  new MutationObserver(placeIndicator).observe(tabbar, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', placeIndicator);
  setTimeout(placeIndicator, 50);

  // ---------- 7. Home scroll: glass header + hero parallax ----------
  const home = $('#s-home');
  const head = $('.home-head');
  home.addEventListener('scroll', () => {
    const y = Math.min(home.scrollTop, 300);
    home.style.setProperty('--sc', y);
    head.classList.toggle('glass', home.scrollTop > 8);
  }, { passive: true });
})();
