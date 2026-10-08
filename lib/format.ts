// ビルド環境（CI は UTC）に左右されないよう、日本時間で固定して表示する
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Tokyo",
});

/** 日付を「2026-09-10」（yyyy-MM-dd）の形で返す。日本時間で数える */
export function formatDate(iso: string): string {
  const parts = dateFormat.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
