import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildProducerArchive, safeArchivePath, redactExportValue } from "../src/lib/producer-export.ts";

const snapshot = {version:1,producer_id:"producer",snapshot_at:"2026-10-10T12:00:00Z",tables:{memberships:[{member_number:"125",notes:"=SUM(A1)",balance_cents:1200,profile_fields:{city:"Hamilton"}}],events:[]},counts:{memberships:1,events:0},assets:[],exclusions:["auth credentials"],redacted_fields:"Secrets excluded"};
test("archives contain lossless records, spreadsheet copies, and a manifest", () => {
  const zip=buildProducerArchive(snapshot,{"sponsor-logos/producer/logo.png":new Uint8Array([1,2,3])});
  const files=unzipSync(zip);
  assert.deepEqual(JSON.parse(strFromU8(files["records/memberships.json"])),snapshot.tables.memberships);
  assert.deepEqual(JSON.parse(strFromU8(files["records/events.json"])),[]);
  assert.match(strFromU8(files["spreadsheets/memberships.csv"]),/'=SUM\(A1\)/);
  assert.match(strFromU8(files["spreadsheets/memberships.csv"]),/1200/);
  assert.equal(JSON.parse(strFromU8(files["manifest.json"])).tables,undefined);
  assert.deepEqual(files["uploads/sponsor-logos/producer/logo.png"],new Uint8Array([1,2,3]));
});
test("unsafe archive paths and table names are rejected", () => {
  for(const path of ["../escape","a/../b","/absolute","a\\b","a//b","a/./b","a\u0000b"]) assert.equal(safeArchivePath(path),false);
  assert.equal(safeArchivePath("bucket/producer/logo.png"),true);
  assert.throws(()=>buildProducerArchive(snapshot,{"../escape":new Uint8Array()}),/Invalid uploaded file/);
  assert.throws(()=>buildProducerArchive({...snapshot,tables:{"../table":[]}},{}),/Invalid export table/);
});
test("nested audit snapshots do not retain security or account linkage fields", () => {
  assert.deepEqual(redactExportValue({before_data:{session_id:"lease",nested:[{token_hash:"hash",auth_user_id:"user",amount_cents:100}],name:"Roper"},after_data:{password:"private",email_attempt_id:"attempt",notes:"Paid"}}),{before_data:{nested:[{amount_cents:100}],name:"Roper"},after_data:{notes:"Paid"}});
});
