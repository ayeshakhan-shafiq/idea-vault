/* Lightweight force-directed graph for the idea network (no external libraries). */
(function () {
  'use strict';

  const COLORS = { fleeting: '#FFB45E', literature: '#6FD3E0', permanent: '#A99BFF' };

  function IdeaGraph(canvas, onSelect) {
    const ctx = canvas.getContext('2d');
    let nodes = [];
    let edges = [];
    let raf = null;
    let drag = null;
    let moved = false;
    let hover = null;
    let alpha = 1;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function size() {
      const r = canvas.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }

    function setData(data) {
      resize();
      const { w, h } = size();
      const degree = {};
      data.edges.forEach((e) => { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1; });
      nodes = data.nodes.map((n, i) => {
        const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
        return { ...n, x: w / 2 + Math.cos(angle) * w * 0.3, y: h / 2 + Math.sin(angle) * h * 0.3, vx: 0, vy: 0, r: 7 + Math.min(8, (degree[n.id] || 0) * 1.5) };
      });
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      edges = data.edges.map((e) => ({ s: byId[e.source], t: byId[e.target] })).filter((e) => e.s && e.t);
      alpha = 1;
      start();
    }

    function step() {
      const { w, h } = size();
      const k = Math.max(80, Math.min(150, Math.sqrt((w * h) / Math.max(1, nodes.length)) * 0.95));
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = Math.min(8, (k * k) / d2 * 0.12);
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      for (const e of edges) {
        const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - k) * 0.01;
        e.s.vx += (dx / d) * f; e.s.vy += (dy / d) * f; e.t.vx -= (dx / d) * f; e.t.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.vx += (w / 2 - n.x) * 0.002; n.vy += (h / 2 - n.y) * 0.002;
        if (n === drag) { n.vx = n.vy = 0; continue; }
        n.x += n.vx * alpha; n.y += n.vy * alpha;
        n.vx *= 0.6; n.vy *= 0.6;
        n.x = Math.max(n.r + 40, Math.min(w - n.r - 40, n.x));
        n.y = Math.max(n.r + 8, Math.min(h - n.r - 22, n.y));
      }
      alpha = Math.max(0.02, alpha * 0.99);
    }

    function draw() {
      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#6B6285';
      ctx.lineWidth = 1.4;
      for (const e of edges) {
        ctx.beginPath(); ctx.moveTo(e.s.x, e.s.y); ctx.lineTo(e.t.x, e.t.y); ctx.stroke();
        // arrow head
        const ang = Math.atan2(e.t.y - e.s.y, e.t.x - e.s.x);
        const ax = e.t.x - Math.cos(ang) * (e.t.r + 2), ay = e.t.y - Math.sin(ang) * (e.t.r + 2);
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(ang - 0.4) * 8, ay - Math.sin(ang - 0.4) * 8);
        ctx.lineTo(ax - Math.cos(ang + 0.4) * 8, ay - Math.sin(ang + 0.4) * 8);
        ctx.closePath(); ctx.fillStyle = '#6B6285'; ctx.fill();
      }
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const n of nodes) {
        const grow = Math.min(1, 0.15 + (1 - alpha) * 3); // nodes grow in when the graph opens
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * grow, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[n.type] || '#888'; ctx.fill();
        ctx.lineWidth = n === hover ? 3 : 1.5; ctx.strokeStyle = '#352F44'; ctx.stroke();
        ctx.fillStyle = n === hover ? '#ffffff' : '#CFC8DC';
        const label = n.title.length > 22 ? n.title.slice(0, 21) + '…' : n.title;
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, n.x)), n.y + n.r + 14);
      }
      if (!nodes.length) { ctx.fillStyle = '#A59DB8'; ctx.fillText('No ideas yet', w / 2, h / 2); }
    }

    function loop() { step(); draw(); raf = requestAnimationFrame(loop); }
    function start() { stop(); loop(); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

    function nodeAt(evt) {
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if ((n.x - x) ** 2 + (n.y - y) ** 2 <= (n.r + 4) ** 2) return n;
      }
      return null;
    }

    canvas.addEventListener('mousedown', (e) => { drag = nodeAt(e); moved = false; });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (drag) { drag.x = e.clientX - rect.left; drag.y = e.clientY - rect.top; moved = true; alpha = Math.max(alpha, 0.3); }
      hover = nodeAt(e);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
    });
    window.addEventListener('mouseup', (e) => {
      if (drag && !moved && e.target === canvas) onSelect(drag.id);
      drag = null;
    });
    window.addEventListener('resize', () => { if (raf) resize(); });

    return { setData, stop };
  }

  window.IdeaGraph = IdeaGraph;
})();
