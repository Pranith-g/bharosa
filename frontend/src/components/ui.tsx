import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";

type Variant = "primary" | "outline" | "danger" | "saffron" | "ghost" | "light";
type Size = "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-deep shadow-soft",
  outline: "border-2 border-line bg-card text-ink hover:border-ink/30",
  danger: "bg-danger text-white hover:bg-danger-deep shadow-soft",
  saffron: "bg-saffron text-ink hover:brightness-95 shadow-soft",
  ghost: "text-brand hover:bg-brand-tint",
  light: "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20",
};
const SIZE: Record<Size, string> = {
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-14 px-6 text-lg rounded-2xl gap-2.5",
  xl: "h-16 px-7 text-xl rounded-2xl gap-3",
};

export function Button({ variant = "primary", size = "md", busy, className = "", children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy}
      className={`inline-flex select-none items-center justify-center font-semibold transition-[background-color,border-color,transform,filter] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${className}`}>
      {busy && <Loader2 className="animate-spin" size={18} />}
      {children}
    </button>
  );
}

export function Logo({ light, small }: { light?: boolean; small?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 no-underline ${light ? "text-white" : "text-ink"}`}>
      <img src="/icon.svg" alt="" className={small ? "size-7" : "size-9"} />
      <span className={`font-extrabold tracking-tight ${small ? "text-lg" : "text-xl"}`}>
        Bharosa
        <span className={`ml-2 font-semibold ${light ? "text-[#f6c27a]" : "text-saffron-ink"} ${small ? "text-sm" : "text-base"}`}>ಭರೋಸಾ · भरोसा</span>
      </span>
    </Link>
  );
}

export function Card({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "saffron" | "danger" }) {
  const t = tone === "saffron" ? "bg-saffron-tint border-saffron/40" : tone === "danger" ? "bg-danger-tint border-danger/30" : "bg-card border-line";
  return <section className={`rounded-3xl border p-5 shadow-soft ${t} ${className}`}>{children}</section>;
}

export function SectionTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      {icon && <span className="text-brand">{icon}</span>}
      <h2 className="text-[17px] font-bold text-ink">{children}</h2>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

/** Shown when a page needs a private key that isn't in this browser yet. */
export function KeyGate({ role, onKey, error }: { role: "guardian" | "parent"; onKey: (k: string) => void; error?: string }) {
  const [v, setV] = useState("");
  const prefix = role === "guardian" ? "bg_" : "bp_";
  const path = role === "guardian" ? "/g" : "/p";
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <Card>
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-tint text-brand"><KeyRound /></div>
        <h1 className="text-2xl font-bold">Open your {role === "guardian" ? "guardian" : "parent"} link</h1>
        <p className="mt-2 text-muted">
          This page needs the private link you saved at setup. It looks like <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-sm">{path}#{prefix}…</code>
        </p>
        {error && <p className="mt-3 rounded-xl bg-danger-tint px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onKey(v.trim()); }}>
          <input className="field font-mono" placeholder={`${prefix}…`} value={v} onChange={(e) => setV(e.target.value)} aria-label="Private key" autoComplete="off" />
          <Button type="submit" size="lg" className="shrink-0">Open</Button>
        </form>
        <p className="mt-5 text-sm text-muted">No family yet? <Link to="/setup" className="font-semibold text-brand">Set one up</Link></p>
      </Card>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="animate-spin" size={20} /> {label}…
    </div>
  );
}
