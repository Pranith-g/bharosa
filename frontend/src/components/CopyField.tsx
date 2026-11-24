import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Check, Copy, ExternalLink, Eye, EyeOff } from "lucide-react";

export function CopyField({ label, value, open, secret, hint }: { label: string; value: string; open?: boolean; secret?: boolean; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const masked = value.replace(/(b[pg]_)[A-Za-z0-9_-]+/, "$1••••••••••••");
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-white p-1.5 pl-3.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={shown ? value : undefined}>{shown ? value : masked}</code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide" : "Show"}
            className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-paper">
            {shown ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
        <button type="button" onClick={copy}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${copied ? "bg-ok-tint text-ok" : "bg-brand-tint text-brand hover:bg-brand hover:text-white"}`}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
        </button>
        {open && (
          <a href={value} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}
            className="flex size-10 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-deep">
            <ExternalLink size={17} />
          </a>
        )}
      </div>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function QR({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [value]);
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox={`-2 -2 ${svg.n + 4} ${svg.n + 4}`} width={size} height={size} role="img" aria-label={label ? `QR code: ${label}` : "QR code"}
        className="rounded-2xl bg-white p-1 shadow-soft ring-1 ring-line" shapeRendering="crispEdges">
        <path d={svg.d} fill="#13231f" />
      </svg>
      {label && <figcaption className="text-sm font-semibold text-muted">{label}</figcaption>}
    </figure>
  );
}
