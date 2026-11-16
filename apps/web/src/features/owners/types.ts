// The shapes the owner screens draw. Built from API records by ./owner-view.ts and ./owner-form.ts.
import type { Fn, Row } from "@/features/console/view";

export type LineChart = {
  vb: string;
  w: string;
  path: string;
  pts: {
    l: string;
    v: string;
    x: string;
    y: string;
    lab: boolean;
    tip: string;
    lp: string;
    aria: string;
  }[];
  ref?: {
    y: string;
    l: string;
  } | null;
  ticks: string[];
  grid: string;
  aria: string;
};


export type OwnerFormFieldData = {
  /** Writes the field's value (inputs and read-only fields that can still be cleared). */
  set?: (value: string) => void;
  type?: string;
  err?: string;
  k: string;
  l: string;
  v?: string;
  span: string;
  ph?: string;
  mono?: string;
  hint: string;
  req?: string;
  id?: string;
  isInput: boolean;
  isRo: boolean;
  isDd: boolean;
  isSeg: boolean;
  opts?: ({
    l: string;
    on: string;
    p: "true" | "false";
    go: Fn;
  })[];
  oid?: string;
  shown?: string;
  aria?: string;
  ab?: string;
  vcls?: string;
  open?: boolean;
  exp?: "false" | "true";
  toggle?: Fn;
  close?: Fn;
  search?: boolean;
  qph?: string;
  q?: string;
  setQ?: Fn;
  head?: string;
  dopts?: ({
    l: string;
    ab: string;
    on: string;
    sel: "false" | "true";
    go: Fn;
  })[];
  none?: boolean;
  hasOther?: boolean;
  otherOn?: string;
  otherSel?: "false" | "true";
  pickOther?: Fn;
  otherT?: string;
  otherD?: string;
  showOther?: boolean;
  otherL?: string;
  otherPh?: string;
  ov?: string;
  setOther?: Fn;
};


export type OwnerFormView = {
  edit: boolean;
  title: string;
  crumb: string;
  back: Fn;
  sub: string;
  ent: ({
    l: string;
    d: string;
    on: string;
    p: "true" | "false";
    go: Fn;
  })[];
  showMatch: boolean;
  linked?: {
    n: string;
    ini: string;
    role: string;
    d: string;
    unlink: Fn;
  } | null;
  matches: {
    n: string;
    ini: string;
    role: string;
    d: string;
    owner: boolean;
    k: string;
    b: string;
    go: Fn;
    /** "Not the same person": recorded with the owner, so the pair isn't offered again. */
    dismiss: Fn;
  }[];
  find: string;
  setFind: (value: string) => void;
  ident: OwnerFormFieldData[];
  contact: OwnerFormFieldData[];
  rows: ({
    ufld: {
      isDd: boolean;
      isInput: boolean;
      isSeg: boolean;
      oid: string;
      shown: string;
      aria: string;
      ab: string;
      vcls: string;
      open: boolean;
      exp: "false" | "true";
      toggle: Fn;
      close: Fn;
      search: boolean;
      qph: string;
      q: string;
      setQ: Fn;
      head: string;
      dopts: ({
        l: string;
        ab: string;
        on: string;
        sel: "false" | "true";
        go: Fn;
      })[];
      none: boolean;
      hasOther: boolean;
      otherOn: string;
      otherSel: "false" | "true";
      pickOther: Fn;
      otherT: string;
      otherD: string;
      showOther: boolean;
      otherL: string;
      otherPh: string;
      ov: string;
      setOther: Fn;
      k: string;
      l: string;
      span: string;
      hint: string;
      isRo: boolean;
      req: string;
      ddsz?: string;
    };
    terms: {
      isDd: boolean;
      isInput: boolean;
      isSeg: boolean;
      oid: string;
      shown: string;
      aria: string;
      ab: string;
      vcls: string;
      open: boolean;
      exp: "false" | "true";
      toggle: Fn;
      close: Fn;
      search: boolean;
      qph: string;
      q: string;
      setQ: Fn;
      head: string;
      dopts: ({
        l: string;
        ab: string;
        on: string;
        sel: "false" | "true";
        go: Fn;
      })[];
      none: boolean;
      hasOther: boolean;
      otherOn: string;
      otherSel: "false" | "true";
      pickOther: Fn;
      otherT: string;
      otherD: string;
      showOther: boolean;
      otherL: string;
      otherPh: string;
      ov: string;
      setOther: Fn;
      k: string;
      l: string;
      span: string;
      hint: string;
      isRo: boolean;
      req: string;
      ddsz?: string;
    };
    drives: {
      isDd: boolean;
      isInput: boolean;
      isSeg: boolean;
      oid: string;
      shown: string;
      aria: string;
      ab: string;
      vcls: string;
      open: boolean;
      exp: "false" | "true";
      toggle: Fn;
      close: Fn;
      search: boolean;
      qph: string;
      q: string;
      setQ: Fn;
      head: string;
      dopts: ({
        l: string;
        ab: string;
        on: string;
        sel: "false" | "true";
        go: Fn;
      })[];
      none: boolean;
      hasOther: boolean;
      otherOn: string;
      otherSel: "false" | "true";
      pickOther: Fn;
      otherT: string;
      otherD: string;
      showOther: boolean;
      otherL: string;
      otherPh: string;
      ov: string;
      setOther: Fn;
      k: string;
      l: string;
      span: string;
      hint: string;
      isRo: boolean;
      req: string;
      ddsz?: string;
    };
    pct: string;
    since: string;
    st: string;
    sk: string;
    drv: string;
    unit: string;
    note: string;
    rm: Fn;
    setPct: (value: string) => void;
    setSince: (value: string) => void;
    /** The agreement's terms, when the row starts a new agreement. */
    termsFields: OwnerFormFieldData[];
    err: string;
  })[];
  addUnit: Fn;
  cat: {
    l: string;
    k: string;
    d: string;
  };
  status: ({
    l: string;
    on: string;
    p: "false" | "true";
    go: Fn;
  })[];
  statusD: string;
  fin: boolean;
  pay: OwnerFormFieldData[];
  portal: boolean;
  portalTog: Fn;
  portalChk: "true" | "false";
  portalOn: string;
  loginEmail: string;
  perms: ({
    k: string;
    l: string;
    on: string;
    chk: "true" | "false";
    go: Fn;
  })[];
  permN: string;
  presets: {
    l: string;
    on: string;
    go: Fn;
  }[];
  cancel: Fn;
  save: Fn;
  saveL: string;
  identT: string;
  identS: string;
  hasMatches: boolean;
  summary: {
    l: string;
    v: string;
    s: string;
  }[];
  change?: {
    t: string;
    keep: string[];
    moveT: string;
    move: string[];
  } | null;
  checks: {
    t: string;
    d: string;
    k: string;
  }[];
  dupWarn: boolean;
  checksT: string;
  setLogin: (value: string) => void;
  problem: string | null;
  busy: boolean;
  invite: { email: string; password: string; open: Fn; done: Fn } | null;
};

export type OwnerPortalView = {
  n: string;
  ini: string;
  k: string;
  uini: string;
  uname: string;
  scope: string;
  preview: boolean;
  exit: Fn;
  tabs: {
    l: string;
    on: string;
    go: Fn;
  }[];
  t: {
    ov: boolean;
    eq: boolean;
    loads: boolean;
    stmt: boolean;
    exp: boolean;
    mt: boolean;
    docs: boolean;
  };
  hello: string;
  sub: string;
  showNext: boolean;
  next: {
    t: string;
    v: string;
    d: string;
  };
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[];
  hiddenN: string;
  units: {
    u: string;
    ymm: string;
    kind: string;
    s: string;
    sk: string;
    now: string;
    det: string;
    drv: string;
    wk: string;
    svc: string;
  }[];
  ucls: string;
  showMap: boolean;
  map?: {
    water: string;
    states: string;
    minor: string;
    major: string;
    cities: {
      n: string;
      x: number;
      y: number;
      cls: string;
    }[];
    shields: {
      n: string;
      x: number;
      y: number;
    }[];
    cx: string;
    cy: string;
    trucks: {
      unit: string;
      x: number;
      y: number;
      h: string;
      k: string;
      cls: string;
      aria: string;
    }[];
  } | null;
  now: {
    u: string;
    s: string;
    sk: string;
    lane: string;
    loc: string;
    fresh: string;
    fk: string;
    d: string;
  }[];
  foot: string;
  eq: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
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
  sum: {
    l: string;
    v: string;
    s: string;
  }[];
  sl: {
    u: string;
    d: string;
    g: string;
    c: string;
    n: string;
  }[];
  past: {
    p: string;
    d: string;
    v: string;
  }[];
  canDl: boolean;
  ft: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  hasFuel: boolean;
  noFuel: string;
  exp: {
    t: string;
    d: string;
    v: string;
  }[];
  hasExp: boolean;
  mt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  dt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
};

export type OwnerView = {
  /** The range's label, e.g. "Nov 2–8". */
  rl: string;
  /** What the record's buttons do. */
  actions: { message: Fn; banner: Fn; finalAccounting: Fn; transfer: Fn; addEquipment: Fn; exportLoads: Fn; exportYear: Fn; schedule: Fn; upload: Fn; invite: Fn };
  canManage: boolean;
  n: string;
  ini: string;
  ek: string;
  el: string;
  ck: string;
  cl: string;
  st: string;
  sk: string;
  sub: string;
  edit: Fn;
  canRun: boolean;
  openStmt: Fn;
  hasStmt: boolean;
  portalPreview: Fn;
  hasPortal: boolean;
  tabs: {
    l: string;
    n: string;
    on: string;
    go: Fn;
  }[];
  t: {
    ov: boolean;
    eq: boolean;
    live: boolean;
    loads: boolean;
    fuel: boolean;
    stmt: boolean;
    mt: boolean;
    docs: boolean;
    acc: boolean;
  };
  ranges: {
    l: string;
    on: string;
    go: Fn;
  }[];
  units: {
    l: string;
    on: string;
    go: Fn;
  }[];
  filt: string;
  fin: boolean;
  noFin: boolean;
  banner?: {
    k: string;
    t: string;
    d: string;
    b: string;
  } | null;
  cards: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[];
  act5: boolean;
  onb: boolean;
  endc: boolean;
  showMoney: boolean;
  mm: {
    title: string;
    steps: {
      l: string;
      s: string;
      v: string;
      k: string;
    }[];
    bar: {
      k: string;
      w: string;
      l: string;
    }[];
    outside: {
      t: string;
      v: string;
      s: string;
    }[];
    hasOut: boolean;
  };
  ch1: {
    ticks: string[];
    legend: {
      n: string;
      k: string;
    }[];
    cols: {
      l: string;
      tot: string;
      b: string;
      title: string;
      segs: {
        k: string;
        h: string;
        on: boolean;
      }[];
    }[];
  };
  ch2: {
    vb: string;
    ticks: string[];
    w: string;
    legend: {
      n: string;
      k: string;
    }[];
    paths: {
      k: string;
      d: string;
    }[];
    pts: {
      l: string;
      x: string;
      dots: {
        k: string;
        y: string;
      }[];
      tip: {
        k: string;
        n: string;
        v: string;
      }[];
      aria: string;
    }[];
    ends: {
      k: string;
      v: string;
      y: string;
    }[];
    aria: string;
    p: string[];
  };
  ch3: {
    n: string;
    v: string;
    s: string;
    k: string;
    w: string;
    neg: string;
  }[];
  ch4: {
    n: string;
    v: string;
    segs: {
      k: string;
      w: string;
      t: string;
    }[];
  }[];
  people: {
    n: string;
    ini: string;
    d: string;
    note: string;
    roles: {
      l: string;
      k: string;
    }[];
  }[];
  hasWho: boolean;
  who: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
    fz: string;
  };
  eq: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  map: {
    water: string;
    states: string;
    minor: string;
    major: string;
    cities: {
      n: string;
      x: number;
      y: number;
      cls: string;
    }[];
    shields: {
      n: string;
      x: number;
      y: number;
    }[];
    cx: string;
    cy: string;
    trucks: {
      unit: string;
      x: number;
      y: number;
      h: string;
      k: string;
      cls: string;
      aria: string;
    }[];
  };
  live: {
    u: string;
    k: string;
    d: string;
    s: string;
    sk: string;
    loc: string;
    fresh: string;
    fk: string;
    lane: string;
    go: Fn;
  }[];
  liveN: string;
  liveSub: string;
  lf: {
    l: string;
    n: string;
    on: string;
    go: Fn;
  }[];
  lt: {
    cols: string;
    fz: string;
    rows: Row[];
    head: {
      l: string;
      al: string;
    }[];
  };
  ot: {
    ticks: string[];
    legend: {
      n: string;
      k: string;
    }[];
    cols: {
      l: string;
      tot: string;
      b: string;
      title: string;
      segs: {
        k: string;
        h: string;
        on: boolean;
      }[];
    }[];
  };
  otSub: string;
  fsum: {
    l: string;
    v: string;
  }[];
  ft: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  xt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  fch: {
    ticks: string[];
    legend: {
      n: string;
      k: string;
    }[];
    cols: {
      l: string;
      tot: string;
      b: string;
      title: string;
      segs: {
        k: string;
        h: string;
        on: boolean;
      }[];
    }[];
  };
  stt: {
    cols: string;
    fz: string;
    rows: Row[];
    head: {
      l: string;
      al: string;
    }[];
  };
  past: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  esc: {
    v: string;
    d: string;
    i: string;
  };
  wk: {
    l: string;
    v: string;
    s: string;
    k: string;
  }[];
  stSub: string;
  mt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  upcoming: {
    u: string;
    n: string;
    s: string;
    k: string;
  }[];
  dt: {
    cols: string;
    fz: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  acc: {
    portal: string;
    pk: string;
    n: string;
    presets: {
      l: string;
      on: string;
      go: Fn;
    }[];
    perms: ({
      k: string;
      l: string;
      on: string;
      chk: "true" | "false";
      go: Fn;
      d: string;
    })[];
    users: {
      n: string;
      ini: string;
      role: string;
      scope: string;
      last: string;
      k: string;
    }[];
    rules: string[];
  };
  fa?: {
    kv: {
      k: string;
      v: string;
    }[];
    steps: {
      t: string;
      d: string;
      k: string;
    }[];
  };
  chk?: {
    sub: string;
    done: string;
    pct: string;
    items: {
      t: string;
      d: string;
      k: string;
    }[];
  };
};

