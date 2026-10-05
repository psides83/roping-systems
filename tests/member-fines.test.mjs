import assert from 'node:assert/strict';
import test from 'node:test';
import { fineBalance, fineStatus, moneyInputCents } from '../src/lib/member-fines.ts';

const fine = (transactions = []) => ({ amountCents: 10000, transactions });
const transaction = (id, kind, amountCents, reversesId = null) => ({ id, kind, amountCents, reversesId });

test('fine amounts accept cents without silently rounding user input', () => {
  assert.equal(moneyInputCents('25.50'), 2550);
  assert.equal(moneyInputCents('25'), 2500);
  for (const value of ['0', '-5', '2.555', '1e3', '', '21474836.48']) assert.equal(moneyInputCents(value), null);
});
test('partial payments retain an outstanding balance', () => {
  const value = fine([transaction('p', 'payment', 2500)]);
  assert.equal(fineBalance(value), 7500);
  assert.equal(fineStatus(value), 'Partially settled');
});
test('waivers settle a fine and reversals restore its balance', () => {
  const value = fine([transaction('p', 'payment', 2500), transaction('w', 'waiver', 7500)]);
  assert.equal(fineBalance(value), 0);
  assert.equal(fineStatus(value), 'Settled');
  value.transactions.push(transaction('r', 'reversal', 7500, 'w'));
  assert.equal(fineBalance(value), 7500);
  value.transactions.push(transaction('p2', 'payment', 7500));
  assert.equal(fineStatus(value), 'Paid');
});
