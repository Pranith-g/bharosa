import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Household, Lang, Medicine, Payee } from "../../lib/api";
import { BILLERS } from "../../lib/content";
import { LANG_NAME } from "../../lib/format";
import { Button } from "../ui";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function ProfileEditor({ household, onSave }: { household: Household; onSave: (patch: Partial<Household>) => Promise<boolean> }) {
  const [d, setD] = useState<Household>(household);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) setD(household); }, [household, dirty]);
  const edit = (patch: Partial<Household>) => { setD((x) => ({ ...x, ...patch })); setDirty(true); };
  const setMed = (i: number, p: Partial<Medicine>) => edit({ medicines: d.medicines.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const setPayee = (i: number, p: Partial<Payee>) => edit({ payees: d.payees.map((m, j) => (j === i ? { ...m, ...p } : m)) });

  return (
    <form className="space-y-7" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const ok = await onSave({
          parent_name: d.parent_name, parent_language: d.parent_language, parent_phone: d.parent_phone,
          guardian: d.guardian, pharmacy: d.pharmacy,
          medicines: d.medicines.filter((m) => m.name.trim()),
          payees: d.payees.filter((p) => p.consumer_number.trim()),
      });
      if (ok) setDirty(false);
      setBusy(false);
    }}>
      <Group title="Parent">
        <Text label="Name" value={d.parent_name} onChange={(v) => edit({ parent_name: v })} required />
        <div>
          <label className="label" htmlFor="lang">Speaks</label>
          <select id="lang" className="field" value={d.parent_language} onChange={(e) => edit({ parent_language: e.target.value as Lang })}>
            {(["kn", "hi", "en"] as Lang[]).map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}
          </select>
        </div>
        <Text label="Phone, for call-backs and the Call button" value={d.parent_phone} type="tel" placeholder="+91 98…" onChange={(v) => edit({ parent_phone: v })} />
      </Group>

      <Group title="You">
        <Text label="Your name" value={d.guardian.name} onChange={(v) => edit({ guardian: { ...d.guardian, name: v } })} required />
        <Text label="Relation" value={d.guardian.relation} onChange={(v) => edit({ guardian: { ...d.guardian, relation: v } })} />
        <Text label="Phone, for SMS alerts" type="tel" value={d.guardian.phone} onChange={(v) => edit({ guardian: { ...d.guardian, phone: v } })} />
        <Text label="ntfy topic, for push alerts" value={d.guardian.ntfy_topic} placeholder="bharosa-ravi-7f3k2"
          hint="Install the free ntfy app and subscribe to a hard-to-guess topic." onChange={(v) => edit({ guardian: { ...d.guardian, ntfy_topic: v } })} />
      </Group>

      <Group title="Pharmacy">
        <Text label="Name" value={d.pharmacy.name} onChange={(v) => edit({ pharmacy: { ...d.pharmacy, name: v } })} />
        <Text label="Phone" type="tel" value={d.pharmacy.phone} onChange={(v) => edit({ pharmacy: { ...d.pharmacy, phone: v } })} />
        <Text label="Delivery note" value={d.pharmacy.address_note} onChange={(v) => edit({ pharmacy: { ...d.pharmacy, address_note: v } })} />
      </Group>

      <Group title="Medicines" wide>
        {d.medicines.map((m, i) => (
          <Row key={m.id} onRemove={() => edit({ medicines: d.medicines.filter((_, j) => j !== i) })}>
            <Text label="Medicine" value={m.name} onChange={(v) => setMed(i, { name: v })} />
            <Text label="For" value={m.purpose} onChange={(v) => setMed(i, { purpose: v })} />
            <Text label="Words they use (comma separated)" value={m.aliases.join(", ")} onChange={(v) => setMed(i, { aliases: list(v) })} />
            <Text label="₹ per tablet" type="number" value={String(m.unit_price)} onChange={(v) => setMed(i, { unit_price: Number(v) || 0 })} />
          </Row>
        ))}
        <Button type="button" variant="ghost" onClick={() => edit({ medicines: [...d.medicines, { id: `med${Date.now().toString(36)}`, name: "", purpose: "", aliases: [], qty_per_order: 30, unit_price: 5 }] })}>
          <Plus size={18} /> Add medicine
        </Button>
      </Group>

      <Group title="Known bills" wide>
        {d.payees.map((p, i) => (
          <Row key={p.id} onRemove={() => edit({ payees: d.payees.filter((_, j) => j !== i) })}>
            <Text label="Name" value={p.name} onChange={(v) => setPayee(i, { name: v })} />
            <div>
              <label className="label">Biller</label>
              <select className="field" value={p.biller_id} onChange={(e) => setPayee(i, { biller_id: e.target.value, category: BILLERS[e.target.value]?.category || "utility" })}>
                {Object.entries(BILLERS).map(([k, b]) => <option key={k} value={k}>{b.name}</option>)}
              </select>
            </div>
            <Text label="Consumer number" value={p.consumer_number} onChange={(v) => setPayee(i, { consumer_number: v })} />
            <Text label="Words they use" value={p.aliases.join(", ")} onChange={(v) => setPayee(i, { aliases: list(v) })} />
          </Row>
        ))}
        <Button type="button" variant="ghost" onClick={() => edit({ payees: [...d.payees, { id: `bill${Date.now().toString(36)}`, name: "", biller_id: "BESCOM", consumer_number: "", category: "electricity", aliases: [] }] })}>
          <Plus size={18} /> Add bill
        </Button>
      </Group>

      <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-card/95 px-5 py-3 backdrop-blur">
        <Button type="submit" size="lg" className="flex-1" disabled={!dirty} busy={busy}>Save changes</Button>
        {dirty && <Button type="button" size="lg" variant="outline" onClick={() => { setD(household); setDirty(false); }}>Undo</Button>}
      </div>
    </form>
  );
}

function Group({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-3 text-[17px] font-bold text-ink">{title}</legend>
      <div className={wide ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>{children}</div>
    </fieldset>
  );
}

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative grid gap-3 rounded-2xl border border-line bg-paper/60 p-3 pr-14 sm:grid-cols-2">
      {children}
      <button type="button" onClick={onRemove} aria-label="Remove"
        className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-xl text-muted hover:bg-danger-tint hover:text-danger">
        <Trash2 size={18} />
      </button>
    </div>
  );
}

export function Text({ label, value, onChange, hint, ...rest }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}
