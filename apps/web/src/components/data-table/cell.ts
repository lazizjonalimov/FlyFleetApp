import { I } from "@/features/console/icons";
import type { Cell, Fn } from "@/features/console/view";

/** A click inside a row that must not also open the row. */
export const stop =
  (go: () => void): Fn =>
  (event) => {
    (event as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
    go();
  };

/**
 * Table cells, by kind. A table is a list of rows, a row a list of these; `DataCell` draws them. One fact per
 * cell: text with an optional second line, a status badge, money, a person, a link to a record.
 */
export const cell = {
  /** Text, with an optional second line. */
  text: (v: string, s = "", cls = "", scls = ""): Cell => ({ isTx: 1, v, s, cls, scls }),
  /** Text, or a muted dash when there is none. */
  maybe: (v: string | null | undefined, cls = ""): Cell => ({ isTx: 1, v: v || "—", s: "", cls: v ? cls : "mu", scls: "" }),
  /** A number, right-aligned in tabular figures. */
  num: (v: string, s = ""): Cell => ({ isTx: 1, v, s, cls: "num", scls: "", al: "rt" }),
  /** Money, right-aligned. */
  money: (v: string, s = "", cls = ""): Cell => ({ isM: 1, v, s, cls, al: "rt" }),
  /** A status badge in one of the status tones. */
  badge: (v: string, k: string): Cell => ({ isBadge: 1, v, k }),
  /** A risk flag with its icon. */
  risk: (v: string, k: string, ic?: string): Cell => ({ isRisk: 1, v, k, ic: ic ?? (k === "ok" ? I.check : k === "bad" ? I.alert : I.clock) }),
  /** A person: initials, name and a second line. */
  company: (name: string, code: string, color: string, logo?: string | null): Cell => ({ isCo: 1, v: name, co: { code, color, logo } }),
  person: (v: string, ini: string, s = "", k = ""): Cell => ({ isP: 1, v, ini, s, k }),
  /** A record's identifier that opens the record. */
  id: (v: string, go: () => void, s = ""): Cell => ({ isId: 1, v, s, go: stop(go), idc: "" }),
  /** A record's name that opens the record. */
  name: (v: string, go: () => void, s = ""): Cell => ({ isId: 1, v, s, go: stop(go), idc: "nm" }),
  tags: (tags: { v: string; k: string }[]): Cell => ({ isTags: 1, tags }),
  /** A short verdict with one dot per thing it sums up. */
  dots: (v: string, dots: string[], k: string): Cell => ({ isDots: 1, v, dots, k }),
  /** Small channel icons, each with a tooltip. */
  channels: (ch: { ic: string; k: string; t: string }[]): Cell => ({ isCh: 1, ch }),
  bar: (v: string, pct: string, k: string): Cell => ({ isBar: 1, v, pct, k }),
  button: (v: string, go: () => void, cls = ""): Cell => ({ isBtn: 1, v, go: stop(go), cls }),
  actions: (list: [label: string, go: () => void, cls?: string][]): Cell => ({ isActs: 1, acts: list.map(([l, go, cls]) => ({ l, go: stop(go), cls: cls ?? "" })), al: "" }),
  check: (on: boolean, go: () => void): Cell => ({ isChk: 1, on: on ? "on" : "", go: stop(go) }),
  more: (): Cell => ({ isMore: 1, al: "rt" }),
  /** "⋯" with the row's own actions; nothing when there are none. `bad` marks the destructive ones. */
  menu: (items: [label: string, go: () => void, cls?: string][]): Cell => ({ isMore: 1, al: "rt", menu: items.map(([l, go, cls]) => ({ l, go, cls })) }),
  /** A load's three papers as a meter, "2/3": red for the gaps once the proof of delivery is overdue. */
  docs: (n: number, podMissing: boolean): Cell => ({ isDocs: 1, v: `${n}/3`, k: n === 3 ? "ok" : podMissing ? "bad" : "mu", bars: [0, 1, 2].map((i) => (i < n ? "ok" : podMissing ? "bad" : "off")) }),
};

/** A column heading; `right` for numbers and money. */
export const heading = (l: string, right = false): { l: string; al: string } => ({ l, al: right ? "rt" : "" });
