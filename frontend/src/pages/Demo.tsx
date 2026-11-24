import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { GuardianApp, type GuardianHandle } from "../components/guardian/GuardianApp";
import { ParentPhone, type ParentHandle } from "../components/parent/ParentPhone";
import { PhoneFrame } from "../components/PhoneFrame";
import { useToast } from "../components/Toast";
import { Button, Logo } from "../components/ui";
import { createHousehold, type Lang } from "../lib/api";
import { CHIPS, SCENES, STATUS_LABEL, demoSpec } from "../lib/content";
import { LANG_NATIVE } from "../lib/format";
import { readDemoKeys, saveDemoKeys, type DemoKeys } from "../lib/keys";

type SceneState = "idle" | "running" | "done";

/** The stage view: parent's phone on the left, guardian's phone on the right, both live. */
export default function DemoPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<DemoKeys | null>(() => readDemoKeys());
  const [lang, setLang] = useState<Lang>("kn");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [scene, setScene] = useState<Record<string, SceneState>>({});
  const [caption, setCaption] = useState("");
  const [last, setLast] = useState<{ tool: string | null; status?: string } | null>(null);
  const parent = useRef<ParentHandle>(null);
  const guardian = useRef<GuardianHandle>(null);
  const cancel = useRef(false);

  useEffect(() => { document.title = "Bharosa · Live demo"; }, []);

  const reset = useCallback(async (l: Lang = lang) => {
    setBusy(true);
    try {
      const out = await createHousehold(demoSpec(l));
      const k = { g: out.guardian_key, p: out.parent_key };
      saveDemoKeys(k);
      setKeys(k);
      setScene({});
      setCaption("");
      setLast(null);
      return k;
    } catch (e) {
      toast(`Couldn't create a demo family: ${(e as Error).message}`, "bad");
      return null;
    } finally {
      setBusy(false);
    }
  }, [lang, toast]);

  const sleep = (ms: number) => new Promise<void>((res, rej) => setTimeout(() => (cancel.current ? rej(new Error("stopped")) : res()), ms));
  const untilQuiet = async (max = 9000) => {
    const t0 = Date.now();
    await sleep(600);
    while ("speechSynthesis" in window && speechSynthesis.speaking && Date.now() - t0 < max) await sleep(300);
  };
  const waitFor = async (fn: () => boolean | Promise<boolean>, max = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) { if (await fn()) return true; await sleep(400); }
    return false;
  };

  const run = async () => {
    cancel.current = false;
    setRunning(true);
    try {
      const k = await reset(lang);
      if (!k) return;
      // Wait until both phones have re-mounted with the *new* family's keys and loaded.
      await waitFor(() => parent.current?.apiKey === k.p && parent.current.ready() && guardian.current?.apiKey === k.g, 10000);
      await sleep(800);
      const chips = CHIPS[lang]("Ravi").map((c) => c.text);
      const say = async (i: number) => {
        const r = await parent.current?.say(chips[i]);
        if (r) setLast({ tool: r.tool, status: r.result?.status });
        return r;
      };

      setScene({ auto: "running" });
      setCaption("Lakshmi's BP tablets are running out. It's small and the pharmacy is known, so Bharosa just does it.");
      await say(SCENES[0].chip);
      await untilQuiet();
      await sleep(1500);

      setScene({ auto: "done", approve: "running" });
      setCaption("Now the electricity bill: ₹2,392. That's over Ravi's ₹500 limit, so it waits for his tap.");
      await say(SCENES[1].chip);
      guardian.current?.refresh();
      await waitFor(() => (guardian.current?.pendingCount() || 0) > 0, 8000);
      await untilQuiet();
      setCaption("Ravi sees the amount, her own words, and why he's asked. He taps Approve.");
      await sleep(3500);
      await waitFor(async () => !!(await guardian.current?.approveFirst()), 10000);
      setCaption("Bharosa pays the bill, then calls Lakshmi back with the receipt.");
      await sleep(4500);
      await untilQuiet();

      setScene({ auto: "done", approve: "done", scam: "running" });
      setCaption("Then a scammer calls, claiming to be the CBI. Bharosa refuses, calms her, and locks all spending.");
      await say(SCENES[2].chip);
      await untilQuiet(14000);
      setScene({ auto: "done", approve: "done", scam: "done" });
      setCaption("One gateway, two phones. The AI did the talking; the rules and Ravi made every decision.");
    } catch {
      setCaption("Stopped.");
    } finally {
      setRunning(false);
    }
  };

  const stop = () => { cancel.current = true; if ("speechSynthesis" in window) speechSynthesis.cancel(); };

  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-[#efece4]">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-3">
        <Logo small />
        <span className="hidden rounded-full bg-danger px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white lg:inline">Live</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-card p-1 ring-1 ring-line" role="radiogroup" aria-label="Parent's language">
            {(["kn", "hi", "en"] as Lang[]).map((l) => (
              <button key={l} role="radio" aria-checked={lang === l} disabled={running || busy}
                onClick={() => { setLang(l); reset(l); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${lang === l ? "bg-brand text-white" : "text-ink hover:bg-paper"}`} lang={l}>
                {LANG_NATIVE[l]}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => reset()} busy={busy && !running} disabled={running} data-testid="demo-reset"><RotateCcw size={17} /> Reset</Button>
          {running
            ? <Button variant="danger" onClick={stop}><Square size={16} /> Stop</Button>
            : <Button onClick={run} disabled={busy} data-testid="demo-run"><Play size={17} /> Run scripted demo</Button>}
        </div>
      </header>

      {!keys ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight">Two phones, one gateway, live.</h1>
          <p className="max-w-xl text-lg text-muted">Creates a fresh demo family (Lakshmi and her son Ravi) and opens both phones side by side.</p>
          <Button size="xl" onClick={() => reset()} busy={busy} data-testid="demo-create">Create a demo family</Button>
          <ol className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
            {SCENES.map((sc, n) => (
              <li key={sc.id} className="rounded-2xl border border-line bg-card p-4">
                <span className={`flex size-8 items-center justify-center rounded-full text-sm font-bold num ${["bg-brand text-white", "bg-saffron text-ink", "bg-danger text-white"][n]}`}>{n + 1}</span>
                <b className="mt-3 block">{sc.title}</b>
                <span className="text-[15px] text-muted">{sc.outcome}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 pb-6 lg:grid-cols-[auto_minmax(280px,1fr)_auto] lg:overflow-hidden">
          <PhoneFrame label="Lakshmi · parent" className="mx-auto h-[min(860px,calc(100dvh-110px))] min-h-[600px] w-[min(440px,calc((100dvh-110px)*0.5))] min-w-[320px]">
            <ParentPhone key={keys.p} ref={parent} apiKey={keys.p} />
          </PhoneFrame>

          <section className="order-first flex flex-col justify-center gap-6 lg:order-none">
            <h1 className="text-[clamp(1.6rem,2.4vw,2.6rem)] font-extrabold leading-tight tracking-tight text-balance">
              She talks. The rules decide. He stays in control.
            </h1>
            <ol className="space-y-3">
              {SCENES.map((s, i) => {
                const st = scene[s.id] || "idle";
                return (
                  <li key={s.id} className={`flex gap-4 rounded-3xl p-4 transition-colors ${st === "running" ? "bg-card shadow-lift ring-2 ring-saffron" : st === "done" ? "bg-card/60" : ""}`}>
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${st === "done" ? "bg-ok text-white" : st === "running" ? "bg-saffron text-ink" : "bg-line text-muted"}`}>
                      {st === "done" ? <CircleCheck size={20} /> : st === "running" ? <Loader2 className="animate-spin" size={20} /> : i + 1}
                    </span>
                    <div>
                      <div className={`text-[clamp(1rem,1.3vw,1.35rem)] font-bold ${s.id === "scam" ? "text-danger" : ""}`}>{s.title}</div>
                      <div className="text-[clamp(0.95rem,1.1vw,1.15rem)] text-muted">{s.outcome}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="min-h-[5.5rem] rounded-3xl bg-ink p-5 text-white" aria-live="polite">
              <p className="text-[clamp(1.05rem,1.35vw,1.4rem)] leading-snug">{caption || "Press Run for the three scenes, or tap the phrases on Lakshmi's phone yourself."}</p>
              {last?.tool && (
                <p className="mt-3 font-mono text-sm text-white/70">
                  MCP tool <span className="text-[#f6c27a]">{last.tool}</span> → {STATUS_LABEL[last.status || ""]?.text || last.status}
                </p>
              )}
            </div>
          </section>

          <PhoneFrame label="Ravi · guardian" className="mx-auto h-[min(860px,calc(100dvh-110px))] min-h-[600px] w-[min(440px,calc((100dvh-110px)*0.5))] min-w-[320px]">
            <GuardianApp key={keys.g} ref={guardian} apiKey={keys.g} compact />
          </PhoneFrame>
        </main>
      )}
    </div>
  );
}
