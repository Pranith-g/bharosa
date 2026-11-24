import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleAlert, Info } from "lucide-react";

type Tone = "ok" | "bad" | "info";
interface Toast { id: number; text: string; tone: Tone }
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {toasts.map((t) => {
          const Icon = t.tone === "ok" ? CircleCheck : t.tone === "bad" ? CircleAlert : Info;
          return (
            <div key={t.id} role="status"
              className="anim-rise flex max-w-md items-center gap-2.5 rounded-2xl bg-ink px-4 py-3 text-[15px] font-medium text-white shadow-lift">
              <Icon className={t.tone === "ok" ? "text-[#7fd6a3]" : t.tone === "bad" ? "text-[#ff9d94]" : "text-[#f6c27a]"} size={20} />
              {t.text}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
