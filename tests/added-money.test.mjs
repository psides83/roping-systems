import assert from 'node:assert/strict';
import test from 'node:test';
import { addedMoneyFunds } from '../src/lib/added-money.ts';

const row = (key, collected, pending, label = key) => ({ fund_key: key, fund_label: label, collected_cents: collected, pending_cents: pending, paid_entries: 2 });
test('funds combine contributions without mixing classifications or producers', () => {
  const result = addedMoneyFunds([row('class-11', 1500, 500), row('general', 2000, 0), row('class-11', 3000, 1000), row('class-10', 1000, 0)]);
  assert.equal(result[0].key, 'general');
  const fund = result.find(item => item.key === 'class-11');
  assert.equal(fund.collected, 4500);
  assert.equal(fund.pending, 1500);
  assert.equal(fund.entries, 4);
  assert.equal(fund.rows.length, 2);
  assert.equal(result.length, 3);
});
test('reports keep pending money separate and accept database integer strings', () => {
  const result = addedMoneyFunds([row('handicap', '0', '1500', 'Breakaway / Handicap')]);
  assert.equal(result[0].collected, 0);
  assert.equal(result[0].pending, 1500);
  assert.deepEqual(addedMoneyFunds([]), []);
});
