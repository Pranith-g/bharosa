import { useEffect, useState } from "react";
import type { Policy } from "../../lib/api";
import { rupees } from "../../lib/format";
import { Button } from "../ui";

type Field = "auto_spend_limit" | "monthly_auto_budget" | "hard_cap" | "approval_ttl_minutes" | "scam_lock_minutes";
const FIELDS: { f: Field; label: string; help: string; min: number; max: number; step: number; money?: boolean }[] = [
  { f: "auto_spend_limit", label: "Do it without asking, up to", help: "One spend at or below this, to a known pharmacy or bill, just happens. You get an FYI.", min: 0, max: 5000, step: 50, money: true },
  { f: "monthly_auto_budget", label: "Monthly budget", help: "Once this month's spending would go past it, every spend asks you first.", min: 0, max: 30000, step: 500, money: true },
  { f: "hard_cap", label: "Always refuse above", help: "Anything bigger is refused outright, even if you'd approve it.", min: 500, max: 100000, step: 500, money: true },
  { f: "approval_ttl_minutes", label: "Approval links expire after", help: "Unanswered requests lapse and nothing is paid.", min: 10, max: 720, step: 10 },
  { f: "scam_lock_minutes", label: "Lock spending after a scam call for", help: "No payments at all for this long after a scam signal.", min: 15, max: 1440, step: 15 },
];

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export function LimitsEditor({ policy, onSave }: { policy: Policy; onSave: (patch: Partial<Policy>) => Promise<boolean> }) {
  const [draft, setDraft] = useState<Record<Field, number>>(() => pick(policy));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) setDraft(pick(policy)); }, [policy, dirty]);

  const problem = draft.auto_spend_limit > draft.hard_cap ? "The no-ask limit can't be above the refuse limit." : "";
  return (
    <div className="space-y-6">
      {FIELDS.map(({ f, label, help, min, max, step, money }) => (
        <div key={f}>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={f} className="text-[15px] font-semibold text-ink">{label}</label>
            <span className="text-xl font-extrabold text-brand num">{money ? rupees(draft[f]) : mins(draft[f])}</span>
          </div>
          <input id={f} type="range" className="slider mt-3" min={min} max={Math.max(max, draft[f])} step={step} value={draft[f]}
            onChange={(e) => { setDraft((d) => ({ ...d, [f]: Number(e.target.value) })); setDirty(true); }} />
          <p className="mt-1.5 text-sm text-muted">{help}</p>
        </div>
      ))}
      {problem && <p className="rounded-xl bg-danger-tint px-3 py-2 text-sm font-medium text-danger">{problem}</p>}
      <div className="flex gap-2">
        <Button size="lg" disabled={!dirty || !!problem} busy={busy} className="flex-1" onClick={async () => {
          setBusy(true);
          if (await onSave(draft)) setDirty(false);
          setBusy(false);
        }}>Save limits</Button>
        {dirty && <Button size="lg" variant="outline" onClick={() => { setDraft(pick(policy)); setDirty(false); }}>Undo</Button>}
      </div>
    </div>
  );
}

function pick(p: Policy): Record<Field, number> {
  return {
    auto_spend_limit: p.auto_spend_limit, monthly_auto_budget: p.monthly_auto_budget, hard_cap: p.hard_cap,
    approval_ttl_minutes: p.approval_ttl_minutes, scam_lock_minutes: p.scam_lock_minutes,
  };
}
