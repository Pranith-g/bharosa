import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Download, MonitorPlay, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { createHousehold, type CreatedHousehold, type Lang } from "../lib/api";
import { BILLERS, demoSpec } from "../lib/content";
import { LANG_NAME, LANG_NATIVE, rupees } from "../lib/format";
import { saveDemoKeys } from "../lib/keys";
import { Text } from "../components/guardian/ProfileEditor";
import { CopyField, QR } from "../components/CopyField";
import { Button, Card, Logo } from "../components/ui";

interface MedRow { name: string; purpose: string; aliases: string; unit_price: number }
interface BillRow { name: string; biller_id: string; consumer_number: string; aliases: string }
interface Form {
  parent_name: string; language: Lang; parent_phone: string;
  g_name: string; g_relation: string; g_phone: string; g_ntfy: string;
  ph_name: string; ph_phone: string; ph_note: string;
  meds: MedRow[]; bills: BillRow[];
  auto: number; budget: number; cap: number; admin: string;
}
const EMPTY: Form = {
  parent_name: "", language: "kn", parent_phone: "", g_name: "", g_relation: "son", g_phone: "", g_ntfy: "",
  ph_name: "", ph_phone: "", ph_note: "", meds: [{ name: "", purpose: "", aliases: "", unit_price: 5 }],
  bills: [{ name: "", biller_id: "BESCOM", consumer_number: "", aliases: "" }], auto: 500, budget: 3000, cap: 10000, admin: "",
};
const STEPS = ["Parent", "You & alerts", "Medicines, bills & limits"];
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const randomTopic = (name: string) => `bharosa-${(name || "family").toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`;

export default function Setup() {
  const [f, setF] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ out: CreatedHousehold; name: string } | null>(null);
  useEffect(() => { document.title = "Bharosa · Set up a family"; }, []);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const fillDemo = () => {
    const d = demoSpec("kn");
    setF({
      ...EMPTY, parent_name: d.parent_name, language: "kn", g_name: d.guardian.name, g_relation: d.guardian.relation,
      ph_name: d.pharmacy.name, ph_note: d.pharmacy.address_note,
      meds: d.medicines.map((m) => ({ name: m.name, purpose: m.purpose, aliases: m.aliases.join(", "), unit_price: m.unit_price })),
      bills: d.payees.map((p) => ({ name: p.name, biller_id: p.biller_id, consumer_number: p.consumer_number, aliases: p.aliases.join(", ") })),
    });
    setErr("");
  };

  const check = (s: number) => {
    if (s === 0 && !f.parent_name.trim()) return "Add your parent's name.";
    if (s === 1 && !f.g_name.trim()) return "Add your name.";
    if (s === 2 && f.auto > f.cap) return "The no-ask limit can't be above the refuse limit.";
    return "";
  };
  const next = () => { const e = check(step); setErr(e); if (!e) setStep(step + 1); };

  const submit = async () => {
    const e = check(2);
    if (e) return setErr(e);
    setBusy(true);
    setErr("");
    const body = {
      parent_name: f.parent_name.trim(), language: f.language, parent_phone: f.parent_phone.trim(),
      guardian: { name: f.g_name.trim(), relation: f.g_relation, phone: f.g_phone.trim(), ntfy_topic: f.g_ntfy.trim() },
      pharmacy: { name: f.ph_name.trim() || "Neighbourhood Pharmacy", phone: f.ph_phone.trim(), address_note: f.ph_note.trim() },
      medicines: f.meds.filter((m) => m.name.trim()).map((m, i) => ({
        id: `med${i + 1}`, name: m.name.trim(), purpose: m.purpose.trim(), aliases: list(m.aliases), unit_price: m.unit_price || 5, qty_per_order: 30,
      })),
      payees: f.bills.filter((b) => b.consumer_number.trim()).map((b, i) => ({
        id: `bill${i + 1}`, name: b.name.trim() || BILLERS[b.biller_id].name, biller_id: b.biller_id,
        consumer_number: b.consumer_number.trim(), category: BILLERS[b.biller_id].category, aliases: list(b.aliases),
      })),
      policy: { auto_spend_limit: f.auto, monthly_auto_budget: f.budget, hard_cap: f.cap },
    };
    try {
      const out = await createHousehold(body, f.admin.trim() || undefined);
      setDone({ out, name: body.parent_name });
      window.scrollTo({ top: 0 });
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Success out={done.out} name={done.name} />;

  return (
    <div className="min-h-dvh pb-10">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Set up a family</h1>
            <p className="mt-1 text-muted">Three short steps. You can change everything later.</p>
          </div>
          <Button variant="outline" onClick={fillDemo} data-testid="fill-demo"><Sparkles size={17} className="text-saffron" /> Fill with demo data</Button>
        </div>

        <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => i < step && setStep(i)} disabled={i > step}
                className={`w-full text-left ${i < step ? "cursor-pointer" : "cursor-default"}`} aria-current={i === step ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
                <span className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold sm:text-sm ${i === step ? "text-ink" : "text-muted"}`}>
                  {i < step && <Check size={14} className="text-brand" />}{s}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <Card className="p-5 sm:p-7">
          {step === 0 && (
            <div className="space-y-5">
              <StepHead title="Who is Bharosa for?" sub="Usually a parent who'd rather call than use an app." />
              <Text label="Their name" value={f.parent_name} placeholder="Lakshmi" onChange={(v) => set({ parent_name: v })} required />
              <div>
                <span className="label">They'll speak</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {(["kn", "hi", "en"] as Lang[]).map((l) => (
                    <button key={l} type="button" role="radio" aria-checked={f.language === l} onClick={() => set({ language: l })}
                      className={`rounded-2xl border-2 px-2 py-3 text-center transition-colors ${f.language === l ? "border-brand bg-brand-tint" : "border-line bg-white hover:border-brand/40"}`}>
                      <span className="block text-xl font-bold" lang={l}>{LANG_NATIVE[l]}</span>
                      <span className="text-sm text-muted">{LANG_NAME[l]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Text label="Their phone, for call-backs" type="tel" value={f.parent_phone} placeholder="+91 98…" onChange={(v) => set({ parent_phone: v })}
                hint="Also powers the Call button when a scam is caught." />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <StepHead title="You're the guardian" sub="You approve big spends and hear about scams first." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Text label="Your name" value={f.g_name} placeholder="Ravi" onChange={(v) => set({ g_name: v })} required />
                <Text label="Relation" value={f.g_relation} onChange={(v) => set({ g_relation: v })} />
              </div>
              <Text label="Your phone, for SMS alerts (optional)" type="tel" value={f.g_phone} placeholder="+91 98…" onChange={(v) => set({ g_phone: v })} />
              <div>
                <Text label="Push alerts: ntfy topic" value={f.g_ntfy} placeholder="bharosa-ravi-7f3k2" onChange={(v) => set({ g_ntfy: v })}
                  hint="Install the free ntfy app, subscribe to this topic, and approvals arrive as notifications." />
                <Button type="button" variant="ghost" className="mt-1" onClick={() => set({ g_ntfy: randomTopic(f.g_name) })}><Sparkles size={16} /> Make a hard-to-guess topic</Button>
              </div>
              <div className="border-t border-line pt-5">
                <h3 className="mb-3 font-bold">Their pharmacy</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text label="Name" value={f.ph_name} placeholder="Sri Sai Medicals" onChange={(v) => set({ ph_name: v })} />
                  <Text label="Phone" type="tel" value={f.ph_phone} placeholder="+91 80…" onChange={(v) => set({ ph_phone: v })} />
                </div>
                <div className="mt-4"><Text label="Delivery note" value={f.ph_note} placeholder="Jayanagar 4th Block, near the temple" onChange={(v) => set({ ph_note: v })} /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <StepHead title="What they usually need" sub="Bharosa only orders these medicines and pays these bills without asking." />
              <Rows title="Medicines" onAdd={() => set({ meds: [...f.meds, { name: "", purpose: "", aliases: "", unit_price: 5 }] })} addLabel="Add medicine">
                {f.meds.map((m, i) => (
                  <Row key={i} onRemove={() => set({ meds: f.meds.filter((_, j) => j !== i) })}>
                    <Text label="Medicine" value={m.name} placeholder="Telmisartan 40mg" onChange={(v) => set({ meds: f.meds.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
                    <Text label="For" value={m.purpose} placeholder="BP" onChange={(v) => set({ meds: f.meds.map((x, j) => (j === i ? { ...x, purpose: v } : x)) })} />
                    <Text label="Words they use" value={m.aliases} placeholder="bp, ಬಿಪಿ" onChange={(v) => set({ meds: f.meds.map((x, j) => (j === i ? { ...x, aliases: v } : x)) })} />
                    <Text label="₹ per tablet" type="number" value={String(m.unit_price)} onChange={(v) => set({ meds: f.meds.map((x, j) => (j === i ? { ...x, unit_price: Number(v) } : x)) })} />
                  </Row>
                ))}
              </Rows>
              <Rows title="Bills" onAdd={() => set({ bills: [...f.bills, { name: "", biller_id: "BESCOM", consumer_number: "", aliases: "" }] })} addLabel="Add bill">
                {f.bills.map((b, i) => (
                  <Row key={i} onRemove={() => set({ bills: f.bills.filter((_, j) => j !== i) })}>
                    <div>
                      <label className="label">Biller</label>
                      <select className="field" value={b.biller_id} onChange={(e) => set({ bills: f.bills.map((x, j) => (j === i ? { ...x, biller_id: e.target.value } : x)) })}>
                        {Object.entries(BILLERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                      </select>
                    </div>
                    <Text label="Consumer number" value={b.consumer_number} placeholder="7A4521909" onChange={(v) => set({ bills: f.bills.map((x, j) => (j === i ? { ...x, consumer_number: v } : x)) })} />
                    <Text label="Name (optional)" value={b.name} placeholder={BILLERS[b.biller_id].name} onChange={(v) => set({ bills: f.bills.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
                    <Text label="Words they use" value={b.aliases} placeholder="current bill, ಕರೆಂಟ್ ಬಿಲ್" onChange={(v) => set({ bills: f.bills.map((x, j) => (j === i ? { ...x, aliases: v } : x)) })} />
                  </Row>
                ))}
              </Rows>
              <div className="space-y-5 border-t border-line pt-5">
                <h3 className="font-bold">Your limits</h3>
                <Slider label="Do it without asking, up to" value={f.auto} min={0} max={5000} step={50} onChange={(v) => set({ auto: v })} />
                <Slider label="Monthly budget" value={f.budget} min={0} max={30000} step={500} onChange={(v) => set({ budget: v })} />
                <Slider label="Always refuse above" value={f.cap} min={500} max={100000} step={500} onChange={(v) => set({ cap: v })} />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-muted">Advanced</summary>
                <div className="mt-3"><Text label="Admin token (only if this server asks for one)" value={f.admin} onChange={(v) => set({ admin: v })} /></div>
              </details>
            </div>
          )}

          {err && <p role="alert" className="mt-5 rounded-xl bg-danger-tint px-3.5 py-2.5 font-medium text-danger">{err}</p>}

          <div className="mt-7 flex gap-3">
            {step > 0 && <Button variant="outline" size="lg" onClick={() => { setErr(""); setStep(step - 1); }}><ArrowLeft size={18} /> Back</Button>}
            {step < 2
              ? <Button size="lg" className="flex-1" onClick={next} data-testid="next">Next <ArrowRight size={18} /></Button>
              : <Button size="lg" className="flex-1" onClick={submit} busy={busy} data-testid="create">Create {f.parent_name ? `${f.parent_name}'s` : "the"} Bharosa</Button>}
          </div>
        </Card>
      </main>
    </div>
  );
}

function StepHead({ title, sub }: { title: string; sub: string }) {
  return <div><h2 className="text-2xl font-bold">{title}</h2><p className="mt-1 text-muted">{sub}</p></div>;
}

function Rows({ title, children, onAdd, addLabel }: { title: string; children: ReactNode; onAdd: () => void; addLabel: string }) {
  return (
    <div>
      <h3 className="mb-3 font-bold">{title}</h3>
      <div className="space-y-3">{children}</div>
      <Button type="button" variant="ghost" className="mt-2" onClick={onAdd}><Plus size={18} /> {addLabel}</Button>
    </div>
  );
}

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative grid gap-3 rounded-2xl border border-line bg-paper/60 p-3 pr-14 sm:grid-cols-2">
      {children}
      <button type="button" onClick={onRemove} aria-label="Remove" className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-xl text-muted hover:bg-danger-tint hover:text-danger">
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <div className="flex items-baseline justify-between"><label htmlFor={id} className="font-semibold">{label}</label><span className="text-xl font-extrabold text-brand num">{rupees(value)}</span></div>
      <input id={id} type="range" className="slider mt-3" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Success({ out, name }: { out: CreatedHousehold; name: string }) {
  const navigate = useNavigate();
  const download = () => {
    const txt = [`Bharosa links for ${name}. Keep these private.`, "", `Guardian dashboard: ${out.guardian_dashboard}`,
      `Parent line simulator: ${out.parent_simulator}`, `Parent MCP URL (voice agent): ${out.parent_mcp_url}`,
      `Guardian MCP URL (read-only): ${out.guardian_mcp_url}`, ""].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = `bharosa-${name.toLowerCase().replace(/\W+/g, "-")}-links.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="min-h-dvh pb-12">
      <header className="mx-auto flex max-w-3xl items-center px-5 py-5"><Logo /></header>
      <main className="mx-auto max-w-3xl space-y-5 px-4" data-testid="setup-done">
        <div className="anim-rise">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-ok-tint text-ok"><Check size={30} strokeWidth={3} /></span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{name}'s Bharosa is ready</h1>
        </div>
        <div className="flex gap-3 rounded-3xl border-2 border-saffron/60 bg-saffron-tint p-4 text-saffron-ink" role="alert">
          <TriangleAlert className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Save these links now. They're shown only once.</p>
            <p className="text-[15px]">Anyone who has a link can use it, so don't share them. Bharosa stores only a fingerprint, never the key itself.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col items-center gap-4 text-center">
            <QR value={out.guardian_dashboard} label="Scan with your phone" />
            <div className="w-full text-left"><CopyField label="Guardian dashboard: bookmark it on your phone" value={out.guardian_dashboard} open secret /></div>
          </Card>
          <Card className="flex flex-col items-center gap-4 text-center">
            <QR value={out.parent_simulator} label="Try the parent line" />
            <div className="w-full text-left"><CopyField label="Parent line simulator: test without a phone number" value={out.parent_simulator} open secret /></div>
          </Card>
        </div>
        <Card className="space-y-4">
          <CopyField label="MCP server URL for the ElevenLabs voice agent" value={out.parent_mcp_url} secret hint="Add it as a custom MCP server (streamable HTTP, no tool approval: Bharosa does the approving)." />
          <CopyField label="Read-only MCP URL for your own assistant, like Claude" value={out.guardian_mcp_url} secret />
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" variant="outline" onClick={download}><Download size={18} /> Download links</Button>
          <Button size="lg" onClick={() => { saveDemoKeys({ g: out.guardian_key, p: out.parent_key }); navigate("/demo"); }} data-testid="open-demo">
            <MonitorPlay size={18} /> Open both phones side by side
          </Button>
        </div>
      </main>
    </div>
  );
}
