'use strict';

/**
 * Zettelkasten link helpers.
 * Ideas link to each other by writing [[Idea Title]] inside the body.
 */

const LINK_RE = /\[\[([^\[\]\n]{1,200})\]\]/g;

/** Return the unique, trimmed titles referenced with [[...]] in a body of text. */
function extractLinks(body) {
  if (typeof body !== 'string' || body.length === 0) return [];
  const seen = new Map();
  for (const match of body.matchAll(LINK_RE)) {
    const title = match[1].trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!seen.has(key)) seen.set(key, title);
  }
  return [...seen.values()];
}

/** Replace every [[oldTitle]] reference (case-insensitive) with [[newTitle]]. */
function renameLinks(body, oldTitle, newTitle) {
  if (typeof body !== 'string') return body;
  const wanted = oldTitle.trim().toLowerCase();
  return body.replace(LINK_RE, (full, inner) =>
    inner.trim().toLowerCase() === wanted ? `[[${newTitle}]]` : full
  );
}

/** Normalise a list of tags: lower-case, trimmed, no leading '#', unique, non-empty. */
function normaliseTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = new Set();
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const clean = t.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (clean && clean.length <= 40) out.add(clean);
  }
  return [...out];
}

module.exports = { extractLinks, renameLinks, normaliseTags, LINK_RE };
