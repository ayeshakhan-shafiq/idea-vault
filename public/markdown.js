/* Minimal, safe Markdown renderer for idea bodies.
 * Everything is HTML-escaped first, then a small set of syntax is applied:
 * headings (#), bullet lists (-), **bold**, *italic*, `code`, and [[wikilinks]]. */
(function () {
  'use strict';

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function inline(text, resolve) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/\[\[([^\[\]]+)\]\]/g, (m, title) => {
      const clean = title.trim();
      const exists = resolve ? resolve(clean) : true;
      return `<a class="wikilink${exists ? '' : ' missing'}" data-title="${clean}" title="${exists ? 'Open idea' : 'Create this idea'}">${clean}</a>`;
    });
    return out;
  }

  function render(src, resolve) {
    const lines = String(src || '').split('\n');
    const html = [];
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length) { html.push(`<p>${para.map((l) => inline(l, resolve)).join('<br>')}</p>`); para = []; } };
    const flushList = () => { if (list) { html.push(`<ul>${list.map((l) => `<li>${inline(l, resolve)}</li>`).join('')}</ul>`); list = null; } };

    for (const line of lines) {
      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      const li = /^\s*[-*]\s+(.*)$/.exec(line);
      if (h) { flushPara(); flushList(); html.push(`<h${h[1].length + 1}>${inline(h[2], resolve)}</h${h[1].length + 1}>`); }
      else if (li) { flushPara(); (list = list || []).push(li[1]); }
      else if (!line.trim()) { flushPara(); flushList(); }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
    return html.join('\n') || '<p class="none">Nothing written yet.</p>';
  }

  window.IVMarkdown = { render, escapeHtml };
})();
