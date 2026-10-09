import test from "node:test";
import assert from "node:assert/strict";
import { eventInformationSchema, emptyEventInformation, eventMapLinks } from "../src/lib/events/event-information.ts";

test("optional event information accepts empty fields and legitimate flyer links", () => {
  assert.ok(eventInformationSchema.safeParse(emptyEventInformation).success);
  assert.ok(eventInformationSchema.safeParse({ ...emptyEventInformation, flyer_url: "https://example.com/flyer.pdf", contact_phone: "(254) 555-1234", contact_email: "office@example.com" }).success);
});
test("event information rejects unsafe links, malformed contact details and oversized notes", () => {
  for (const flyer_url of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com", "/flyer.pdf"])
    assert.equal(eventInformationSchema.safeParse({ ...emptyEventInformation, flyer_url }).success, false);
  for (const patch of [{ contact_phone: "123" }, { contact_email: "not-an-email" }, { directions: "a".repeat(4001) }])
    assert.equal(eventInformationSchema.safeParse({ ...emptyEventInformation, ...patch }).success, false);
});
test("directions links encode the full address and omit empty locations", () => {
  assert.equal(eventMapLinks(" "), null);
  const maps = eventMapLinks("4007 W Highway 36, Hamilton, TX 76531");
  assert.equal(new URL(maps.google).searchParams.get("destination"), "4007 W Highway 36, Hamilton, TX 76531");
  assert.equal(new URL(maps.apple).searchParams.get("daddr"), "4007 W Highway 36, Hamilton, TX 76531");
});
