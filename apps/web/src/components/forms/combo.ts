// Builds the fields the design's searchable dropdown (`Combobox`) draws. A form keeps one open dropdown and one
// search text at a time, as the design does; each field is worked out from them and its options.
import type { ComboboxField } from "@/features/console/view";

export type ComboOption = { v: string; l: string; ab?: string };

export type ComboState = { open: string | null; q: string; setOpen: (key: string | null) => void; setQ: (q: string) => void };

export type ComboSpec = {
  /** Unique within the form: which dropdown is open. */
  k: string;
  l: string;
  value: string;
  options: ComboOption[];
  onPick: (value: string) => void;
  placeholder: string;
  head: string;
  search?: boolean;
  qph?: string;
  span?: string;
  hint?: string;
  req?: boolean;
  /** An "Other" entry that opens a box to type a value the list doesn't have. */
  other?: { title: string; detail: string; label: string; ph: string; value: string; set: (value: string) => void };
  /** The value is "other" (typed in) rather than one of the options. */
  otherOn?: boolean;
  onOther?: () => void;
  size?: string;
};

const match = (o: ComboOption, q: string) => !q || `${o.l} ${o.v} ${o.ab ?? ""}`.toLowerCase().includes(q.toLowerCase());

export function combo(state: ComboState, f: ComboSpec): ComboboxField & { k: string; l: string; span: string; hint: string; isRo: boolean; req: string } {
  const open = state.open === f.k;
  const picked = f.options.find((o) => o.v === f.value);
  const options = f.options.filter((o) => match(o, open ? state.q : ""));
  const close = () => {
    state.setOpen(null);
    state.setQ("");
  };
  return {
    k: f.k,
    l: f.l,
    span: f.span ?? "3",
    hint: f.hint ?? "",
    isRo: false,
    req: f.req ? "1" : "",
    isDd: true,
    isInput: false,
    isSeg: false,
    oid: `${f.k}-other`,
    shown: f.otherOn ? f.other?.value || f.other?.title || "" : picked ? picked.l : f.placeholder,
    aria: `${f.l}: ${f.otherOn ? f.other?.value || "Other" : picked ? picked.l : f.placeholder}`,
    ab: picked?.ab ?? "",
    vcls: picked || f.otherOn ? "" : "mu",
    open,
    exp: open ? "true" : "false",
    toggle: () => {
      state.setQ("");
      state.setOpen(open ? null : f.k);
    },
    close,
    search: f.search ?? f.options.length > 8,
    qph: f.qph ?? `Search ${f.l.toLowerCase()}`,
    q: open ? state.q : "",
    setQ: (event?: unknown) => state.setQ(((event as { currentTarget?: { value?: string } })?.currentTarget?.value ?? "").toString()),
    head: f.head,
    dopts: options.map((o) => ({
      l: o.l,
      ab: o.ab ?? "",
      on: o.v === f.value && !f.otherOn ? "on" : "",
      sel: o.v === f.value && !f.otherOn ? "true" : "false",
      go: () => {
        f.onPick(o.v);
        close();
      },
    })),
    none: options.length === 0,
    hasOther: !!f.other,
    otherOn: f.otherOn ? "on" : "",
    otherSel: f.otherOn ? "true" : "false",
    pickOther: () => {
      f.onOther?.();
      close();
    },
    otherT: f.other?.title ?? "",
    otherD: f.other?.detail ?? "",
    showOther: !!f.otherOn && !!f.other,
    otherL: f.other?.label ?? "",
    otherPh: f.other?.ph ?? "",
    ov: f.other?.value ?? "",
    setOther: (event?: unknown) => f.other?.set(((event as { currentTarget?: { value?: string } })?.currentTarget?.value ?? "").toString()),
    ddsz: f.size,
  };
}
