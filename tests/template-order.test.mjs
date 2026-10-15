import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceTemplateGroupOrder, moveTemplate } from '../src/lib/template-order.ts';
test('division reorder preserves every other division and submits the complete template list', () => {
 const all = ['tie-a', 'break-a', 'tie-b', 'break-b', 'tie-c'];
 assert.deepEqual(replaceTemplateGroupOrder(all, ['tie-c', 'tie-a', 'tie-b']), ['tie-c', 'break-a', 'tie-a', 'break-b', 'tie-b']);
 assert.deepEqual(replaceTemplateGroupOrder(all, ['break-b', 'break-a']), ['tie-a', 'break-b', 'tie-b', 'break-a', 'tie-c']);
 assert.deepEqual(all, ['tie-a', 'break-a', 'tie-b', 'break-b', 'tie-c']);
});
test('keyboard movement supports first-to-last and adjacent moves without dropping templates', () => {
 assert.deepEqual(moveTemplate(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a']);
 assert.deepEqual(moveTemplate(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
 assert.deepEqual(moveTemplate(['a', 'b', 'c'], 'b', 'c'), ['a', 'c', 'b']);
 assert.deepEqual(moveTemplate(['a', 'b'], 'missing', 'b'), ['a', 'b']);
});
