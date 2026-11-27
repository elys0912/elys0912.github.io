// HTML の文字列を組むための、エスケープと属性の関数。サイトに依らない。
// ビルド（pages/・parts/）とブラウザ（client/）の両方から読むので、node: と process.env を使わない。

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

/** テキストと属性値のエスケープ（React と同じ 5 文字） */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** 属性（先頭に空白を付ける）。値は escapeHtml を通す。値が undefined なら出さない */
export function attr(name: string, value: string | undefined): string {
  return value === undefined ? "" : ` ${name}="${escapeHtml(value)}"`;
}

/** 属性を並べる。値が undefined の属性は出さない */
export function attrList(attrs: Record<string, string | undefined>): string {
  return Object.entries(attrs)
    .map(([name, value]) => attr(name, value))
    .join("");
}
