import test from 'node:test';
import assert from 'node:assert/strict';
import { featureEnabled, producerFeatures } from '../src/lib/producer-features.ts';
test('features default on and explicit false hides only the chosen feature', () => {
  for (const {key} of producerFeatures) assert.equal(featureEnabled({}, key), true);
  assert.equal(featureEnabled({funds:false}, 'funds'), false);
  assert.equal(featureEnabled({funds:false}, 'dues'), true);
  assert.equal(featureEnabled({funds:false}, 'general'), true);
});
test('catalog keys are unique and never include core timing, entries, or permissions', () => {
  const keys = producerFeatures.map(f => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of ['timing','entries','permissions','payouts','templates']) assert.equal(keys.includes(key), false);
});
