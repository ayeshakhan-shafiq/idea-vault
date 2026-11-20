'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractLinks, renameLinks, normaliseTags } = require('./links');

const IDEA_TYPES = ['fleeting', 'literature', 'permanent'];
const LIMITS = { title: 200, body: 20000, source: 500, tags: 20 };

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
class NotFoundError extends Error {
  constructor(message = 'Idea not found') {
    super(message);
    this.status = 404;
  }
}
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

/**
 * File-backed idea store. All data lives in one JSON file that is written
 * atomically (write temp file, then rename) so a crash never corrupts it.
 */
class IdeaStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.ideas = [];
    this._load();
  }

  _load() {
    if (!this.filePath) return; // in-memory mode (used by tests)
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.ideas = [];
    }
  }

  _save() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, ideas: this.ideas }, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  // ---------- validation ----------
  _validate(input, { partial = false, selfId = null } = {}) {
    const out = {};
    if (!partial || input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new ValidationError('Title is required');
      }
      const title = input.title.trim().replace(/\s+/g, ' ');
      if (title.length > LIMITS.title) throw new ValidationError(`Title must be at most ${LIMITS.title} characters`);
      if (/[\[\]]/.test(title)) throw new ValidationError('Title cannot contain [ or ] characters');
      const clash = this.findByTitle(title);
      if (clash && clash.id !== selfId) throw new ConflictError(`An idea titled "${clash.title}" already exists`);
      out.title = title;
    }
    if (!partial || input.body !== undefined) {
      const body = input.body ?? '';
      if (typeof body !== 'string') throw new ValidationError('Body must be text');
      if (body.length > LIMITS.body) throw new ValidationError(`Body must be at most ${LIMITS.body} characters`);
      out.body = body;
    }
    if (!partial || input.type !== undefined) {
      const type = input.type ?? 'fleeting';
      if (!IDEA_TYPES.includes(type)) throw new ValidationError(`Type must be one of: ${IDEA_TYPES.join(', ')}`);
      out.type = type;
    }
    if (!partial || input.tags !== undefined) {
      const tags = normaliseTags(input.tags ?? []);
      if (tags.length > LIMITS.tags) throw new ValidationError(`At most ${LIMITS.tags} tags allowed`);
      out.tags = tags;
    }
    if (!partial || input.source !== undefined) {
      const source = input.source ?? '';
      if (typeof source !== 'string') throw new ValidationError('Source must be text');
      if (source.length > LIMITS.source) throw new ValidationError(`Source must be at most ${LIMITS.source} characters`);
      out.source = source.trim();
    }
    if (!partial || input.pinned !== undefined) {
      out.pinned = Boolean(input.pinned);
    }
    return out;
  }

  // ---------- queries ----------
  findByTitle(title) {
    const key = title.trim().toLowerCase();
    return this.ideas.find((i) => i.title.toLowerCase() === key) || null;
  }

  get(id) {
    const idea = this.ideas.find((i) => i.id === id);
    if (!idea) throw new NotFoundError();
    return idea;
  }

  list({ q, tag, type, sort = 'updated' } = {}) {
    let result = this.ideas.slice();
    if (q) {
      const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((i) => {
        const hay = `${i.title}\n${i.body}\n${i.tags.join(' ')}\n${i.source}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    if (tag) result = result.filter((i) => i.tags.includes(String(tag).toLowerCase()));
    if (type) result = result.filter((i) => i.type === type);
    const sorters = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    result.sort(sorters[sort] || sorters.updated);
    // pinned ideas always float to the top
    result.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return result;
  }

  /** Outgoing links resolved to ideas; unresolved titles are reported as "missing". */
  outgoing(idea) {
    return extractLinks(idea.body).map((title) => {
      const target = this.findByTitle(title);
      return target ? { id: target.id, title: target.title, exists: true } : { id: null, title, exists: false };
    });
  }

  /** Ideas whose body links to this idea. */
  backlinks(idea) {
    const key = idea.title.toLowerCase();
    return this.ideas
      .filter((i) => i.id !== idea.id && extractLinks(i.body).some((t) => t.toLowerCase() === key))
      .map((i) => ({ id: i.id, title: i.title }));
  }

  /**
   * Connection suggestions: ideas that are not yet linked either way but share
   * tags or mention this idea's title in plain text. Ranked by score.
   */
  suggestions(idea, limit = 5) {
    const linked = new Set([
      ...this.outgoing(idea).filter((l) => l.exists).map((l) => l.id),
      ...this.backlinks(idea).map((l) => l.id),
      idea.id,
    ]);
    const titleKey = idea.title.toLowerCase();
    const scored = [];
    for (const other of this.ideas) {
      if (linked.has(other.id)) continue;
      const shared = other.tags.filter((t) => idea.tags.includes(t));
      let score = shared.length * 2;
      const reasons = [];
      if (shared.length) reasons.push(`shares tag${shared.length > 1 ? 's' : ''} ${shared.map((t) => '#' + t).join(', ')}`);
      if (titleKey.length >= 4 && other.body.toLowerCase().includes(titleKey)) {
        score += 3;
        reasons.push('mentions this idea without linking');
      }
      if (other.title.length >= 4 && idea.body.toLowerCase().includes(other.title.toLowerCase())) {
        score += 3;
        reasons.push('is mentioned here without a link');
      }
      if (score > 0) scored.push({ id: other.id, title: other.title, score, reason: reasons.join('; ') });
    }
    return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }

  detail(id) {
    const idea = this.get(id);
    return {
      ...idea,
      outgoing: this.outgoing(idea),
      backlinks: this.backlinks(idea),
      suggestions: this.suggestions(idea),
    };
  }

  tags() {
    const counts = new Map();
    for (const i of this.ideas) for (const t of i.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  graph() {
    const nodes = this.ideas.map((i) => ({ id: i.id, title: i.title, type: i.type, tags: i.tags }));
    const edges = [];
    for (const i of this.ideas) {
      for (const l of this.outgoing(i)) if (l.exists && l.id !== i.id) edges.push({ source: i.id, target: l.id });
    }
    return { nodes, edges };
  }

  /** A random idea to resurface; prefers ideas not touched recently ("orphans" first). */
  random() {
    if (this.ideas.length === 0) return null;
    const orphans = this.ideas.filter((i) => this.outgoing(i).every((l) => !l.exists) && this.backlinks(i).length === 0);
    const pool = orphans.length && Math.random() < 0.6 ? orphans : this.ideas;
    return pool[crypto.randomInt(pool.length)];
  }

  /**
   * Spark: pick two ideas that are NOT linked to each other (preferably from
   * different tags/categories) and suggest combining them into something new.
   */
  spark() {
    if (this.ideas.length < 2) return null;
    const linkedPairs = new Set();
    for (const e of this.graph().edges) {
      linkedPairs.add(`${e.source}|${e.target}`);
      linkedPairs.add(`${e.target}|${e.source}`);
    }
    const pairs = [];
    for (let i = 0; i < this.ideas.length; i++) {
      for (let j = i + 1; j < this.ideas.length; j++) {
        const a = this.ideas[i];
        const b = this.ideas[j];
        if (linkedPairs.has(`${a.id}|${b.id}`)) continue;
        const sharesTag = a.tags.some((t) => b.tags.includes(t));
        pairs.push({ a, b, weight: sharesTag ? 1 : 3 });
      }
    }
    if (!pairs.length) return null;
    const total = pairs.reduce((s, p) => s + p.weight, 0);
    let pick = crypto.randomInt(total);
    let chosen = pairs[0];
    for (const p of pairs) {
      if (pick < p.weight) { chosen = p; break; }
      pick -= p.weight;
    }
    const [a, b] = crypto.randomInt(2) ? [chosen.a, chosen.b] : [chosen.b, chosen.a];
    return { a, b, prompt: `What if you combined "${a.title}" with "${b.title}"?` };
  }

  stats() {
    const g = this.graph();
    const linkedIds = new Set(g.edges.flatMap((e) => [e.source, e.target]));
    const byType = Object.fromEntries(IDEA_TYPES.map((t) => [t, this.ideas.filter((i) => i.type === t).length]));
    return {
      totalIdeas: this.ideas.length,
      totalLinks: g.edges.length,
      orphanIdeas: this.ideas.filter((i) => !linkedIds.has(i.id)).length,
      totalTags: this.tags().length,
      byType,
    };
  }

  // ---------- mutations ----------
  create(input) {
    const data = this._validate(input || {});
    const now = new Date().toISOString();
    const idea = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
    this.ideas.push(idea);
    this._save();
    return idea;
  }

  update(id, input) {
    const idea = this.get(id);
    const data = this._validate(input || {}, { partial: true, selfId: id });
    const oldTitle = idea.title;
    Object.assign(idea, data, { updatedAt: new Date().toISOString() });
    // Keep the network intact: renaming an idea rewrites [[links]] that point at it.
    if (data.title && data.title !== oldTitle) {
      for (const other of this.ideas) {
        if (other.id === id) continue;
        const rewritten = renameLinks(other.body, oldTitle, data.title);
        if (rewritten !== other.body) {
          other.body = rewritten;
          other.updatedAt = idea.updatedAt;
        }
      }
    }
    this._save();
    return idea;
  }

  remove(id) {
    const idx = this.ideas.findIndex((i) => i.id === id);
    if (idx === -1) throw new NotFoundError();
    const [removed] = this.ideas.splice(idx, 1);
    this._save();
    return removed;
  }

  exportAll() {
    return { app: 'Idea Vault', version: 1, exportedAt: new Date().toISOString(), ideas: this.ideas };
  }

  /** Import ideas from an export. Ideas whose title already exists are skipped. */
  importAll(payload) {
    if (!payload || !Array.isArray(payload.ideas)) throw new ValidationError('Import file must contain an "ideas" array');
    let imported = 0;
    let skipped = 0;
    for (const raw of payload.ideas) {
      try {
        const data = this._validate(raw || {});
        const now = new Date().toISOString();
        this.ideas.push({
          id: crypto.randomUUID(),
          ...data,
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
          updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
        });
        imported++;
      } catch (err) {
        if (err.status === 400 || err.status === 409) skipped++;
        else throw err;
      }
    }
    this._save();
    return { imported, skipped };
  }
}

module.exports = { IdeaStore, IDEA_TYPES, LIMITS, ValidationError, NotFoundError, ConflictError };
