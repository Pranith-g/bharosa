// Typed client for the frozen Bharosa HTTP API (README §4). Additive changes only.

export type Lang = "kn" | "hi" | "en";
export type ActionStatus =
  | "pending_approval" | "awaiting_pharmacy" | "completed" | "denied" | "blocked" | "failed" | "expired";
export type Severity = "info" | "success" | "warning" | "urgent";

export interface Medicine { id: string; name: string; purpose: string; aliases: string[]; qty_per_order: number; unit_price: number }
export interface Payee { id: string; name: string; biller_id: string; consumer_number: string; category: string; aliases: string[] }
export interface Guardian { name: string; relation: string; phone: string; ntfy_topic: string }
export interface Pharmacy { name: string; phone: string; address_note: string }
export interface Household {
  id: string; parent_name: string; parent_language: Lang; parent_phone: string;
  guardian: Guardian; pharmacy: Pharmacy; medicines: Medicine[]; payees: Payee[]; created_at: number;
}
export interface Policy {
  auto_spend_limit: number; monthly_auto_budget: number; hard_cap: number;
  approval_ttl_minutes: number; scam_lock_minutes: number; frozen: boolean; scam_locked_until: number | null;
}
export interface Decision { outcome: string; tier: string; reasons: string[]; triggers_scam_lock: boolean }
export interface Action {
  id: string; household_id: string; kind: "medicine_order" | "bill_payment" | "family_message" | "scam_report";
  title: string; amount: number; target: string; details: Record<string, unknown>; parent_said: string;
  risk_score: number; risk_signals: string[]; decision: Decision | null; status: ActionStatus;
  decided_by: string | null; result: Record<string, unknown>; created_at: number; updated_at: number; expires_at: number | null;
}
export interface BEvent {
  id: string; household_id: string; ts: number; type: string; summary: string; severity: Severity;
  action_id: string | null; data: Record<string, unknown>;
}
export interface DashboardState {
  household: Household; policy: Policy; spent_this_month: number; scam_lock_minutes_left: number;
  pending: Action[]; recent: Action[]; events: BEvent[];
}
export interface ConnectInfo { base_url: string; elevenlabs_agent_id: string; pharmacy_channel: string; callback_channel: string }
export interface ApprovalInfo {
  parent: string; guardian: string; title: string; amount: number; status: ActionStatus; parent_said: string;
  reasons: string[]; risk_score: number; risk_signals: string[]; created_at: number; expires_at: number | null;
  receipt?: string | null;
}
export interface SimSayResult {
  tool: string | null; reply: string;
  result: { status?: string; say_to_parent?: string; request_id?: string; [k: string]: unknown };
}
export interface SimState {
  parent_name: string; language: Lang; guardian: string; medicines: string[]; bills: string[];
  elevenlabs_agent_id: string; callbacks: { id: string; ts: number; message: string }[];
}
export interface CreatedHousehold {
  household_id: string; parent_key: string; guardian_key: string;
  parent_mcp_url: string; guardian_mcp_url: string; guardian_dashboard: string; parent_simulator: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

interface ReqOpts { method?: string; body?: unknown; key?: string; headers?: Record<string, string> }

export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (opts.key) headers["X-Bharosa-Key"] = opts.key;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || "GET", headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Bharosa. Check the connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : res.statusText || "Request failed");
  }
  return data as T;
}

export const guardianApi = (key: string) => ({
  state: () => request<DashboardState>("/api/state", { key }),
  approve: (id: string) => request<{ ok: boolean; status: string }>(`/api/actions/${id}/approve`, { method: "POST", key }),
  deny: (id: string) => request<{ ok: boolean; status: string }>(`/api/actions/${id}/deny`, { method: "POST", key }),
  patchPolicy: (patch: Partial<Policy>) => request<Policy>("/api/policy", { method: "PATCH", body: patch, key }),
  clearLock: () => request<{ ok: boolean }>("/api/scam-lock/clear", { method: "POST", key }),
  putProfile: (patch: Partial<Household>) => request<Household>("/api/profile", { method: "PUT", body: patch, key }),
  connect: () => request<ConnectInfo>("/api/connect", { key }),
});

export const parentApi = (key: string) => ({
  say: (text: string) => request<SimSayResult>("/api/sim/say", { method: "POST", body: { text }, key }),
  state: () => request<SimState>("/api/sim/state", { key }),
});

export const createHousehold = (body: unknown, adminToken?: string) =>
  request<CreatedHousehold>("/api/households", {
    method: "POST", body, headers: adminToken ? { "X-Admin-Token": adminToken } : {},
  });
