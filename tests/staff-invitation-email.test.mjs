import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffInvitationEmail } from '../src/lib/staff-invitation-email.ts';
test('email links to verified-email acceptance without a secret or recipient in the URL', () => {
  const email = staffInvitationEmail('Test Producer','admin','https://app.example.com','2026-10-13T12:00:00Z');
  assert.ok(email.text.includes('https://app.example.com/staff-invitations'));
  assert.ok(email.text.includes('Administrator'));
  assert.ok(email.text.includes('verify this email'));
});
test('subject strips line breaks and plain text does not interpret producer markup', () => {
  const email = staffInvitationEmail('<Example>\nProducer','viewer','https://app.example.com','2026-10-13T12:00:00Z');
  assert.ok(!email.subject.includes('\n'));
  assert.equal(email.html,undefined);
});
test('email URL rejects unsafe protocols but allows local previews', () => {
  assert.throws(() => staffInvitationEmail('Producer','owner','javascript:alert(1)','2026-10-13T12:00:00Z'));
  assert.throws(() => staffInvitationEmail('Producer','owner','http://public.example.com','2026-10-13T12:00:00Z'));
  assert.ok(staffInvitationEmail('Producer','owner','http://localhost:3005','2026-10-13T12:00:00Z').text.includes('Producer Owner'));
});
