import { Pause, Phone, PhoneCall, Play, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import type { DashboardState } from "../../lib/api";
import { rupees } from "../../lib/format";
import { Button } from "../ui";

export function StatusPill({ state }: { state: DashboardState }) {
  const { policy, scam_lock_minutes_left: lock } = state;
  const [text, cls, dot] = policy.frozen
    ? ["Paused", "bg-danger text-white", "bg-white"]
    : lock
      ? [`Scam lock · ${lock} min`, "bg-danger text-white anim-pulse", "bg-white"]
      : ["Active", "bg-white/15 text-white ring-1 ring-white/30", "bg-[#7fd6a3]"];
  return (
    <span data-testid="status-pill" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap num ${cls}`}>
      <span className={`size-2 rounded-full ${dot}`} /> {text}
    </span>
  );
}

/** The red banner the guardian must not miss: who to call, and the national cyber-fraud helpline. */
export function ScamBanner({ state, onAddPhone }: { state: DashboardState; onAddPhone: () => void }) {
  const hh = state.household;
  const alert = state.events.find((e) => e.type === "scam_alert");
  if (!state.scam_lock_minutes_left || !alert) return null;
  return (
    <section data-testid="scam-banner" role="alert" className="anim-rise overflow-hidden rounded-3xl bg-danger text-white shadow-lift">
      <div className="flex gap-3 p-5">
        <span className="anim-ring flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><ShieldAlert size={26} /></span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight">Possible scam call. Spending is locked.</h2>
          <p className="mt-1 text-[15px] leading-snug text-white/90">{alert.summary.replace(/^⚠\s*/, "")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 bg-danger-deep/60 p-3">
        {hh.parent_phone ? (
          <a href={`tel:${hh.parent_phone}`} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-danger no-underline">
            <PhoneCall size={20} /> Call {hh.parent_name}
          </a>
        ) : (
          <button onClick={onAddPhone} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-2 text-base font-bold text-danger">
            <Phone size={18} /> Add {hh.parent_name}'s number
          </button>
        )}
        <a href="tel:1930" className="flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white no-underline ring-2 ring-white/60">
          <Phone size={20} /> 1930 helpline
        </a>
      </div>
    </section>
  );
}

export function PauseToggle({ frozen, onToggle, busy }: { frozen: boolean; onToggle: () => void; busy?: boolean }) {
  return (
    <button onClick={onToggle} disabled={busy} aria-pressed={frozen} data-testid="pause-toggle"
      className={`flex w-full items-center gap-4 rounded-3xl p-4 text-left transition-colors ${frozen ? "bg-danger text-white" : "border-2 border-line bg-card hover:border-danger/40"}`}>
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${frozen ? "bg-white/15" : "bg-danger-tint text-danger"}`}>
        {frozen ? <Play size={22} /> : <Pause size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{frozen ? "Spending is paused" : "Pause all spending"}</span>
        <span className={`block text-sm ${frozen ? "text-white/85" : "text-muted"}`}>
          {frozen ? "Tap to resume. Nothing is paid until you do." : "Blocks every payment and order at once, even ones you approve later."}
        </span>
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${frozen ? "bg-white/30" : "bg-line"}`}>
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] duration-200 ${frozen ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}

export function LockBox({ minutes, onLift, busy }: { minutes: number; onLift: () => void; busy?: boolean }) {
  if (!minutes) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-danger-tint p-3">
      <ShieldAlert className="shrink-0 text-danger" size={22} />
      <p className="flex-1 text-[15px] text-danger"><b className="num">{minutes} min</b> of scam lock left. Lift it only after you've spoken to them.</p>
      <Button variant="outline" onClick={onLift} busy={busy} className="shrink-0"><Unlock size={16} /> Lift</Button>
    </div>
  );
}

export function SpendBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min(100, (100 * spent) / Math.max(1, budget));
  const hot = pct >= 80;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-extrabold tracking-tight num">{rupees(spent)}</div>
          <div className="text-sm text-muted">paid this month</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold num">{rupees(budget)}</div>
          <div className="text-sm text-muted">monthly budget</div>
        </div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-700 ${hot ? "bg-saffron" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
        <ShieldCheck size={14} /> Counts everything paid, including what you approved. Past the budget, every spend asks you first.
      </p>
    </div>
  );
}
