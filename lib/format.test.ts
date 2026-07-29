import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDate } from "./format.ts";

describe("formatDate", () => {
  test("日付をゼロ埋めの yyyy-MM-dd で返す", () => {
    assert.equal(formatDate("2026-09-01T00:00:00Z"), "2026-09-01");
  });

  test("日本時間で日付をまたぐ時刻は翌日として数える", () => {
    // UTC では 9/30 15:00、日本時間では 10/1 0:00
    assert.equal(formatDate("2026-09-30T15:00:00Z"), "2026-10-01");
  });
});
