import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BellRing, Check, CircleCheck, KeyRound, Lock, MonitorPlay, PhoneCall, PhoneIncoming, Scale, ShieldAlert, X,
} from "lucide-react";
import { Logo } from "../components/ui";

type Tone = "brand" | "saffron" | "danger";

/** The three calls every judge should see. Numbers match the real default policy (₹500 auto, ₹3,000/month, ₹10,000 cap). */
const SCENES: {
  key: string; tab: string; tone: Tone; lang: string; langName: string; said: string; gloss: string;
  checks: { ok: boolean | null; text: string }[]; verdict: string; detail: string; you: string;
}[] = [
  {
    key: "med", tab: "Medicine", tone: "brand", lang: "kn", langName: "ಕನ್ನಡ",
    said: "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು", gloss: "My BP tablets are running out.",
    checks: [
      { ok: true, text: "Her usual pharmacy, her usual tablets" },
      { ok: true, text: "₹180 is under your ₹500 limit" },
      { ok: true, text: "Monthly budget has room" },
    ],
    verdict: "Done at once", detail: "30 × Telmisartan 40mg ordered.", you: "You get an FYI. Nothing to do.",
  },
  {
    key: "bill", tab: "Electricity bill", tone: "saffron", lang: "hi", langName: "हिन्दी",
    said: "बिजली का बिल भर दो", gloss: "Please pay the electricity bill.",
    checks: [
      { ok: true, text: "BESCOM is a payee you added" },
      { ok: false, text: "₹2,392 is over your ₹500 limit" },
    ],
    verdict: "Waiting for your tap", detail: "Held until you say yes.", you: "Approve, and she's called back with the receipt.",
  },
  {
    key: "scam", tab: "Scam call", tone: "danger", lang: "en", langName: "English",
    said: "A man from CBI says I'll be arrested unless I send money.", gloss: "A classic “digital arrest” scam.",
    checks: [
      { ok: null, text: "Scam signals: police threat, urgency, money" },
      { ok: null, text: "Overrides every limit and approval" },
    ],
    verdict: "Stopped. Spending locked.", detail: "Told calmly to hang up and call 1930.", you: "You get an urgent alert and a button to call her.",
  },
];

const TONE: Record<Tone, { solid: string; tint: string; text: string; ring: string; icon: typeof CircleCheck }> = {
  brand: { solid: "bg-brand text-white", tint: "bg-brand-tint", text: "text-brand", ring: "ring-brand/25", icon: CircleCheck },
  saffron: { solid: "bg-saffron text-ink", tint: "bg-saffron-tint", text: "text-saffron-ink", ring: "ring-saffron/40", icon: BellRing },
  danger: { solid: "bg-danger text-white", tint: "bg-danger-tint", text: "text-danger", ring: "ring-danger/30", icon: ShieldAlert },
};

export default function Landing() {
  useEffect(() => { document.title = "Bharosa · One number your parents can call"; }, []);
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
        <Logo />
        <nav className="ml-auto flex items-center gap-1">
          <Link to="/demo" className="hidden rounded-xl px-3 py-2 font-semibold text-ink no-underline hover:bg-black/5 sm:inline-flex">Live demo</Link>
          <Link to="/setup" className="inline-flex h-11 items-center whitespace-nowrap rounded-xl bg-brand px-4 font-semibold text-white no-underline hover:bg-brand-deep">Set up<span className="hidden sm:inline">&nbsp;a family</span></Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-6 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-16 lg:pt-12">
        <div className="anim-rise">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand">
            <PhoneCall size={15} /> A voice helper for parents, with you in control
          </p>
          <h1 className="mt-5 text-[clamp(2.6rem,6.4vw,4.8rem)] font-extrabold leading-[1.0] tracking-[-0.035em] text-balance">
            One number your parents can call.
          </h1>
          <p className="mt-6 max-w-xl text-[clamp(1.15rem,2vw,1.35rem)] leading-relaxed text-muted text-pretty">
            Amma calls and speaks in Kannada, Hindi or English. Bharosa orders her medicines and pays her bills, and
            checks every rupee against limits <b className="text-ink">you</b> set.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/setup" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-semibold text-white no-underline shadow-soft hover:bg-brand-deep">
              Set up a family <ArrowRight size={20} />
            </Link>
            <Link to="/demo" className="inline-flex h-14 items-center gap-2 rounded-2xl border-2 border-line bg-card px-6 text-lg font-semibold text-ink no-underline hover:border-ink/30">
              <MonitorPlay size={20} /> Watch it work
            </Link>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
            {[["3", "languages"], ["0", "apps for her"], ["1 tap", "to approve"]].map(([n, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd className="text-2xl font-extrabold tracking-tight num">{n}</dd><dd className="text-[15px] text-muted">{l}</dd></div>
            ))}
          </dl>
        </div>

        <CallTrace />
      </section>

      <Rulebook />

      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">No AI can approve a payment.</h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
              The voice agent works through Bharosa's MCP gateway, and approving simply isn't one of its tools.
              Only a person, tapping on their own phone, can say yes. Think UPI Circle, for AI agents.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Scale, t: "A rulebook, not a chatbot", d: "Fixed code decides. An AI can only make a call look riskier, never safer." },
              { icon: Lock, t: "A lock that wins", d: "Pause with one switch. A pause or scam lock beats an approval you already gave." },
              { icon: KeyRound, t: "Keys only you hold", d: "Private links, stored as fingerprints. No OTP, PIN or card number, ever." },
              { icon: PhoneIncoming, t: "She's never left hanging", d: "Whatever you decide, Bharosa calls her back in her language." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="rounded-3xl border border-line bg-card p-5">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-tint text-brand"><Icon size={21} /></span>
                <h3 className="mt-4 text-lg font-bold">{t}</h3>
                <p className="mt-1 text-[16px] leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-saffron-tint px-6 py-12 sm:px-12">
          <span aria-hidden className="pointer-events-none absolute -bottom-10 right-4 select-none text-[clamp(6rem,16vw,12rem)] font-extrabold leading-none text-saffron/15" lang="kn">ಭರೋಸಾ</span>
          <h2 className="relative max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">Two minutes to set up. Then she just calls.</h2>
          <p className="relative mt-3 max-w-lg text-lg text-ink/75">Add her medicines and bills, pick your limits, and save two private links: one for you, one for her phone.</p>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <Link to="/setup" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-semibold text-white no-underline hover:bg-brand-deep">
              Set up a family <ArrowRight size={20} />
            </Link>
            <Link to="/demo" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-card px-6 text-lg font-semibold text-ink no-underline ring-1 ring-saffron/30 hover:ring-saffron/60">
              <MonitorPlay size={20} /> Try the demo family
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-8 text-[15px] text-muted">
          <span>Bharosa · ಭರೋಸಾ · भरोसा means “trust”.</span>
          <span className="ml-auto">Cyber-fraud helpline in India: <a href="tel:1930" className="font-semibold text-brand">1930</a></span>
        </div>
      </footer>
    </div>
  );
}

/** Hero artefact: pick a call and watch the rulebook decide. Cycles on its own until someone clicks. */
function CallTrace() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const hover = useRef(false);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => { if (!hover.current) setI((n) => (n + 1) % SCENES.length); }, 5000);
    return () => window.clearInterval(t);
  }, [auto]);

  const s = SCENES[i];
  const t = TONE[s.tone];

  return (
    <div
      className="relative mx-auto w-full max-w-md lg:max-w-none"
      onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}
    >
      <div aria-hidden className="absolute -inset-8 -z-10 rounded-[56px] bg-[radial-gradient(60%_55%_at_55%_45%,#e3eee9_0%,transparent_72%)]" />
      <div className="rounded-[2rem] border border-line bg-card p-3 shadow-lift">
        <div role="tablist" aria-label="Example calls" className="grid grid-cols-3 gap-1 rounded-[1.4rem] bg-paper p-1">
          {SCENES.map((sc, n) => (
            <button
              key={sc.key} role="tab" aria-selected={n === i} data-testid={`trace-${sc.key}`}
              onClick={() => { setI(n); setAuto(false); }}
              className={`min-h-11 rounded-[1.1rem] px-2 text-[14px] font-semibold leading-tight transition-colors ${n === i ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink"}`}
            >
              <span className={`mr-1.5 inline-block size-2 rounded-full align-middle ${TONE[sc.tone].solid.split(" ")[0]}`} />{sc.tab}
            </button>
          ))}
        </div>

        <div key={s.key} role="tabpanel" className="anim-rise px-3 pb-3 pt-5" aria-live="polite">
          <Step n={1} label={`Amma says · ${s.langName}`}>
            <p lang={s.lang} className="rounded-2xl rounded-tl-md bg-paper px-4 py-3 text-[1.2rem] font-semibold leading-snug">{s.said}</p>
            {s.lang !== "en" && <p className="mt-1.5 pl-1 text-[14px] text-muted">“{s.gloss}”</p>}
            {s.lang === "en" && <p className="mt-1.5 pl-1 text-[14px] text-muted">{s.gloss}</p>}
          </Step>

          <Step n={2} label="The rulebook checks">
            <ul className="space-y-1.5">
              {s.checks.map((c) => (
                <li key={c.text} className="flex items-start gap-2 text-[15px]">
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${c.ok === true ? "bg-ok-tint text-ok" : c.ok === false ? "bg-saffron-tint text-saffron-ink" : "bg-danger-tint text-danger"}`}>
                    {c.ok === true ? <Check size={13} strokeWidth={3} /> : c.ok === false ? <span className="text-[12px] font-extrabold">!</span> : <X size={13} strokeWidth={3} />}
                  </span>
                  {c.text}
                </li>
              ))}
            </ul>
          </Step>

          <Step n={3} label="What happens" last>
            <div className={`rounded-2xl p-4 ${s.tone === "saffron" ? "bg-saffron-tint ring-2 ring-saffron/50" : t.solid}`}>
              <div className={`flex items-center gap-2 text-lg font-extrabold ${s.tone === "saffron" ? "text-saffron-ink" : ""}`}><t.icon size={20} /> {s.verdict}</div>
              <p className={`mt-0.5 text-[15px] ${s.tone === "saffron" ? "text-ink" : "text-white/90"}`}>{s.detail} {s.you}</p>
              {s.tone === "saffron" && (
                <div aria-hidden className="mt-3 grid grid-cols-2 gap-2">
                  <span className="flex h-10 items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white">Approve ₹2,392</span>
                  <span className="flex h-10 items-center justify-center rounded-xl border-2 border-line bg-card text-[15px] font-semibold">Decline</span>
                </div>
              )}
            </div>
          </Step>
        </div>
      </div>
    </div>
  );
}

function Step({ n, label, last, children }: { n: number; label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span aria-hidden className="absolute left-[13px] top-8 bottom-1 w-0.5 rounded bg-line" />}
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white num">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 pt-0.5 text-[13px] font-bold uppercase tracking-wide text-muted">{label}</div>
        {children}
      </div>
    </div>
  );
}

/** The policy, drawn as a ruler. Same rules every time: that's the point. */
function Rulebook() {
  return (
    <section className="bg-brand-deep text-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">The same words always get the same answer.</h2>
        <p className="mt-3 max-w-2xl text-lg text-white/75">Every request is measured against your limits by fixed code. You can change the numbers any time.</p>

        <div className="mt-12">
          <div className="grid grid-cols-[3fr_4fr_2.6fr] overflow-hidden rounded-2xl text-[14px] sm:grid-cols-[2fr_5fr_2fr] sm:text-[15px] font-bold">
            <div className="bg-[#2f8a6e] px-3 py-4 sm:px-5">Runs by itself</div>
            <div className="bg-saffron px-3 py-4 text-ink sm:px-5">Asks you first</div>
            <div className="bg-danger px-3 py-4 sm:px-5">Refused</div>
          </div>
          <div className="relative mt-2 grid grid-cols-[3fr_4fr_2.6fr] sm:grid-cols-[2fr_5fr_2fr] text-[14px] text-white/70 num">
            <span>₹0</span>
            <span className="-ml-4">₹500</span>
            <span className="-ml-6">₹10,000</span>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { t: "Small and familiar", d: "Up to ₹500 to a pharmacy or biller you added, within ₹3,000 a month. You get an FYI." },
            { t: "Bigger, or someone new", d: "Over the limit, a new payee, or the month's budget used up. It waits for your one tap." },
            { t: "A scam beats everything", d: "Threats, urgency, “send money now”: refused, all spending locked, and you're alerted." },
          ].map(({ t, d }) => (
            <div key={t} className="rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10">
              <h3 className="text-xl font-bold">{t}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-white/75">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
