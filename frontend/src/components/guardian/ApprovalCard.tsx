import { Clock3, Pill, ReceiptIndianRupee, ShieldAlert, CircleHelp } from "lucide-react";
import type { Action, Lang } from "../../lib/api";
import { cleanTitle, minutesLeft, prettyMoney, rupees } from "../../lib/format";
import { Button } from "../ui";

export function ApprovalCard({ action, parentName, lang, onDecide, busy, compact }: {
  action: Action; parentName: string; lang: Lang; busy?: boolean; compact?: boolean;
  onDecide: (id: string, d: "approve" | "deny") => void;
}) {
  const risky = action.risk_score >= 0.35;
  const left = minutesLeft(action.expires_at);
  const KindIcon = action.kind === "medicine_order" ? Pill : ReceiptIndianRupee;
  return (
    <article data-testid="approval-card"
      className={`anim-rise rounded-3xl border-2 p-5 shadow-soft ${risky ? "border-danger/50 bg-danger-tint" : "border-saffron/60 bg-saffron-tint"}`}>
      <div className="flex items-center gap-2 text-[15px] font-semibold text-saffron-ink">
        <KindIcon size={18} /> {parentName} is asking
        {left !== null && (
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-saffron-ink/80 num">
            <Clock3 size={15} /> {left} min left
          </span>
        )}
      </div>

      <div className={`mt-2 font-extrabold tracking-tight text-ink num ${compact ? "text-4xl" : "text-5xl"}`}>{rupees(action.amount)}</div>
      <h3 className="mt-1 text-lg font-semibold leading-snug text-ink">{cleanTitle(action.title)}</h3>

      {action.parent_said && (
        <blockquote lang={lang} className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-[17px] leading-relaxed text-ink">
          “{action.parent_said}”
        </blockquote>
      )}

      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><CircleHelp size={16} /> Why you're asked</div>
        <ul className="mt-1.5 space-y-1 text-[15px] text-ink/85">
          {(action.decision?.reasons || []).map((r) => (
            <li key={r} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-saffron" />{prettyMoney(r)}</li>
          ))}
        </ul>
      </div>

      {action.risk_signals.length > 0 && (
        <div className="mt-3 rounded-2xl bg-danger/10 p-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-danger"><ShieldAlert size={16} /> Scam signals. Call {parentName} before approving.</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {action.risk_signals.map((s) => (
              <span key={s} className="rounded-full bg-white px-2.5 py-1 text-[13px] font-medium text-danger ring-1 ring-danger/25">{s}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button size={compact ? "lg" : "xl"} onClick={() => onDecide(action.id, "approve")} disabled={busy} data-testid="approve">Approve</Button>
        <Button size={compact ? "lg" : "xl"} variant="outline" onClick={() => onDecide(action.id, "deny")} disabled={busy}>Decline</Button>
      </div>
    </article>
  );
}
