import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Ban, CircleCheckBig, CircleX, Clock3, LinkIcon, PhoneOutgoing, ShieldAlert, Truck } from "lucide-react";
import { ApiError, request, type ApprovalInfo } from "../lib/api";
import { cleanTitle, clock, minutesLeft, prettyMoney, rupees } from "../lib/format";
import { Button, Logo, Spinner } from "../components/ui";

/** One-tap approval page, opened from the guardian's push/SMS link. The token in ?t= is single-use. */
export default function ApprovePage() {
  const { hh, aid } = useParams();
  const [token] = useState(() => new URLSearchParams(location.search).get("t") || "");
  const [info, setInfo] = useState<ApprovalInfo | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setInfo(await request<ApprovalInfo>(`/api/approval/${hh}/${aid}?t=${encodeURIComponent(token)}`));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setBad(true);
      else setMsg((e as Error).message);
    }
  }, [hh, aid, token]);

  useEffect(() => {
    document.title = "Bharosa · Approve?";
    load();
  }, [load]);

  const decide = async (decision: "approve" | "deny") => {
    setBusy(decision);
    setMsg("");
    try {
      await request(`/api/approval/${hh}/${aid}`, { method: "POST", body: { t: token, decision } });
    } catch (e) {
      setMsg((e as Error).message);
    }
    await load();
    setBusy(null);
  };

  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-brand px-5 py-3.5" style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto max-w-lg"><Logo light small /></div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        {bad ? (
          <Final icon={<LinkIcon size={30} />} tone="muted" title="This link isn't valid"
            body="It may be mistyped or from another family. Open your Bharosa dashboard instead." />
        ) : !info ? (
          msg ? <p className="rounded-2xl bg-danger-tint p-4 text-danger">{msg}</p> : <Spinner />
        ) : info.status === "pending_approval" ? (
          <Pending info={info} busy={busy} msg={msg} onDecide={decide} />
        ) : (
          <Outcome info={info} />
        )}
      </main>
    </div>
  );
}

function Pending({ info, busy, msg, onDecide }: { info: ApprovalInfo; busy: string | null; msg: string; onDecide: (d: "approve" | "deny") => void }) {
  const risky = info.risk_score >= 0.35;
  const left = minutesLeft(info.expires_at);
  return (
    <article className="anim-rise">
      <p className="text-lg font-semibold text-saffron-ink">{info.parent} is asking you</p>
      <div className="mt-1 text-[clamp(3.5rem,18vw,5.5rem)] font-extrabold leading-none tracking-tight num" data-testid="approve-amount">
        {rupees(info.amount)}
      </div>
      <h1 className="mt-3 text-2xl font-bold leading-snug">{cleanTitle(info.title)}</h1>
      {left !== null && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-saffron-tint px-3 py-1 text-sm font-semibold text-saffron-ink num">
          <Clock3 size={15} /> Expires in {left} min
        </p>
      )}
      {info.parent_said && (
        <blockquote className="mt-5 rounded-3xl bg-card p-5 text-xl leading-relaxed shadow-soft ring-1 ring-line">“{info.parent_said}”</blockquote>
      )}
      <div className="mt-5">
        <h2 className="font-bold">Why you're asked</h2>
        <ul className="mt-2 space-y-1.5 text-[17px]">
          {info.reasons.map((r) => <li key={r} className="flex gap-2.5"><span className="mt-2.5 size-2 shrink-0 rounded-full bg-saffron" />{prettyMoney(r)}</li>)}
        </ul>
      </div>
      {risky && (
        <div className="mt-5 rounded-3xl bg-danger-tint p-4 text-danger">
          <div className="flex items-center gap-2 font-bold"><ShieldAlert size={20} /> Possible scam. Call {info.parent} before you approve.</div>
          <p className="mt-1 text-[15px]">{info.risk_signals.join(" · ")}</p>
        </div>
      )}
      {msg && <p className="mt-4 rounded-2xl bg-danger-tint p-3 font-medium text-danger">{msg}</p>}
      <div className="sticky bottom-0 -mx-4 mt-6 grid grid-cols-2 gap-3 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <Button size="xl" busy={busy === "approve"} disabled={!!busy} onClick={() => onDecide("approve")} data-testid="approve">Approve</Button>
        <Button size="xl" variant="outline" busy={busy === "deny"} disabled={!!busy} onClick={() => onDecide("deny")}>Decline</Button>
      </div>
      <p className="mt-1 text-center text-[15px] text-muted">{info.parent} gets a call back with your answer.</p>
    </article>
  );
}

function Outcome({ info }: { info: ApprovalInfo }) {
  const amount = info.amount ? ` ${rupees(info.amount)}` : "";
  const title = cleanTitle(info.title);
  switch (info.status) {
    case "completed":
      return <Final icon={<CircleCheckBig size={34} />} tone="ok" stamp="Paid" title={`Done.${amount} paid`}
        body={`${title}. ${info.parent} has been called back with the receipt.`}
        extra={<>{info.receipt && <p className="mx-auto mt-4 w-fit rounded-xl bg-paper px-3 py-1.5 font-mono text-sm">Receipt {info.receipt}</p>}<CallNote parent={info.parent} /></>} />;
    case "awaiting_pharmacy":
      return <Final icon={<Truck size={32} />} tone="ok" stamp="Approved" title="Approved. Calling the pharmacy"
        body={`${title}. ${info.parent} gets a call back once the pharmacy confirms.`} />;
    case "denied":
      return <Final icon={<CircleX size={34} />} tone="muted" title="Declined" body={`Nothing was paid. ${info.parent} has been told.`} extra={<CallNote parent={info.parent} />} />;
    case "expired":
      return <Final icon={<Clock3 size={32} />} tone="muted" title="This request expired" body={`No answer came in time, so nothing was paid. Requested at ${clock(info.created_at)}.`} />;
    case "blocked":
      return <Final icon={<Ban size={32} />} tone="bad" title="Blocked for safety"
        body="Spending was paused or scam-locked, so this was not paid, even with your approval. Lift the lock from your dashboard if it's safe." />;
    default:
      return <Final icon={<ShieldAlert size={32} />} tone="bad" title="Approved, but it failed" body={`${title}. Check the dashboard for details.`} />;
  }
}

function CallNote({ parent }: { parent: string }) {
  return <p className="mt-4 flex justify-center items-center gap-2 text-[15px] text-muted"><PhoneOutgoing size={17} /> Bharosa called {parent} back.</p>;
}

function Final({ icon, tone, title, body, stamp, extra }: { icon: ReactNode; tone: "ok" | "bad" | "muted"; title: string; body: string; stamp?: string; extra?: ReactNode }) {
  const ring = tone === "ok" ? "bg-ok-tint text-ok" : tone === "bad" ? "bg-danger-tint text-danger" : "bg-line/60 text-muted";
  return (
    <div className="anim-rise relative overflow-hidden rounded-3xl bg-card p-7 text-center shadow-soft ring-1 ring-line" data-testid="approve-final">
      {stamp && (
        <span className="anim-stamp absolute right-5 top-5 rounded-lg border-[3px] border-ok px-2.5 py-0.5 text-sm font-extrabold uppercase tracking-widest text-ok">{stamp}</span>
      )}
      <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${ring}`}>{icon}</div>
      <h1 className="mt-4 text-2xl font-extrabold num">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-[17px] text-muted">{body}</p>
      {extra}
    </div>
  );
}
