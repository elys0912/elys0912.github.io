import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NAV_ITEMS, SITE_URL } from "./site.ts";

describe("SITE_URL", () => {
  test("https のオリジンだけ（パス、クエリ、フラグメントが無い）。パスがあると絶対 URL の解決がずれる", () => {
    assert.equal(SITE_URL.protocol, "https:");
    assert.equal(SITE_URL.pathname, "/");
    assert.equal(SITE_URL.search, "");
    assert.equal(SITE_URL.hash, "");
  });
});

describe("NAV_ITEMS", () => {
  test("href はサイト内のパスで、末尾が /", () => {
    for (const { href } of NAV_ITEMS) {
      assert.match(href, /^\/(?:[^/]+\/)*$/, href);
    }
  });
});
