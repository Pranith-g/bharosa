import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Mic, MicOff, PhoneIncoming, SendHorizontal, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { ApiError, parentApi, type SimSayResult, type SimState } from "../../lib/api";
import { CHIPS, GREETING, STATUS_LABEL, TOOL_LABEL } from "../../lib/content";
import { LANG_NATIVE, LOCALE } from "../../lib/format";
import { usePoll } from "../../lib/usePoll";
import { Spinner } from "../ui";

type Msg =
  | { id: string; who: "me"; text: string }
  | { id: string; who: "bot"; text: string; tool?: string | null; status?: string }
  | { id: string; who: "call"; text: string }
  | { id: string; who: "note"; text: string };

export interface ParentHandle { say: (text: string) => Promise<SimSayResult | null>; chips: () => string[] }

/* Minimal typing for the Web Speech API (not in the DOM lib yet). */
interface SR { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }
const getSR = (): (new () => SR) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

let n = 0;
const uid = () => `m${++n}`;

export const ParentPhone = forwardRef<ParentHandle, { apiKey: string; onUnauthorized?: () => void; voiceDefault?: boolean }>(
  function ParentPhone({ apiKey, onUnauthorized, voiceDefault = true }, ref) {
    const api = useMemo(() => parentApi(apiKey), [apiKey]);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [busy, setBusy] = useState(false);
    const [text, setText] = useState("");
    const [voice, setVoice] = useState(voiceDefault);
    const [listening, setListening] = useState(false);
    const seen = useRef<Set<string> | null>(null);
    const recRef = useRef<SR | null>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    const voiceRef = useRef(voice);
    voiceRef.current = voice;

    const load = useCallback(async () => {
      try { return await api.state(); } catch (e) {
        if (e instanceof ApiError && e.status === 401) onUnauthorized?.();
        throw e;
      }
    }, [api, onUnauthorized]);
    const { data: info, error } = usePoll<SimState>(load, 3000);
    const lang = info?.language || "en";

    const speak = useCallback((t: string) => {
      if (!voiceRef.current || !("speechSynthesis" in window) || !t) return;
      const u = new SpeechSynthesisUtterance(t);
      u.lang = LOCALE[lang];
      u.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }, [lang]);

    // Greeting once, then watch for new call-backs (each one is a Bharosa → parent phone call).
    useEffect(() => {
      if (!info) return;
      if (seen.current === null) {
        seen.current = new Set(info.callbacks.map((c) => c.id));
        setMsgs([{ id: uid(), who: "bot", text: GREETING[info.language](info.parent_name) }]);
        return;
      }
      const fresh = info.callbacks.filter((c) => !seen.current!.has(c.id)).reverse();
      if (!fresh.length) return;
      fresh.forEach((c) => seen.current!.add(c.id));
      const items = fresh.map((c) => ({ id: uid(), who: "call" as const, text: c.message.replace(/^Called .*? back: “/, "").replace(/”$/, "") }));
      setMsgs((m) => [...m, ...items]);
      speak(items.at(-1)!.text);
    }, [info, speak]);

    useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

    const say = useCallback(async (raw: string) => {
      const t = raw.trim();
      if (!t) return null;
      setMsgs((m) => [...m, { id: uid(), who: "me", text: t }]);
      setText("");
      setBusy(true);
      try {
        const r = await api.say(t);
        setMsgs((m) => [...m, { id: uid(), who: "bot", text: r.reply, tool: r.tool, status: r.result?.status }]);
        speak(r.reply);
        return r;
      } catch (e) {
        setMsgs((m) => [...m, { id: uid(), who: "note", text: (e as Error).message }]);
        return null;
      } finally {
        setBusy(false);
      }
    }, [api, speak]);

    const chips = info ? CHIPS[info.language](info.guardian) : [];
    useImperativeHandle(ref, () => ({ say, chips: () => chips.map((c) => c.text) }), [say, chips]);

    const toggleMic = () => {
      const Ctor = getSR();
      if (!Ctor) {
        setMsgs((m) => [...m, { id: uid(), who: "note", text: "Voice input needs Chrome or Edge. Type, or tap a phrase below." }]);
        return;
      }
      if (listening) { recRef.current?.stop(); return; }
      const rec = new Ctor();
      rec.lang = LOCALE[lang];
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => { say(e.results[0][0].transcript); };
      rec.onend = () => setListening(false);
      rec.onerror = (e) => {
        setListening(false);
        if (e.error === "no-speech" || e.error === "aborted") return;
        const why = e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in the address bar, or type instead." : `Couldn't hear that (${e.error}). Try again or type.`;
        setMsgs((m) => [...m, { id: uid(), who: "note", text: why }]);
      };
      recRef.current = rec;
      setListening(true);
      try { rec.start(); } catch { setListening(false); }
    };

    if (!info) return error ? <div className="p-6 text-center text-danger">{error.message}</div> : <Spinner label="Dialling" />;

    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="parent-phone" lang={lang}>
        <div className="flex items-center gap-3 bg-brand px-4 pb-3 pt-9 text-white">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/15 text-lg font-bold">ಭ</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">Bharosa line</div>
            <div className="flex items-center gap-1.5 text-[13px] text-white/80">
              <span className="size-2 rounded-full bg-[#7fd6a3]" /> {info.parent_name}'s phone · {LANG_NATIVE[lang]}
            </div>
          </div>
          <button onClick={() => { setVoice((v) => !v); speechSynthesis?.cancel(); }} aria-label={voice ? "Mute spoken replies" : "Speak replies aloud"}
            className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
            {voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>

        <div ref={chatRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4" aria-live="polite">
          {msgs.map((m) => <Bubble key={m.id} m={m} />)}
          {busy && (
            <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 shadow-soft ring-1 ring-line">
              {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none]">
          {chips.map((c) => (
            <button key={c.text} onClick={() => say(c.text)} disabled={busy} data-testid={c.risky ? "chip-risky" : "chip"}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors disabled:opacity-50 ${c.risky ? "bg-danger-tint text-danger ring-1 ring-danger/30 hover:bg-danger hover:text-white" : "bg-white text-ink ring-1 ring-line hover:ring-brand/40"}`}>
              {c.risky && <ShieldAlert size={15} />} {c.text}
            </button>
          ))}
        </div>

        <form className="flex items-center gap-2 border-t border-line bg-white p-3" onSubmit={(e) => { e.preventDefault(); say(text); }}>
          <button type="button" onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak"} aria-pressed={listening}
            className={`flex size-14 shrink-0 items-center justify-center rounded-full text-white transition-colors ${listening ? "anim-pulse bg-danger" : "bg-brand hover:bg-brand-deep"}`}>
            {listening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : "Speak or type…"} aria-label="Message"
            className="field h-12 min-w-0 flex-1 rounded-full" data-testid="say-input" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand disabled:opacity-40">
            <SendHorizontal size={20} />
          </button>
        </form>
      </div>
    );
  },
);

function Bubble({ m }: { m: Msg }) {
  if (m.who === "me")
    return <div className="anim-rise ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[16px] leading-relaxed text-white">{m.text}</div>;
  if (m.who === "note")
    return <div className="mx-auto max-w-[90%] rounded-xl bg-saffron-tint px-3 py-2 text-center text-[13px] font-medium text-saffron-ink">{m.text}</div>;
  if (m.who === "call")
    return (
      <div className="anim-rise rounded-2xl bg-saffron-tint p-3.5 ring-1 ring-saffron/40" data-testid="callback">
        <div className="flex items-center gap-2 font-bold text-saffron-ink">
          <span className="anim-ring flex size-8 items-center justify-center rounded-full bg-saffron text-white"><PhoneIncoming size={16} /></span>
          Bharosa is calling back
        </div>
        <p className="mt-2 text-[16px] leading-relaxed text-ink">{m.text}</p>
      </div>
    );
  const st = m.status ? STATUS_LABEL[m.status] : undefined;
  const tone = st?.tone === "ok" ? "bg-ok-tint text-ok" : st?.tone === "bad" ? "bg-danger-tint text-danger" : st?.tone === "wait" ? "bg-saffron-tint text-saffron-ink" : "bg-paper text-muted";
  return (
    <div className={`anim-rise mr-auto max-w-[88%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-soft ring-1 ${st?.tone === "bad" ? "ring-danger/30" : "ring-line"}`} data-testid="bot-reply">
      <p className="text-[16px] leading-relaxed">{m.text}</p>
      {m.tool && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="font-mono text-muted" title={TOOL_LABEL[m.tool]}>{m.tool}</span>
          {st && <span className={`rounded-full px-2 py-0.5 font-semibold ${tone}`} data-testid="reply-status">{st.text}</span>}
        </div>
      )}
    </div>
  );
}
