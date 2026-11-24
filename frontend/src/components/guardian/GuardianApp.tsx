import { forwardRef, useCallback, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { CircleCheckBig, History, House, LogOut, Plug, SlidersHorizontal, Users, Wallet } from "lucide-react";
import { ApiError, guardianApi, type ConnectInfo, type DashboardState, type Household, type Policy } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { useToast } from "../Toast";
import { Card, Logo, SectionTitle, Spinner } from "../ui";
import { ApprovalCard } from "./ApprovalCard";
import { ConnectPanel } from "./ConnectPanel";
import { LimitsEditor } from "./LimitsEditor";
import { ProfileEditor } from "./ProfileEditor";
import { LockBox, PauseToggle, ScamBanner, SpendBar, StatusPill } from "./Safety";
import { Timeline } from "./Timeline";

type Tab = "home" | "activity" | "limits" | "family" | "connect";
const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "activity", label: "Activity", icon: History },
  { id: "limits", label: "Limits", icon: SlidersHorizontal },
  { id: "family", label: "Family", icon: Users },
  { id: "connect", label: "Connect", icon: Plug },
];

export interface GuardianHandle { apiKey: string; pendingCount: () => number; approveFirst: () => Promise<boolean>; refresh: () => void }

export const GuardianApp = forwardRef<GuardianHandle, {
  apiKey: string; compact?: boolean; onUnauthorized?: () => void; onForget?: () => void;
}>(function GuardianApp({ apiKey, compact, onUnauthorized, onForget }, ref) {
  const api = useMemo(() => guardianApi(apiKey), [apiKey]);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("home");
  const [hidden, setHidden] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [connect, setConnect] = useState<ConnectInfo | null>(null);

  const load = useCallback(async () => {
    try {
      return await api.state();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized?.();
      throw e;
    }
  }, [api, onUnauthorized]);
  const { data: st, error, refresh } = usePoll<DashboardState>(load, 3000);

  const decide = useCallback(async (id: string, d: "approve" | "deny") => {
    setHidden((h) => ({ ...h, [id]: true }));   // optimistic: the card leaves at once
    try {
      const r = d === "approve" ? await api.approve(id) : await api.deny(id);
      toast(d === "deny" ? "Declined. They'll get a call back."
        : r.status === "awaiting_pharmacy" ? "Approved. Calling the pharmacy now."
          : "Approved and done. A call back is on its way.", d === "approve" ? "ok" : "info");
    } catch (e) {
      setHidden((h) => { const n = { ...h }; delete n[id]; return n; });
      toast(`Not done: ${(e as Error).message}`, "bad");
    }
    refresh();
  }, [api, toast, refresh]);

  const pending = (st?.pending || []).filter((a) => !hidden[a.id]);

  useImperativeHandle(ref, () => ({
    apiKey,
    pendingCount: () => pending.length,
    approveFirst: async () => {
      const first = pending[0];
      if (!first) return false;
      setTab("home");
      await decide(first.id, "approve");
      return true;
    },
    refresh,
  }), [apiKey, pending, decide, refresh]);

  const run = async (label: string, fn: () => Promise<unknown>, okMsg: string): Promise<boolean> => {
    setBusy(label);
    try { await fn(); toast(okMsg, "ok"); return true; }
    catch (e) { toast((e as Error).message, "bad"); return false; }
    finally { setBusy(null); refresh(); }
  };

  if (!st) return error ? <div className="p-8 text-center text-danger">{error.message}</div> : <Spinner label="Loading the dashboard" />;
  const hh = st.household;

  const openTab = (t: Tab) => {
    setTab(t);
    if (t === "connect" && !connect) api.connect().then(setConnect).catch(() => {});
  };

  const nav = (where: "top" | "bottom") => (
    <nav aria-label="Sections"
      className={where === "top"
        ? "mx-auto hidden w-full max-w-5xl gap-1 px-5 pt-1 md:flex"
        : `${compact ? "flex" : "flex md:hidden"} border-t border-line bg-card/95 px-1 backdrop-blur`}
      style={where === "bottom" && !compact ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const on = tab === id;
        const badge = id === "home" && pending.length > 0;
        return where === "top" ? (
          <button key={id} onClick={() => openTab(id)} aria-current={on ? "page" : undefined}
            className={`relative flex items-center gap-2 rounded-t-2xl px-4 py-3 text-[15px] font-semibold transition-colors ${on ? "bg-paper text-ink" : "text-white/80 hover:text-white"}`}>
            <Icon size={18} /> {label}
            {badge && <span className="rounded-full bg-saffron px-1.5 text-xs font-bold text-ink num">{pending.length}</span>}
          </button>
        ) : (
          <button key={id} onClick={() => openTab(id)} aria-current={on ? "page" : undefined}
            className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[12px] font-semibold ${on ? "text-brand" : "text-muted"}`}>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${on ? "bg-brand-tint" : ""}`}><Icon size={20} /></span>
            {label}
            {badge && <span className="absolute right-[calc(50%-22px)] top-2 size-2.5 rounded-full bg-saffron ring-2 ring-card" />}
          </button>
        );
      })}
    </nav>
  );

  const savePolicy = (p: Partial<Policy>) => run("policy", () => api.patchPolicy(p), "Limits saved");
  const saveProfile = (p: Partial<Household>) => run("profile", () => api.putProfile(p), "Profile saved");

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper" data-testid="guardian-app">
      <header className="bg-brand text-white" style={compact ? undefined : { paddingTop: "env(safe-area-inset-top)" }}>
        <div className={`mx-auto flex w-full max-w-5xl items-center gap-3 ${compact ? "px-4 pb-3 pt-8" : "px-5 py-3.5"}`}>
          {!compact && <div className="hidden sm:block"><Logo light small /></div>}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-semibold">{hh.guardian.name}</div>
            <div className="truncate text-[13px] text-white/75">looking after {hh.parent_name}</div>
          </div>
          <div className="ml-auto"><StatusPill state={st} /></div>
        </div>
        {!compact && nav("top")}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full max-w-5xl space-y-4 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
          {tab === "home" && (
            <>
              <ScamBanner state={st} onAddPhone={() => openTab("family")} />
              <div className={compact ? "space-y-4" : "grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]"}>
                <div className="space-y-4 lg:col-start-1">
                  {pending.length ? (
                    pending.map((a) => (
                      <ApprovalCard key={a.id} action={a} parentName={hh.parent_name} lang={hh.parent_language} compact={compact}
                        onDecide={decide} />
                    ))
                  ) : (
                    <Card className="flex items-center gap-4">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ok-tint text-ok"><CircleCheckBig /></span>
                      <div>
                        <h2 className="text-lg font-bold">Nothing waiting for you</h2>
                        <p className="text-[15px] text-muted">Small, known spends happen on their own. Anything bigger lands here.</p>
                      </div>
                    </Card>
                  )}
                </div>
                <div className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
                  <PauseToggle frozen={st.policy.frozen} busy={busy === "freeze"}
                    onToggle={() => run("freeze", () => api.patchPolicy({ frozen: !st.policy.frozen }), st.policy.frozen ? "Spending resumed" : "All spending paused")} />
                  <LockBox minutes={st.scam_lock_minutes_left} busy={busy === "lock"}
                    onLift={() => run("lock", () => api.clearLock(), "Scam lock lifted")} />
                  <Card>
                    <SectionTitle icon={<Wallet size={20} />}>This month</SectionTitle>
                    <SpendBar spent={st.spent_this_month} budget={st.policy.monthly_auto_budget} />
                  </Card>
                </div>
                <Card className="lg:col-start-1">
                  <SectionTitle icon={<History size={20} />} aside={<button onClick={() => openTab("activity")} className="text-sm font-semibold text-brand">See all</button>}>
                    Latest
                  </SectionTitle>
                  <Timeline events={st.events} limit={compact ? 4 : 6} />
                </Card>
              </div>
            </>
          )}
          {tab === "activity" && <Card><SectionTitle icon={<History size={20} />}>Everything that happened</SectionTitle><Timeline events={st.events} /></Card>}
          {tab === "limits" && <Card className="mx-auto max-w-2xl"><SectionTitle icon={<SlidersHorizontal size={20} />}>Your rules</SectionTitle><LimitsEditor policy={st.policy} onSave={savePolicy} /></Card>}
          {tab === "family" && <Card className="mx-auto max-w-2xl"><SectionTitle icon={<Users size={20} />}>Family profile</SectionTitle><ProfileEditor household={hh} onSave={saveProfile} /></Card>}
          {tab === "connect" && (
            <Card className="mx-auto max-w-2xl">
              <SectionTitle icon={<Plug size={20} />}>Connect</SectionTitle>
              <ConnectPanel info={connect} guardianKey={apiKey} />
              {onForget && <ForgetDevice onForget={onForget} />}
            </Card>
          )}
        </div>
      </main>
      {nav("bottom")}
    </div>
  );
});

function ForgetDevice({ onForget }: { onForget: () => void }): ReactNode {
  return (
    <div className="mt-8 border-t border-line pt-5">
      <button onClick={() => { if (confirm("Remove the guardian key from this browser? You'll need your saved link to get back in.")) onForget(); }}
        className="inline-flex items-center gap-2 text-[15px] font-semibold text-danger">
        <LogOut size={18} /> Forget this device
      </button>
    </div>
  );
}
