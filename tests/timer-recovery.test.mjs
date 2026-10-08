import test from "node:test";
import assert from "node:assert/strict";
import { draftKey, parseTimerDraft, readTimerDraft, writeTimerDraft, removeConfirmedDraft, eventTimerDrafts } from "../src/lib/events/timer-drafts.ts";
import { submitTimerResult, timerSubmissionData } from "../src/lib/events/submit-timer-result.ts";

class Storage {
  records = new Map();
  get length() { return this.records.size; }
  key(index) { return [...this.records.keys()][index] ?? null; }
  getItem(key) { return this.records.get(key) ?? null; }
  setItem(key,value) { this.records.set(key,value); }
  removeItem(key) { this.records.delete(key); }
}
const draft = { version: 1, userId: "staff-a", eventId: "event-a", ropingId: "roping-a", round: 2, runId: "run-a", name: "Austin Foster", rerunCount: 0, recordedAt: null, times: ["12.31", "12.35"], penalties: ["calf-down"], updatedAt: 1000,
  submission: { id: "request-a", outcome: "complete", uncertain: true } };

test("Timer readings and penalty selections survive a fresh storage read", () => {
  const storage = new Storage();
  const key = draftKey(draft.userId,draft.eventId,draft.runId,0);
  writeTimerDraft(storage,key,draft);
  assert.deepEqual(readTimerDraft(storage,key),draft);
});
test("Draft keys isolate staff, events, runs, and rerun attempts", () => {
  assert.equal(new Set([draftKey("a","b","c",0),draftKey("d","b","c",0),draftKey("a","d","c",0),draftKey("a","b","d",0),draftKey("a","b","c",1)]).size,5);
});
test("Pending recovery lists never include another staff member or event", () => {
  const storage = new Storage();
  for (const row of [draft,{ ...draft, userId: "other" },{ ...draft, eventId: "other" },{ ...draft, runId: "only-draft", submission: undefined }]) writeTimerDraft(storage,draftKey(row.userId,row.eventId,row.runId,0),row);
  assert.equal(eventTimerDrafts(storage,"staff-a","event-a").length,1);
});
test("Only acknowledgment of the matching submission clears its draft", () => {
  const storage = new Storage(); const key=draftKey("staff-a","event-a","run-a",0);
  writeTimerDraft(storage,key,draft);
  assert.equal(removeConfirmedDraft(storage,key,"older-request"),false);
  assert.ok(readTimerDraft(storage,key));
  assert.equal(removeConfirmedDraft(storage,key,"request-a"),true);
  assert.equal(readTimerDraft(storage,key),null);
});
test("Malformed device data is not restored as timer input", () => {
  for (const value of ["{", "null", JSON.stringify({ ...draft, times: [4] }), JSON.stringify({ ...draft, submission: { id: "x", outcome: "invalid", uncertain: true } }), JSON.stringify({ ...draft, rerunCount: -1 })]) assert.equal(parseTimerDraft(value),null);
});
test("Storage failures are not mislabeled as successful persistence", () => {
  assert.throws(() => writeTimerDraft({ setItem() { throw new Error("Quota exceeded"); } },"key",draft),/Quota exceeded/);
});
test("Retry uses the original submission and readings with the current timing session", () => {
  const data=timerSubmissionData(draft,"new-session");
  assert.equal(data.get("submissionId"),"request-a");
  assert.equal(data.get("timingSessionId"),"new-session");
  assert.equal(data.get("expectedRerunCount"),"0");
  assert.equal(data.get("expectedRecordedAt"),"");
  assert.deepEqual(data.getAll("timerReading"),["12.31","12.35"]);
  assert.deepEqual(data.getAll("penaltyId"),["calf-down"]);
});
test("Non-time retries retain the originally selected outcome", () => {
  assert.equal(timerSubmissionData({ ...draft, submission: { ...draft.submission, outcome: "turned_out" } },"session").get("status"),"turned_out");
});
test("Server acknowledgment is required before reporting a successful save", async () => {
  const result=await submitTimerResult("event","run",new FormData(),async () => Response.json({ success: true, message: "Saved to server" }));
  assert.equal(result.success,true);
  const malformed=await submitTimerResult("event","run",new FormData(),async () => Response.json({ anything: true }));
  assert.equal(malformed.uncertain,true);
});
test("Dropped connections preserve an unconfirmed submission for safe retry", async () => {
  const result=await submitTimerResult("event","run",new FormData(),async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(result.uncertain,true); assert.notEqual(result.success,true);
  assert.match(result.message,/draft is kept on this device/);
});
test("Slow saves time out without claiming that the server did not save", async () => {
  const result=await submitTimerResult("event","run",new FormData(),async (_,options) => new Promise((_,reject) => options.signal.addEventListener("abort",() => reject(new Error("Aborted")))),5);
  assert.equal(result.uncertain,true); assert.match(result.message,/Save not confirmed/);
});
test("Validation errors and expired sign-ins remain distinct from successful saves", async () => {
  const rejected=await submitTimerResult("event","run",new FormData(),async () => Response.json({ success: false, message: "Timing control lost" }));
  assert.equal(rejected.success,false); assert.equal(rejected.uncertain,undefined);
  const signedOut=await submitTimerResult("event","run",new FormData(),async () => new Response(null,{ status: 401 }));
  assert.equal(signedOut.uncertain,true); assert.match(signedOut.message,/Sign in again/);
});
