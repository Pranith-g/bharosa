import type { ReactNode } from "react";

/** A phone silhouette for the simulator and demo stage. On small screens it disappears and the content goes full-bleed. */
export function PhoneFrame({ children, label, className = "", bare }: { children: ReactNode; label?: string; className?: string; bare?: boolean }) {
  if (bare) return <div className={`flex h-full flex-col overflow-hidden bg-[#fbfaf6] ${className}`}>{children}</div>;
  return (
    <div className={`relative flex flex-col ${className}`}>
      {label && <div className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>}
      <div className="relative flex min-h-0 flex-1 flex-col rounded-[44px] bg-[#13231f] p-3 shadow-lift ring-1 ring-black/20">
        <div className="absolute left-1/2 top-3 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-[#13231f]" aria-hidden />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] bg-[#fbfaf6]">{children}</div>
      </div>
    </div>
  );
}
