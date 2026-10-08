// shared-with-blog.txt に並べたファイル（共有元のリポジトリから 1 バイトも変えずにコピーした共有部品）が、
// 一覧の外のファイルと、package.json に入れていないパッケージに依存していないことを確かめる。
// 共有部品と shared-with-blog.txt は共有元と同期するので、このリポジトリでは直さない（直すときは共有元で直して同期する）。
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST_FILE = path.join(ROOT, "shared-with-blog.txt");

/** 共有部品が import してよいパッケージ。共有元の一覧と同じにし、すべて package.json に入れる（下のテストで確かめる） */
const ALLOWED_PACKAGES = new Set([
  "next",
  "react",
  "@marp-team/marp-core",
  "unified",
  "remark-parse",
  "remark-gfm",
  "remark-rehype",
  "rehype-sanitize",
  "rehype-stringify",
  // 型だけ（@types/hast）
  "hast",
]);

function readList() {
  return readFileSync(LIST_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** url() のうち、ファイルへの依存ではないもの（data:、外部の URL、ページ内の #） */
const NON_FILE_URL = /^(?:data:|https?:|\/\/|#)/i;

/** ./ も / も付かない相対パス（CSS の url(x.png)、reference の path="x.d.ts"）に ./ を補う */
function asRelative(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/") ? specifier : `./${specifier}`;
}

/**
 * import / export ... from、動的 import、副作用の import、require、/// <reference path>、
 * CSS の @import と url() の指定子を拾う（同じ指定子は 1 つにまとめる）。
 * テンプレート文字列の import(`…`) / require(`…`) は、${…} を含んだまま返す（解決できないものとして扱う）
 */
function importSpecifiers(source) {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\b(?:import|require)\s*\(\s*`([^`]*)`/g,
    // @import url(…) は下の url() で拾う
    /@import\s+(?!url\()["']?([^"')\s;]+)/g,
  ];
  const specifiers = patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
  for (const match of source.matchAll(/\/\/\/\s*<reference\s+path\s*=\s*["']([^"']+)["']/g)) {
    specifiers.push(asRelative(match[1]));
  }
  // 引用符あり・なしの両方。CSS のコメントの中の url( も拾うが、失敗する側に倒れるだけなので許す
  for (const match of source.matchAll(/\burl\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
    if (!NON_FILE_URL.test(match[1])) specifiers.push(asRelative(match[1]));
  }
  return [...new Set(specifiers)];
}

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** ./x や @/x を、拡張子を補ってファイルに解決し、リポジトリのルートからの相対パス（/ 区切り）で返す */
function resolveLocal(fromFile, specifier) {
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : path.join(path.dirname(path.join(ROOT, fromFile)), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return found && path.relative(ROOT, found).split(path.sep).join("/");
}

describe("shared-with-blog.txt", () => {
  const list = readList();
  const listed = new Set(list);

  test("並べたファイルがすべてあり、重複が無い", () => {
    assert.ok(list.length > 0);
    assert.equal(listed.size, list.length);
    for (const file of list) {
      assert.ok(existsSync(path.join(ROOT, file)), `${file} がありません`);
    }
  });

  test("指定子の抽出の検算（PostDetail.tsx の既知の import を拾う）", () => {
    const specifiers = importSpecifiers(readFileSync(path.join(ROOT, "components/PostDetail.tsx"), "utf8"));
    for (const expected of ["next/link", "@/lib/markdown", "./MarpDeck", "./PostDetail.module.css"]) {
      assert.ok(specifiers.includes(expected), `${expected} を拾えていません: ${specifiers.join(", ")}`);
    }
  });

  test("import してよいパッケージが、すべて package.json にある（型だけのものは @types/ の名前で）", () => {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const declared = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)]);
    const missing = [...ALLOWED_PACKAGES].filter((name) => !declared.has(name) && !declared.has(`@types/${name}`));
    assert.deepEqual(missing, []);
  });

  test("一覧の外のファイルと、許可していないパッケージを import しない", () => {
    const problems = [];
    for (const file of list) {
      for (const specifier of importSpecifiers(readFileSync(path.join(ROOT, file), "utf8"))) {
        if (specifier.includes("${")) {
          problems.push(`${file}: ${specifier} は動的な指定子で、解決できません`);
        } else if (specifier.startsWith("/")) {
          // public の資産はサイトごとに違うので、共有部品からは参照しない
          problems.push(`${file}: ${specifier} は public への絶対パスで、一覧の外に依存しています`);
        } else if (specifier.startsWith(".") || specifier.startsWith("@/")) {
          const resolved = resolveLocal(file, specifier);
          if (!resolved) problems.push(`${file}: ${specifier} を解決できません`);
          else if (!listed.has(resolved)) {
            problems.push(`${file}: ${specifier}（${resolved}）が一覧にありません`);
          }
        } else if (!specifier.startsWith("node:") && !ALLOWED_PACKAGES.has(packageName(specifier))) {
          problems.push(`${file}: パッケージ ${specifier} は ALLOWED_PACKAGES にありません`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });
});
