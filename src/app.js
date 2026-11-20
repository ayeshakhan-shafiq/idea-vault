'use strict';

const path = require('path');
const express = require('express');
const { IdeaStore, IDEA_TYPES } = require('./store');

/** Build the Express application. Pass a store (tests use an in-memory one). */
function createApp(store = new IdeaStore(null)) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Basic security headers (no external resources are loaded by the UI).
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:",
    });
    next();
  });

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ status: 'ok' }));
  api.get('/meta', (req, res) => res.json({ types: IDEA_TYPES }));

  api.get('/ideas', (req, res) => {
    const { q, tag, type, sort } = req.query;
    res.json(store.list({ q, tag, type, sort }));
  });
  api.post('/ideas', (req, res) => res.status(201).json(store.create(req.body)));
  api.get('/ideas/:id', (req, res) => res.json(store.detail(req.params.id)));
  api.put('/ideas/:id', (req, res) => res.json(store.update(req.params.id, req.body)));
  api.delete('/ideas/:id', (req, res) => {
    store.remove(req.params.id);
    res.status(204).end();
  });

  api.get('/tags', (req, res) => res.json(store.tags()));
  api.get('/graph', (req, res) => res.json(store.graph()));
  api.get('/stats', (req, res) => res.json(store.stats()));
  api.get('/random', (req, res) => {
    const idea = store.random();
    if (!idea) return res.status(404).json({ error: 'The vault is empty' });
    res.json(idea);
  });

  api.get('/spark', (req, res) => {
    const spark = store.spark();
    if (!spark) return res.status(404).json({ error: 'Add at least two unconnected ideas to get a spark' });
    res.json(spark);
  });

  api.get('/export', (req, res) => {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="idea-vault-${stamp}.json"`);
    res.json(store.exportAll());
  });
  api.post('/import', (req, res) => res.json(store.importAll(req.body)));

  api.use((req, res) => res.status(404).json({ error: 'Unknown API route' }));

  app.use('/api', api);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Central error handler: known errors carry a status; everything else is a 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}

module.exports = { createApp };
