'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { IdeaStore } = require('../src/store');

/** Start the app on a random port with a fresh in-memory store. */
async function startServer(store = new IdeaStore(null)) {
  const server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { server, call, close: () => new Promise((r) => server.close(r)) };
}

test('health check responds', async () => {
  const s = await startServer();
  const r = await s.call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  await s.close();
});

test('create, read, update and delete an idea', async () => {
  const s = await startServer();
  const created = await s.call('POST', '/ideas', { title: '  Podcast   idea ', tags: ['#Audio'], body: 'Hello' });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'Podcast idea');
  assert.equal(created.body.type, 'fleeting');
  assert.deepEqual(created.body.tags, ['audio']);

  const id = created.body.id;
  const read = await s.call('GET', `/ideas/${id}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.backlinks, []);

  const updated = await s.call('PUT', `/ideas/${id}`, { type: 'permanent', body: 'Updated' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.type, 'permanent');
  assert.equal(updated.body.title, 'Podcast idea');

  assert.equal((await s.call('DELETE', `/ideas/${id}`)).status, 204);
  assert.equal((await s.call('GET', `/ideas/${id}`)).status, 404);
  await s.close();
});

test('validation errors return 400 and duplicate titles return 409', async () => {
  const s = await startServer();
  assert.equal((await s.call('POST', '/ideas', { title: '' })).status, 400);
  assert.equal((await s.call('POST', '/ideas', { title: 'x'.repeat(201) })).status, 400);
  assert.equal((await s.call('POST', '/ideas', { title: 'Bad [title]' })).status, 400);
  assert.equal((await s.call('POST', '/ideas', { title: 'Ok', type: 'weird' })).status, 400);
  assert.equal((await s.call('POST', '/ideas', { title: 'Unique' })).status, 201);
  const dup = await s.call('POST', '/ideas', { title: 'unique' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /already exists/);
  await s.close();
});

test('malformed JSON is rejected with 400', async () => {
  const s = await startServer();
  const addr = s.server.address().port;
  const res = await fetch(`http://127.0.0.1:${addr}/api/ideas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
  });
  assert.equal(res.status, 400);
  await s.close();
});

test('wikilinks create outgoing links and backlinks', async () => {
  const s = await startServer();
  const a = (await s.call('POST', '/ideas', { title: 'Atomic notes' })).body;
  const b = (await s.call('POST', '/ideas', { title: 'Zettelkasten', body: 'Uses [[Atomic notes]] and [[Missing idea]]' })).body;

  const detailB = (await s.call('GET', `/ideas/${b.id}`)).body;
  assert.deepEqual(detailB.outgoing.map((l) => [l.title, l.exists]), [['Atomic notes', true], ['Missing idea', false]]);

  const detailA = (await s.call('GET', `/ideas/${a.id}`)).body;
  assert.deepEqual(detailA.backlinks.map((l) => l.title), ['Zettelkasten']);

  const graph = (await s.call('GET', '/graph')).body;
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges, [{ source: b.id, target: a.id }]);
  await s.close();
});

test('renaming an idea rewrites links that point to it', async () => {
  const s = await startServer();
  const a = (await s.call('POST', '/ideas', { title: 'Old name' })).body;
  const b = (await s.call('POST', '/ideas', { title: 'Linker', body: 'see [[Old name]]' })).body;
  await s.call('PUT', `/ideas/${a.id}`, { title: 'New name' });
  const linker = (await s.call('GET', `/ideas/${b.id}`)).body;
  assert.equal(linker.body, 'see [[New name]]');
  assert.equal(linker.outgoing[0].exists, true);
  await s.close();
});

test('suggestions surface unlinked ideas that share tags or mentions', async () => {
  const s = await startServer();
  const a = (await s.call('POST', '/ideas', { title: 'Newsletter', tags: ['writing', 'business'] })).body;
  await s.call('POST', '/ideas', { title: 'Blog', tags: ['writing'] });
  await s.call('POST', '/ideas', { title: 'Garden', tags: ['home'] });
  await s.call('POST', '/ideas', { title: 'Sponsorships', body: 'Money for the newsletter' });
  const linked = (await s.call('POST', '/ideas', { title: 'Book', tags: ['writing'], body: '[[Newsletter]]' })).body;

  const sug = (await s.call('GET', `/ideas/${a.id}`)).body.suggestions;
  const titles = sug.map((x) => x.title);
  assert.ok(titles.includes('Blog'));
  assert.ok(titles.includes('Sponsorships'));
  assert.ok(!titles.includes('Garden'));
  assert.ok(!titles.includes(linked.title), 'already-linked ideas are not suggested');
  await s.close();
});

test('search, tag and type filters', async () => {
  const s = await startServer();
  await s.call('POST', '/ideas', { title: 'Story about dragons', tags: ['fiction'], type: 'fleeting' });
  await s.call('POST', '/ideas', { title: 'Pricing page', body: 'dragons sell well', tags: ['business'], type: 'permanent' });
  await s.call('POST', '/ideas', { title: 'Coffee shop', tags: ['business'] });

  assert.equal((await s.call('GET', '/ideas?q=dragons')).body.length, 2);
  assert.equal((await s.call('GET', '/ideas?q=dragons%20pricing')).body.length, 1);
  assert.equal((await s.call('GET', '/ideas?tag=business')).body.length, 2);
  assert.equal((await s.call('GET', '/ideas?type=permanent')).body.length, 1);
  const tags = (await s.call('GET', '/tags')).body;
  assert.deepEqual(tags[0], { name: 'business', count: 2 });
  const sorted = (await s.call('GET', '/ideas?sort=title')).body.map((i) => i.title);
  assert.deepEqual(sorted, ['Coffee shop', 'Pricing page', 'Story about dragons']);
  await s.close();
});

test('random returns 404 when empty and an idea otherwise', async () => {
  const s = await startServer();
  assert.equal((await s.call('GET', '/random')).status, 404);
  await s.call('POST', '/ideas', { title: 'Only one' });
  const r = await s.call('GET', '/random');
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Only one');
  await s.close();
});

test('spark pairs two unlinked ideas and never an already-linked pair', async () => {
  const s = await startServer();
  assert.equal((await s.call('GET', '/spark')).status, 404);
  await s.call('POST', '/ideas', { title: 'Alpha' });
  await s.call('POST', '/ideas', { title: 'Beta', body: '[[Alpha]]' });
  assert.equal((await s.call('GET', '/spark')).status, 404, 'only pair is already linked');
  await s.call('POST', '/ideas', { title: 'Gamma' });
  for (let i = 0; i < 20; i++) {
    const r = await s.call('GET', '/spark');
    assert.equal(r.status, 200);
    const pair = [r.body.a.title, r.body.b.title].sort().join('+');
    assert.notEqual(pair, 'Alpha+Beta');
    assert.match(r.body.prompt, /What if you combined/);
  }
  await s.close();
});

test('export then import round-trips and skips duplicates', async () => {
  const s = await startServer();
  await s.call('POST', '/ideas', { title: 'One', tags: ['a'] });
  await s.call('POST', '/ideas', { title: 'Two', body: '[[One]]' });
  const exp = await s.call('GET', '/export');
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(exp.body.ideas.length, 2);

  const s2 = await startServer();
  await s2.call('POST', '/ideas', { title: 'One' });
  const imp = await s2.call('POST', '/import', exp.body);
  assert.deepEqual(imp.body, { imported: 1, skipped: 1 });
  assert.equal((await s2.call('POST', '/import', { nope: true })).status, 400);
  await s.close();
  await s2.close();
});

test('stats count ideas, links and orphans', async () => {
  const s = await startServer();
  await s.call('POST', '/ideas', { title: 'A' });
  await s.call('POST', '/ideas', { title: 'B', body: '[[A]]' });
  await s.call('POST', '/ideas', { title: 'C', type: 'permanent' });
  const st = (await s.call('GET', '/stats')).body;
  assert.equal(st.totalIdeas, 3);
  assert.equal(st.totalLinks, 1);
  assert.equal(st.orphanIdeas, 1);
  assert.equal(st.byType.permanent, 1);
  await s.close();
});

test('data persists to the JSON file across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideavault-'));
  const file = path.join(dir, 'ideas.json');
  const s = await startServer(new IdeaStore(file));
  await s.call('POST', '/ideas', { title: 'Persist me' });
  await s.close();

  const reloaded = new IdeaStore(file);
  assert.equal(reloaded.ideas.length, 1);
  assert.equal(reloaded.ideas[0].title, 'Persist me');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('static UI is served with security headers', async () => {
  const s = await startServer();
  const port = s.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Idea Vault/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'));
  await s.close();
});
