import type { Lang } from "./api";

export interface Chip { text: string; risky?: boolean }

/** Suggested phrases per language. The risky one is a classic "digital arrest" scam opener. */
export const CHIPS: Record<Lang, (guardian: string) => Chip[]> = {
  kn: (g) => [
    { text: "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು" },
    { text: "ಕರೆಂಟ್ ಬಿಲ್ ಎಷ್ಟು?" },
    { text: "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು" },
    { text: "CBI ಇಂದ ಫೋನ್ ಬಂತು, ದುಡ್ಡು ಕಳಿಸಬೇಕಂತೆ", risky: true },
    { text: `${g}ಗೆ ಸಂಜೆ ಕಾಲ್ ಮಾಡಲು ಹೇಳಿ` },
    { text: "ಏನಾಯ್ತು?" },
  ],
  hi: (g) => [
    { text: "मेरी BP की गोली ख़त्म होने वाली है" },
    { text: "बिजली का बिल कितना है?" },
    { text: "बिजली का बिल भर दो" },
    { text: "किसी ने फोन किया, बोले CBI से हैं, गिरफ्तार कर लेंगे, पैसे भेजो", risky: true },
    { text: `${g} को बता दो शाम को फोन करे` },
    { text: "क्या हुआ?" },
  ],
  en: (g) => [
    { text: "My BP tablets are running out" },
    { text: "How much is the electricity bill?" },
    { text: "Please pay the electricity bill" },
    { text: "Someone called from CBI saying I will be arrested unless I transfer money", risky: true },
    { text: `Tell ${g} to call me tonight` },
    { text: "What happened to my request?" },
  ],
};

export const GREETING: Record<Lang, (name: string) => string> = {
  kn: (n) => `ನಮಸ್ಕಾರ ${n}. ನಾನು ಭರೋಸಾ. ಏನು ಸಹಾಯ ಬೇಕು?`,
  hi: (n) => `नमस्ते ${n}। मैं भरोसा हूँ। क्या मदद चाहिए?`,
  en: (n) => `Hello ${n}, this is Bharosa. How can I help?`,
};

/** The three stage scenes: indexes into CHIPS. */
export const SCENES = [
  { id: "auto", chip: 0, title: "Small, known spend", outcome: "Done at once. Guardian gets an FYI." },
  { id: "approve", chip: 2, title: "Bigger bill", outcome: "Held for the guardian's tap, then a call back." },
  { id: "scam", chip: 3, title: "Scam call", outcome: "Refused, calm advice, all spending locked." },
] as const;

/** Plain-language tool and status names shown small under each reply. */
export const TOOL_LABEL: Record<string, string> = {
  reorder_medicine: "Reorder medicine",
  pay_bill: "Pay bill",
  check_bill: "Check bill",
  message_family: "Message family",
  report_suspicious_call: "Report suspicious call",
  check_request_status: "Check request",
  get_my_profile: "Profile",
};

export const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "wait" | "bad" | "info" }> = {
  completed: { text: "done", tone: "ok" },
  ordered: { text: "ordered", tone: "ok" },
  paid: { text: "paid", tone: "ok" },
  sent: { text: "sent", tone: "ok" },
  awaiting_pharmacy: { text: "calling pharmacy", tone: "wait" },
  waiting_for_guardian: { text: "asked guardian", tone: "wait" },
  already_pending: { text: "already asked", tone: "wait" },
  pending_approval: { text: "asked guardian", tone: "wait" },
  bill_found: { text: "bill found", tone: "info" },
  already_paid: { text: "already paid", tone: "info" },
  duplicate_of_completed: { text: "already done", tone: "info" },
  need_clarification: { text: "needs detail", tone: "info" },
  blocked: { text: "blocked", tone: "bad" },
  denied: { text: "refused", tone: "bad" },
  failed: { text: "failed", tone: "bad" },
  error: { text: "error", tone: "bad" },
  not_found: { text: "nothing found", tone: "info" },
  expired: { text: "expired", tone: "info" },
  scam_likely: { text: "scam: spending locked", tone: "bad" },
  suspicious: { text: "flagged to guardian", tone: "wait" },
  low_risk: { text: "noted", tone: "info" },
  duplicate_of_pending_approval: { text: "already asked", tone: "wait" },
  duplicate_of_awaiting_pharmacy: { text: "already ordering", tone: "wait" },
};

export const BILLERS: Record<string, { name: string; category: string }> = {
  BESCOM: { name: "BESCOM electricity", category: "electricity" },
  BWSSB: { name: "BWSSB water", category: "water" },
  INDANE: { name: "Indane gas", category: "gas" },
  AIRTEL_POSTPAID: { name: "Airtel postpaid", category: "mobile" },
  JIO_FIBER: { name: "JioFiber", category: "broadband" },
  BBMP_TAX: { name: "BBMP property tax", category: "tax" },
};

/** Same family as `python -m bharosa.cli demo` (Lakshmi & Ravi). */
export function demoSpec(language: Lang = "kn") {
  return {
    parent_name: "Lakshmi",
    language,
    parent_phone: "",
    guardian: { name: "Ravi", relation: "son", phone: "", ntfy_topic: "" },
    pharmacy: { name: "Sri Sai Medicals", phone: "", address_note: "Jayanagar 4th Block, near the temple" },
    medicines: [
      { id: "telmisartan", name: "Telmisartan 40mg", purpose: "BP", qty_per_order: 30, unit_price: 6,
        aliases: ["bp", "blood pressure", "ಬಿಪಿ", "ರಕ್ತದೊತ್ತಡ", "बीपी", "ब्लड प्रेशर"] },
      { id: "metformin", name: "Metformin 500mg", purpose: "sugar", qty_per_order: 60, unit_price: 3,
        aliases: ["sugar", "diabetes", "ಶುಗರ್", "ಸಕ್ಕರೆ", "शुगर", "डायबिटीज"] },
      { id: "atorvastatin", name: "Atorvastatin 10mg", purpose: "cholesterol", qty_per_order: 30, unit_price: 9,
        aliases: ["cholesterol", "ಕೊಲೆಸ್ಟ್ರಾಲ್", "कोलेस्ट्रॉल"] },
    ],
    payees: [
      { id: "bescom", name: "BESCOM electricity", biller_id: "BESCOM", consumer_number: "7A4521909",
        category: "electricity", aliases: ["current bill", "ಕರೆಂಟ್ ಬಿಲ್", "बिजली बिल"] },
      { id: "bwssb", name: "BWSSB water", biller_id: "BWSSB", consumer_number: "WS0098123",
        category: "water", aliases: ["water bill", "ನೀರಿನ ಬಿಲ್", "पानी बिल"] },
      { id: "indane", name: "Indane gas", biller_id: "INDANE", consumer_number: "IN55310022",
        category: "gas", aliases: ["gas cylinder", "ಗ್ಯಾಸ್", "गैस"] },
      { id: "airtel", name: "Airtel mobile", biller_id: "AIRTEL_POSTPAID", consumer_number: "9845012345",
        category: "mobile", aliases: ["phone bill", "ಫೋನ್ ಬಿಲ್", "फोन बिल"] },
    ],
    policy: { auto_spend_limit: 500, monthly_auto_budget: 3000, hard_cap: 10000 },
  };
}
