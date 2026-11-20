'use strict';

/**
 * Loads a set of sample ideas so the app can be explored immediately.
 * Usage: npm run seed            (adds samples; skips titles that already exist)
 */
const path = require('path');
const { IdeaStore } = require('./store');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'ideas.json');
const store = new IdeaStore(DATA_FILE);

const samples = [
  {
    title: 'Zettelkasten method',
    type: 'literature',
    tags: ['writing', 'knowledge'],
    source: 'How to Take Smart Notes - Sonke Ahrens',
    body: 'Write one idea per note, in your own words, and link it to existing notes.\n\nThe value is in the **connections**, not the pile. See [[Atomic notes]] and [[Ideas compound when linked]].',
  },
  {
    title: 'Atomic notes',
    type: 'permanent',
    tags: ['knowledge', 'writing'],
    body: 'A note should hold exactly one idea so it can be reused in many contexts.\n\nSmall notes are easier to link than long documents. Related: [[Zettelkasten method]].',
  },
  {
    title: 'Ideas compound when linked',
    type: 'permanent',
    tags: ['personal', 'creativity'],
    body: 'An isolated idea is easily forgotten. Linked ideas resurface each other and combine into new ones.\n\nThis is why Idea Vault suggests connections. Example: [[Podcast about failed startups]] grew out of [[Newsletter for indie founders]].',
  },
  {
    title: 'Newsletter for indie founders',
    type: 'fleeting',
    tags: ['business', 'newsletter'],
    body: 'Weekly email: one teardown of a bootstrapped product + one lesson.\n\n- Monetise with sponsorships\n- Could reuse material for [[Podcast about failed startups]]',
  },
  {
    title: 'Podcast about failed startups',
    type: 'fleeting',
    tags: ['content', 'business'],
    body: 'Interview founders whose companies shut down. Focus on what they would do differently.',
  },
  {
    title: 'Short story: the library of lost ideas',
    type: 'fleeting',
    tags: ['story', 'creativity'],
    body: 'A librarian who catalogues every idea people forget. One day she finds her own.',
  },
  {
    title: 'Morning pages habit',
    type: 'literature',
    tags: ['personal', 'habits'],
    source: 'The Artist\'s Way - Julia Cameron',
    body: 'Three pages of longhand every morning to clear the mind. Good source of fleeting ideas to capture.',
  },
  {
    title: 'Voice memo to idea app',
    type: 'fleeting',
    tags: ['product', 'business'],
    body: 'Record a thought while walking; the app turns it into a note.\n\nCould feed ideas straight into a vault like [[Zettelkasten method]].',
  },
  {
    title: 'YouTube series: one idea a day',
    type: 'fleeting',
    tags: ['content', 'creativity'],
    body: 'Short daily videos explaining one interesting idea in 60 seconds.',
  },
];

let added = 0;
for (const s of samples) {
  if (store.findByTitle(s.title)) continue;
  store.create(s);
  added++;
}
console.log(`Seed complete: ${added} sample ideas added (${store.ideas.length} total) -> ${DATA_FILE}`);
