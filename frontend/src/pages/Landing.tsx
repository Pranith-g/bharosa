import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BellRing, CircleCheck, KeyRound, Lock, MonitorPlay, PhoneIncoming, ShieldAlert, Scale } from "lucide-react";
import { Logo } from "../components/ui";

const ROWS = [
  {
    tone: "brand", said: "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು", lang: "kn", gloss: "“My BP tablets are running out.”",
    does: "Orders 30 tablets from her usual pharmacy. ₹180, a known spend, under your limit.",
    you: "An FYI on your phone. Nothing to do.", label: "Done at once",
  },
  {
    tone: "saffron", said: "बिजली का बिल भर दो", lang: "hi", gloss: "“Please pay the electricity bill.”",
    does: "Finds the ₹2,392 bill, sees it's over your ₹500 limit, and holds it.",
    you: "One tap to approve. Then Bharosa pays it and calls her back with the receipt.", label: "Asks you first",
  },
  {
    tone: "danger", said: "Someone from CBI says I'll be arrested unless I send money", lang: "en", gloss: "A classic “digital arrest” scam.",
    does: "Refuses, calmly tells her it's a scam and to call 1930, then locks all spending.",
    you: "An urgent alert with a button to call her right now.", label: "Stops the scam",
  },
] as const;

const TONE = {
  brand: { dot: "bg-brand", text: "text-brand", tint: "bg-brand-tint", icon: CircleCheck },
  saffron: { dot: "bg-saffron", text: "text-saffron-ink", tint: "bg-saffron-tint", icon: BellRing },
  danger: { dot: "bg-danger", text: "text-danger", tint: "bg-danger-tint", icon: ShieldAlert },
};

export default function Landing() {
  useEffect(() => { document.title = "Bharosa · One number your parents can call"; }, []);
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
        <Logo />
        <nav className="ml-auto flex items-center gap-1">
          <Link to="/demo" className="hidden rounded-xl px-3 py-2 font-semibold text-ink no-underline hover:bg-black/5 sm:inline-flex">Live demo</Link>
          <Link to="/setup" className="inline-flex h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white no-underline hover:bg-brand-deep">Set up a family</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-14">
        <div className="anim-rise">
          <h1 className="text-[clamp(2.5rem,6.2vw,4.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-balance">
            One number your parents can call.
          </h1>
          <p className="mt-5 max-w-xl text-[clamp(1.15rem,2vw,1.4rem)] leading-relaxed text-muted text-pretty">
            Amma speaks Kannada, Hindi or English. Bharosa reorders her medicines and pays her bills, and checks every
            rupee against limits <b className="text-ink">you</b> set. Big spends wait for your tap. Scam calls get stopped cold.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/setup" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-semibold text-white no-underline shadow-soft hover:bg-brand-deep">
              Set up a family <ArrowRight size={20} />
            </Link>
            <Link to="/demo" className="inline-flex h-14 items-center gap-2 rounded-2xl border-2 border-line bg-card px-6 text-lg font-semibold text-ink no-underline hover:border-ink/30">
              <MonitorPlay size={20} /> Watch it work
            </Link>
          </div>
          <p className="mt-6 text-[15px] text-muted">No app for her. A normal phone call, in her language.</p>
        </div>

        <CallStack />
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">Three things it does, every single time.</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted">The rules are fixed code, not an AI's mood. The same words always get the same result.</p>
          <div className="mt-10 divide-y divide-line overflow-hidden rounded-3xl border border-line">
            <div className="hidden grid-cols-[1.1fr_1fr_1fr] gap-6 bg-paper px-6 py-3 text-sm font-bold text-muted md:grid">
              <span>She says</span><span>Bharosa</span><span>You</span>
            </div>
            {ROWS.map((r) => {
              const t = TONE[r.tone];
              return (
                <div key={r.label} className="grid gap-4 bg-card px-6 py-6 md:grid-cols-[1.1fr_1fr_1fr] md:gap-6">
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold ${t.tint} ${t.text}`}>
                      <t.icon size={14} /> {r.label}
                    </span>
                    <p lang={r.lang} className="mt-3 text-xl font-semibold leading-snug">{r.said}</p>
                    <p className="mt-1 text-[15px] text-muted">{r.gloss}</p>
                  </div>
                  <p className="text-[17px] leading-relaxed md:pt-10">{r.does}</p>
                  <p className="text-[17px] leading-relaxed text-muted md:pt-10">{r.you}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">No AI can approve a payment.</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
            The voice agent works through Bharosa's MCP gateway, and approving simply isn't one of its tools.
            Only a person, tapping on their own phone, can say yes. Think UPI Circle, for AI agents.
          </p>
        </div>
        <ul className="space-y-5">
          {[
            { icon: Scale, t: "A rulebook, not a chatbot", d: "Every request goes through a fixed policy engine. An AI can only make a scam look riskier, never safer." },
            { icon: Lock, t: "A lock that wins", d: "Pause everything with one switch. A scam lock or a pause beats an approval you already gave." },
            { icon: KeyRound, t: "Keys only you hold", d: "Private links, stored as fingerprints. No OTP, PIN or card number is ever asked for or kept." },
            { icon: PhoneIncoming, t: "She's never left hanging", d: "Whatever you decide, Bharosa calls her back and tells her, in her language." },
          ].map(({ icon: Icon, t, d }) => (
            <li key={t} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand"><Icon size={21} /></span>
              <div><h3 className="text-lg font-bold">{t}</h3><p className="mt-0.5 text-[16px] text-muted">{d}</p></div>
            </li>
          ))}
        </ul>
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

/** Hero artefact: three real calls, stacked like notifications on the guardian's phone. */
function CallStack() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_60%_40%,#e3eee9_0%,transparent_70%)]" />
      <div className="space-y-3">
        <Note delay="0s" tone="brand" title="Done: BP tablets ordered" body="30 × Telmisartan 40mg, ₹180 · auto-approved" time="9:14 am" />
        <div className="anim-rise rounded-3xl border-2 border-saffron/60 bg-saffron-tint p-5 shadow-lift" style={{ animationDelay: "0.12s" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-saffron-ink"><BellRing size={16} /> Lakshmi is asking · 11:02 am</div>
          <div className="mt-1 text-4xl font-extrabold tracking-tight num">₹2,392</div>
          <div className="font-semibold">Pay BESCOM electricity bill</div>
          <p lang="kn" className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[15px]">“ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು”</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="flex h-11 items-center justify-center rounded-xl bg-brand font-semibold text-white">Approve</span>
            <span className="flex h-11 items-center justify-center rounded-xl border-2 border-line bg-card font-semibold">Decline</span>
          </div>
        </div>
        <Note delay="0.24s" tone="danger" title="Scam call stopped. Spending locked." body="“CBI” demanded money. She was told to hang up and call 1930." time="4:40 pm" />
      </div>
    </div>
  );
}

function Note({ tone, title, body, time, delay }: { tone: "brand" | "danger"; title: string; body: string; time: string; delay: string }) {
  const danger = tone === "danger";
  const Icon = danger ? ShieldAlert : CircleCheck;
  return (
    <div className={`anim-rise flex gap-3 rounded-3xl p-4 shadow-soft ${danger ? "bg-danger text-white" : "bg-card ring-1 ring-line"}`} style={{ animationDelay: delay }}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${danger ? "bg-white/15" : "bg-ok-tint text-ok"}`}><Icon size={20} /></span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2"><b className="leading-snug">{title}</b><span className={`ml-auto shrink-0 text-xs ${danger ? "text-white/75" : "text-muted"}`}>{time}</span></div>
        <p className={`text-[14px] ${danger ? "text-white/90" : "text-muted"}`}>{body}</p>
      </div>
    </div>
  );
}
