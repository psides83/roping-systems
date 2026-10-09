import assert from "node:assert/strict";
import test from "node:test";
import { notificationPage } from "../src/lib/notifications.ts";

const notices = Array.from({ length: 65 }, (_, i) => ({
  id: String(i).padStart(3, "0"), revision: "v1", category: i % 2 ? "fine" : "entry",
  title: "Notice", body: "Details", href: "/roper", created_at: "2026-10-09T12:00:00Z", read: i < 10,
}));
test("notifications paginate deterministically without mutating the source", () => {
  const original = notices.map(item => item.id);
  const result = notificationPage(notices, { page: "2" });
  assert.equal(result.items.length, 30);
  assert.equal(result.items[0].id, "030");
  assert.equal(result.pageCount, 3);
  assert.equal(result.unread, 55);
  assert.deepEqual(notices.map(item => item.id), original);
});
test("notification filters combine category and unread status", () => {
  const result = notificationPage(notices, { category: "fine", status: "unread" });
  assert.equal(result.total, 27);
  assert.ok(result.items.every(item => item.category === "fine" && !item.read));
});
test("invalid and out-of-range pages remain safe", () => {
  assert.equal(notificationPage(notices, { page: "NaN" }).page, 1);
  assert.equal(notificationPage(notices, { page: "999" }).page, 3);
  assert.equal(notificationPage([], {}).pageCount, 1);
});
