'use strict';

const path = require('path');
const { createApp } = require('./app');
const { IdeaStore } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'ideas.json');

const store = new IdeaStore(DATA_FILE);
const app = createApp(store);

app.listen(PORT, HOST, () => {
  console.log(`Idea Vault running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE} (${store.ideas.length} ideas loaded)`);
});
