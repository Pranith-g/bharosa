import {
  Ban, CircleCheck, CircleX, Hourglass, House, Info, MessageCircle, PhoneOutgoing, ShieldAlert,
  ShieldQuestion, SlidersHorizontal, TimerOff, TriangleAlert, Truck, UserPen, type LucideIcon,
} from "lucide-react";
import type { BEvent } from "../../lib/api";
import { clock, dayLabel, prettyMoney } from "../../lib/format";

const ICON: Record<string, LucideIcon> = {
  household_created: House, tool_call: MessageCircle, approval_requested: Hourglass, approval_granted: CircleCheck,
  approval_denied: CircleX, approval_expired: TimerOff, action_started: Truck, action_completed: CircleCheck,
  action_blocked: Ban, action_failed: TriangleAlert, parent_callback: PhoneOutgoing, scam_alert: ShieldAlert,
  scam_warning: ShieldQuestion, policy_changed: SlidersHorizontal, profile_changed: UserPen,
};
const TONE: Record<string, string> = {
  info: "bg-paper text-muted ring-line",
  success: "bg-ok-tint text-ok ring-ok/20",
  warning: "bg-saffron-tint text-saffron-ink ring-saffron/30",
  urgent: "bg-danger text-white ring-danger",
};

export function Timeline({ events, limit }: { events: BEvent[]; limit?: number }) {
  const list = limit ? events.slice(0, limit) : events;
  if (!list.length) return <p className="py-6 text-center text-muted">Nothing yet. Every call and decision will show up here.</p>;
  const groups: { day: string; items: BEvent[] }[] = [];
  for (const e of list) {
    const day = dayLabel(e.ts);
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1)!.items.push(e);
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="sticky top-0 z-[1] -mx-1 mb-2 bg-card px-1 text-sm font-bold text-muted">{g.day}</div>
          <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-line">
            {g.items.map((e) => {
              const Icon = ICON[e.type] || Info;
              const urgent = e.severity === "urgent";
              return (
                <li key={e.id} className={`relative flex gap-3 rounded-2xl py-2 ${urgent ? "bg-danger-tint -mx-2 px-2" : ""}`}>
                  <span className={`relative z-[1] flex size-[34px] shrink-0 items-center justify-center rounded-full ring-1 ${TONE[e.severity] || TONE.info}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className={`text-[15px] leading-snug ${urgent ? "font-semibold text-danger" : "text-ink"}`}>{prettyMoney(e.summary.replace(/^⚠\s*/, ""))}</p>
                    <p className="mt-0.5 text-[13px] text-muted num">{clock(e.ts)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
