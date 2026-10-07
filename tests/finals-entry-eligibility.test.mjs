import test from 'node:test';
import assert from 'node:assert/strict';
import { meetsFinalsEntryRequirements as qualifies, includeFinalsPositions } from '../src/lib/finals-entry-eligibility.ts';

const requirements={topPlaces:10,minimumRopings:5,earnedPositionPolicy:'none'};
test('earned positions bypass only the requirements selected by the producer',()=>{
  const row={rank:40,ropingsEntered:2,finalsPositions:1};
  assert.equal(qualifies(row,requirements),false);
  assert.equal(qualifies(row,{...requirements,earnedPositionPolicy:'rank'}),false);
  assert.equal(qualifies({...row,ropingsEntered:5},{...requirements,earnedPositionPolicy:'rank'}),true);
  assert.equal(qualifies(row,{...requirements,earnedPositionPolicy:'rank_and_attendance'}),true);
  assert.equal(qualifies({...row,finalsPositions:0},{...requirements,earnedPositionPolicy:'rank_and_attendance'}),false);
  assert.equal(qualifies(undefined,requirements),false);
});
test('members without standings get earned positions without fabricated attendance or rank',()=>{
  const result=includeFinalsPositions([], [{memberId:'m',classId:'11',positions:2},{memberId:'m',classId:'10',positions:3}], [{memberId:'m',roperId:'r'}], '11');
  assert.equal(result.length,1); assert.equal(result[0].finalsPositions,2);
  assert.equal(result[0].ropingsEntered,0); assert.equal(result[0].rank,Number.MAX_SAFE_INTEGER);
});
