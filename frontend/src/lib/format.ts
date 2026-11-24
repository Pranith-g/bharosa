export const rupees = (n: number | null | undefined) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

/** Backend titles embed raw amounts ("Pay BESCOM bill ₹2392", "(≈₹180)"); the UI shows the amount on its own. */
export const cleanTitle = (t: string) =>
  t.replace(/\s*\(≈₹[\d,]+\)/g, "").replace(/\s*₹[\d,]+(?=\s|$|\))/g, "").replace(/\s{2,}/g, " ").trim();

/** Formats raw ₹1234 inside free text as ₹1,234. */
export const prettyMoney = (t: string) => t.replace(/₹(\d{4,})/g, (_, d: string) => rupees(Number(d)));

export const clock = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export function dayLabel(ts: number) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function minutesLeft(ts: number | null) {
  if (!ts) return null;
  return Math.max(0, Math.ceil((ts * 1000 - Date.now()) / 60000));
}

export const LANG_NAME: Record<string, string> = { kn: "Kannada", hi: "Hindi", en: "English" };
export const LANG_NATIVE: Record<string, string> = { kn: "ಕನ್ನಡ", hi: "हिन्दी", en: "English" };
export const LOCALE: Record<string, string> = { kn: "kn-IN", hi: "hi-IN", en: "en-IN" };
