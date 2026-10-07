import test from 'node:test';
import assert from 'node:assert/strict';
import { importDate, mapImportRows, suggestMapping } from '../src/lib/member-import.ts';

test('suggests columns without guessing classification assignments', () => {
  assert.equal(suggestMapping(['FIRST NAME', 'Member #', 'Class']).columns.firstName, '0');
  assert.equal(suggestMapping(['Class']).columns.classifications, undefined);
});
test('normalizes contacts and dates while preserving member number and blank fields', () => {
  const rows = [['Member #','First name','Last name','Phone','Gender','DOB','Email','City'], ['001','Jo','Smith','1 (254) 555-1234','F','12/31/2000','JO@example.com','']];
  const [row] = mapImportRows(rows, 0, suggestMapping(rows[0]), []);
  assert.deepEqual(row.errors, []);
  assert.equal(row.member.phone, '2545551234');
  assert.equal(row.member.gender, 'female');
  assert.equal(row.member.birthDate, '2000-12-31');
  assert.equal(row.member.memberNumber, '001');
  assert.equal(row.member.email, 'jo@example.com');
  assert.equal('city' in row.member, false);
});
test('flags every duplicate identity and preserves source row numbers', () => {
  const rows = [['Member #','First name','Last name'], ['1','Jo','Smith'], [], ['1','Jane','Smith']];
  const result = mapImportRows(rows, 0, suggestMapping(rows[0]), []);
  assert.deepEqual(result.map((row) => row.row), [2,4]);
  assert.ok(result.every((row) => row.errors.includes('Duplicate member number in this file')));
});
test('rejects invalid dates and unmapped classifications; accepts explicit division mappings', () => {
  const division = { id:'11111111-1111-4111-8111-111111111111',name:'Tie-down', classifications:[{id:'22222222-2222-4222-8222-222222222222',name:'#11.5'}] };
  const rows = [['Member #','First name','Last name','Class','DOB'],['1','Jo','Smith','11.5','02/30/2000']];
  const mapping = suggestMapping(rows[0]); mapping.columns[`class:${division.id}`]='3';
  assert.ok(mapImportRows(rows,0,mapping,[division])[0].errors.length >= 2);
  rows[1][4]='02/29/2000'; mapping.values[`class:${division.id}`]={'11.5':division.classifications[0].id};
  assert.deepEqual(mapImportRows(rows,0,mapping,[division])[0].errors,[]);
});
test('supports explicit day-first dates', () => assert.equal(importDate('31/12/2000','dmy'),'2000-12-31'));
