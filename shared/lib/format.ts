// ビルド環境（CI は UTC）に左右されないよう、日本時間で固定して表示する
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Tokyo",
});
const yearFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "Asia/Tokyo" });

/** 日付を「2026-09-10」（yyyy-MM-dd）の形で返す。日本時間で数える */
export function formatDate(iso: string): string {
  const parts = dateFormat.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 日時の年を「2026」の形で返す。日本時間で数える（UTC の 12/31 15:00 は翌年） */
export function formatYear(date: Date): string {
  return yearFormat.format(date);
}
