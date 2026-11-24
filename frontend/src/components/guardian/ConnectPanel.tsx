import type { ReactNode } from "react";
import { Bot, PhoneCall, Store } from "lucide-react";
import type { ConnectInfo } from "../../lib/api";
import { CopyField } from "../CopyField";

/** How to point Claude (or any MCP client) at the read-only guardian gateway. */
export function ConnectPanel({ info, guardianKey }: { info: ConnectInfo | null; guardianKey: string }) {
  const base = info?.base_url || location.origin;
  const url = `${base}/guardian-mcp?key=${guardianKey}`;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[17px] font-bold">Ask Claude how your parent is doing</h3>
        <p className="mt-1 text-[15px] text-muted">
          This link lets an AI assistant <b className="text-ink">read</b> activity, pending requests and limits. It can't approve anything:
          approving is not a tool, only your tap does that.
        </p>
      </div>
      <CopyField label="Read-only guardian MCP URL" value={url} secret />
      <ol className="space-y-3 text-[15px]">
        <Step n={1}>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</Step>
        <Step n={2}>Name it <b>Bharosa</b> and paste the URL above.</Step>
        <Step n={3}>Ask: <i>“What did Amma do today? Is anything waiting for me?”</i></Step>
      </ol>
      <div className="rounded-2xl bg-paper p-4">
        <div className="text-sm font-semibold text-muted">Claude Code</div>
        <code className="mt-1 block break-all font-mono text-[13px]">claude mcp add --transport http bharosa "{url.replace(/(bg_)[\w-]+/, "$1…")}"</code>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Channel icon={<Bot size={18} />} label="Voice agent" value={info?.elevenlabs_agent_id ? "ElevenLabs connected" : "Not connected"} on={!!info?.elevenlabs_agent_id} />
        <Channel icon={<Store size={18} />} label="Pharmacy" value={info?.pharmacy_channel === "elevenlabs" ? "Real phone call" : "Simulated"} on={info?.pharmacy_channel === "elevenlabs"} />
        <Channel icon={<PhoneCall size={18} />} label="Call-backs" value={info?.callback_channel === "elevenlabs" ? "Real phone call" : "Simulated"} on={info?.callback_channel === "elevenlabs"} />
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Channel({ icon, label, value, on }: { icon: ReactNode; label: string; value: string; on: boolean }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted">{icon} {label}</div>
      <div className={`mt-1 flex items-center gap-1.5 font-semibold ${on ? "text-ok" : "text-ink"}`}>
        <span className={`size-2 rounded-full ${on ? "bg-ok" : "bg-line"}`} /> {value}
      </div>
    </div>
  );
}
