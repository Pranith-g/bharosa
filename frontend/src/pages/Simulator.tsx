import { createElement, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, AudioLines } from "lucide-react";
import { ParentPhone } from "../components/parent/ParentPhone";
import { PhoneFrame } from "../components/PhoneFrame";
import { Card, KeyGate, Logo } from "../components/ui";
import { parentApi } from "../lib/api";
import { useRoleKey } from "../lib/keys";
import { useMedia } from "../lib/useMedia";

export default function SimulatorPage() {
  const [key, setKey] = useRoleKey("parent");
  const [err, setErr] = useState("");
  const [agent, setAgent] = useState("");
  const desktop = useMedia("(min-width: 768px)");
  useEffect(() => { document.title = "Bharosa · Parent line"; }, []);
  useEffect(() => { if (key) parentApi(key).state().then((s) => setAgent(s.elevenlabs_agent_id)).catch(() => {}); }, [key]);
  const onUnauthorized = useCallback(() => { setKey(""); setErr("That link didn't work. It may be old or mistyped."); }, [setKey]);
  if (!key) return <KeyGate role="parent" error={err} onKey={(k) => { setErr(""); setKey(k); }} />;

  if (!desktop) {
    // Phone-sized screens: the page *is* the phone.
    return <div className="h-dvh"><ParentPhone apiKey={key} onUnauthorized={onUnauthorized} /></div>;
  }
  return (
      <div className="min-h-dvh">
        <header className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-5">
          <Logo />
          <a href="/g" target="_blank" className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-brand no-underline hover:bg-brand-tint">
            Open guardian dashboard <ArrowUpRight size={18} />
          </a>
        </header>
        <main className="mx-auto grid max-w-6xl grid-cols-[minmax(360px,410px)_1fr] gap-10 px-6 pb-10">
          <PhoneFrame className="h-[min(820px,calc(100dvh-120px))]">
            <ParentPhone apiKey={key} onUnauthorized={onUnauthorized} />
          </PhoneFrame>
          <div className="space-y-5 self-center">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Be the parent for a minute.</h1>
            <p className="max-w-xl text-lg text-muted">
              Speak or tap a phrase. Each request goes through the same MCP tools and the same policy engine the
              real voice agent uses. Keep the guardian dashboard open beside this to watch it react.
            </p>
            <ol className="max-w-xl space-y-3 text-[17px]">
              <li><b>BP tablets</b>: small and known, so it's done at once.</li>
              <li><b>Pay the electricity bill</b>: over the limit, so the guardian is asked. Approve it there and watch the call back arrive here.</li>
              <li className="text-danger"><b>The CBI call</b>: a scam. Calm advice, the 1930 helpline, and all spending locks.</li>
            </ol>
            {agent && (
              <Card>
                <div className="mb-2 flex items-center gap-2 font-bold"><AudioLines size={20} className="text-brand" /> Talk to the real voice agent</div>
                <p className="mb-3 text-[15px] text-muted">This ElevenLabs agent is connected to this family's MCP endpoint.</p>
                <ElevenLabsWidget agentId={agent} />
              </Card>
            )}
            <p className="text-sm text-muted">The page uses an offline keyword router in place of the LLM, so it works with no API keys and no Wi-Fi.</p>
          </div>
        </main>
      </div>
  );
}

function ElevenLabsWidget({ agentId }: { agentId: string }) {
  useEffect(() => {
    if (document.querySelector("script[data-el-widget]")) return;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.dataset.elWidget = "1";
    document.body.appendChild(s);
  }, []);
  return createElement("elevenlabs-convai", { "agent-id": agentId });
}
