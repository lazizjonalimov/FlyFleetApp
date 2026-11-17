import type { Fn, Row } from "@/features/console/view";

export type StatementView = {
  o: {
    id: string;
    entity: string;
    name: string;
    dba: string;
    cat: string;
    contact?: string;
    ctitle?: string;
    email: string;
    ph: string;
    addr: string;
    city: string;
    state: string;
    zip: string;
    tax: string;
    since: string;
    status: string;
    sk: string;
    roles: string[];
    drives: string;
    portal: string;
    pk: string;
    payRun?: boolean;
    first?: string;
    last?: string;
    person?: string;
  };
  n: string;
  ini: string;
  short: string;
  period: string;
  pays: string;
  st: string;
  sk: string;
  back: Fn;
  toOwner: Fn;
  toList: Fn;
  canApprove: boolean;
  canPay: boolean;
  noFin: boolean;
  sum: {
    l: string;
    v: string;
    s: string;
    k: string;
  }[];
  secs: {
    u: string;
    kind: string;
    title: string;
    terms: string;
    ts: string;
    drv: string;
    lines: {
      t: string;
      s: string;
      v: string;
      vc: string;
      cls: string;
    }[];
    not: {
      a: string;
      v: string;
      d: string;
    }[];
    hasNot: boolean;
    k: string;
    go: Fn;
    net: string;
  }[];
  many: boolean;
  callout?: {
    t: string;
    d: string;
  } | null;
  lt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  ltNote: string;
  esc: {
    k: string;
    v: string;
  }[];
  trail: {
    who: string;
    what: string;
    when: string;
    k: string;
  }[];
  netV: string;
  rules: string[];
};
