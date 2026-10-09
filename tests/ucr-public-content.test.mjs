import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rulesDocumentSchema, rulesPublishErrors } from '../src/lib/producer-rules.ts';

const fixture = JSON.parse(readFileSync(new URL('../supabase/tests/fixtures/ucr-public-content.json', import.meta.url), 'utf8'));
const documents = [fixture.rules, ...fixture.bulletins.map(item => item.document)];
const normalize = text => text.replace(/\\([\\`*_{}\[\]<>#])/g, '$1').replace(/\s+/g, ' ').trim();

test('full supplied rules and announcements are publishable', () => {
  for (const document of documents) {
    rulesDocumentSchema.parse(document);
    assert.deepEqual(rulesPublishErrors(document), []);
  }
});

test('every supplied substantive text block is retained verbatim', () => {
  const text = normalize(documents.map(document => [document.title, ...document.sections.flatMap(section => [section.title, section.content, ...section.subsections.flatMap(child => [child.title, child.content])])].join('\n')).join('\n'));
  for (const section of fixture.sourceBlocks) {
    for (const block of section.blocks) assert.ok(text.includes(normalize(block.text)), `Missing source text: ${block.text}`);
  }
});

test('rules do not invent an effective date and news identifies its import date', () => {
  assert.equal(fixture.rules.effectiveOn, '');
  for (const { document } of fixture.bulletins) assert.match(document.introduction, /not an original announcement date/);
});
