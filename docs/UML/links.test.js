'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractLinks, renameLinks, normaliseTags } = require('../src/links');

test('extractLinks finds unique [[wikilinks]] case-insensitively', () => {
  const body = 'See [[Atomic notes]] and [[ atomic notes ]] plus [[Zettelkasten]].';
  assert.deepEqual(extractLinks(body), ['Atomic notes', 'Zettelkasten']);
});

test('extractLinks ignores empty, nested and multi-line brackets', () => {
  assert.deepEqual(extractLinks('[[]] [[  ]] [[a\nb]] [[x[y]]'), []);
  assert.deepEqual(extractLinks(''), []);
  assert.deepEqual(extractLinks(undefined), []);
});

test('renameLinks rewrites only the matching title', () => {
  const body = 'Link [[Old idea]], [[old IDEA]] and [[Other]].';
  assert.equal(renameLinks(body, 'Old idea', 'New idea'), 'Link [[New idea]], [[New idea]] and [[Other]].');
});

test('normaliseTags cleans, lower-cases and de-duplicates', () => {
  assert.deepEqual(normaliseTags(['#Writing', 'writing', ' Big Ideas ', '', 42, null]), ['writing', 'big-ideas']);
  assert.deepEqual(normaliseTags('not-an-array'), []);
});
