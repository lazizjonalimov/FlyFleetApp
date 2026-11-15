// The shape of everything the screens render: produced by the console model for the current screen, role and
// interface state. Namespaces (D, LT, OW …) are filled in for the screen being shown.

/** An event handler bound to a control. */
export type Fn = (event?: unknown) => void;

/** A line chart of weekly values with an optional reference line. */
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

export type Cell = {
  isChk?: number;
  on?: string;
  go?: Fn;
  isTx?: number;
  v?: string;
  s?: string;
  cls?: string;
  scls?: string;
  isBadge?: number;
  k?: string;
  isBtn?: number;
  isId?: number;
  idc?: string;
  al?: string;
  isM?: number;
  isMore?: number;
  isP?: number;
  ini?: string;
  isTags?: number;
  tags?: {
    v: string;
    k: string;
  }[];
  isDots?: number;
  dots?: string[];
  isCh?: number;
  ch?: {
    ic: string;
    k: string;
    t: string;
  }[];
  isActs?: number;
  acts?: {
    l: string;
    go: Fn;
    cls: string;
  }[];
  isRisk?: number;
  ic?: string;
  isBar?: number;
  pct?: string;
  isDocs?: number;
  bars?: string[];
};

export type OwnerFormFieldData = {
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

export type ComboboxField = {
  l: string;
  v?: string;
  conf?: string;
  k?: string;
  st?: string;
  mono?: string;
  note?: string;
  ph?: string;
  money?: boolean;
  cls?: string;
  ic?: string;
  hasConf?: boolean;
  pct?: string;
  isDd: boolean;
  noDd?: boolean;
  dd?: string;
  key?: string;
  half?: string;
  isInput?: boolean;
  isSeg?: boolean;
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
  ddsz?: string;
  span?: string;
  hint?: string;
  opts?: ({
    l: string;
    on: string;
    p: "true" | "false";
    go?: Fn;
  })[] | null;
  on?: string;
  other?: boolean;
  id?: string;
  req?: string;
  isRo?: boolean;
};

export type Row = {
  open: Fn;
  cells: Cell[];
  cls?: string;
  key?: string;
  q?: string;
  st?: string;
  sk?: {
    n?: string;
    loads?: number;
    bal?: number;
    ot?: number;
    name?: string;
    st?: string;
    q?: number;
    emp?: string;
    tr?: number;
    act?: number;
    unit?: string;
    year?: number;
    make?: string;
    own?: string;
    odo?: number;
    type?: string;
    net?: number;
  };
  op?: boolean;
  team?: boolean;
  qk?: string;
  cat?: string;
  ent?: string;
  k?: string;
  ownerCat?: string;
  ty?: string;
  x?: {
    title: string;
    meta: string;
    lines: {
      k: string;
      a: string;
      b: string;
    }[];
  } | null;
};

export type AssignPanelView = {
  id: string;
  lane: string;
  when: string;
  req: string[];
  conflict: boolean;
  elig: string;
  cands: ({
    n: string;
    ini: string;
    sub: string;
    best: boolean;
    changed: boolean;
    on: string;
    cls: string;
    pk: string;
    why: {
      k: string;
      t: string;
      ic: string;
    }[];
    pressed: "true" | "false";
  })[];
  eq: {
    unit: string;
    kind: string;
    sub: string;
    st: string;
    k: string;
  }[];
  cta: string;
  blocked: boolean;
};

export type AccountMenuView = {
  t: string;
  ic: string;
  kbd: string;
}[];

export type AssistantView = {
  uses: string;
  hidden: string;
  draft: boolean;
  items: {
    n: string;
    t: string;
    src: {
      l: string;
      ic: string;
      go: Fn;
    }[];
  }[];
  sugg: string[];
};

export type SignInView = {
  form: boolean;
  org: boolean;
  next: Fn;
  back: Fn;
  orgs: {
    n: string;
    ini: string;
    c: string;
    d: string;
    cls: string;
    inv: number;
    acts: {
      l: string;
      cls: string;
      go: Fn;
    }[];
  }[];
};

export type DispatchBoardView = {
  sub: string;
  sum: {
    label: string;
    n: string;
    k: string;
    on: string;
  }[];
  queue: {
    id: string;
    a: string;
    b: string;
    when: string;
    mi: number;
    eq: string;
    cust: string;
    rate: number;
    urg: string;
    uk: string;
    hot?: number;
    rateF: string;
    cls: string;
    canAssign: boolean;
    assign: Fn;
  }[];
  qn: string;
  hours: string[];
  rows: {
    n: string;
    ini: string;
    units: string;
    chip: string;
    ck: string;
    pk: string;
    blocks: {
      id: string;
      lane: string;
      k: string;
      l: string;
      w: string;
      cls: string;
      alert: boolean;
      title: string;
    }[];
    empty: boolean;
    cls: string;
  }[];
  nowP: string;
  nowF: string;
  wp: string;
  showQueue: boolean;
};

export type FinancialsView = {
  w: {
    showChart: boolean;
    showTable: boolean;
    c: string;
    t: string;
    cp: "true" | "false";
    tp: "false" | "true";
    chart: Fn;
    table: Fn;
    bars: {
      h: string;
      cls: string;
      lab: string;
      tip: boolean;
      tv: string;
      tl: string;
      tcls: string;
      aria: string;
      on: Fn;
    }[];
    xl: {
      l: string;
    }[];
    rows: {
      l: string;
      v: string;
    }[];
  };
  c: {
    showChart: boolean;
    showTable: boolean;
    c: string;
    t: string;
    cp: "true" | "false";
    tp: "false" | "true";
    chart: Fn;
    table: Fn;
    rows: {
      n: string;
      v: string;
      pct: string;
      w: string;
      cls: string;
    }[];
  };
  s: {
    showChart: boolean;
    showTable: boolean;
    c: string;
    t: string;
    cp: "true" | "false";
    tp: "false" | "true";
    chart: Fn;
    table: Fn;
    parts: {
      n: string;
      f: string;
      v: string;
      cls: string;
      pct: string;
      showPct: boolean;
      amt: string;
      tip: boolean;
      tcls: string;
      aria: string;
      on: Fn;
    }[];
    rows: {
      n: string;
      v: string;
      pct: string;
    }[];
  };
  off: Fn;
};

export type CreateMenuView = {
  t: string;
  s: string;
  ic: string;
  go: Fn;
}[];

export type DashboardView = {
  title: string;
  sub: string;
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
    go: Fn;
  }[];
  attn: {
    tag: string;
    k: string;
    mod?: string;
    title: string;
    ref: string;
    rc: string;
    meta: string;
    time: string;
    action: string;
    go: Fn;
  }[];
  attnN: string;
  t: {
    title: string;
    sub: string;
    link: string;
    go: Fn;
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  side: {
    title: string;
    note?: string;
    isAvail?: number;
    rows?: {
      label: string;
      total: number;
      segs: {
        l: string;
        n: string;
        k: string;
        w: string;
      }[];
    }[];
    isMoney?: number;
    items?: {
      label?: string;
      v?: string;
      s?: string;
      k: string;
      a?: string;
      b?: string;
      chip?: string;
    }[];
    foot?: string;
    link?: string;
    go?: Fn;
    isList?: number;
  }[];
  canCreate: boolean;
  biz: boolean;
};

export type LoadDrawerView = {
  id?: string;
  ref?: string;
  st?: string;
  rk?: string;
  rkt?: string;
  cust?: string;
  pu?: string;
  puT?: string;
  pf?: string;
  del?: string;
  delT?: string;
  df?: string;
  drv?: string;
  trk?: string;
  trl?: string;
  mi?: number;
  rate?: number;
  docs?: {
    k: string;
    state: string;
    tk: string;
    act: string;
  }[];
  eq?: string;
  arr?: string;
  dep?: string;
  eta?: string;
  late?: string;
  pos?: string;
  done?: number;
  k?: string;
  miF?: string;
  rkTxt?: string;
  alert?: boolean;
  aK?: string;
  aTitle?: string;
  aText?: string;
  aBtn?: string;
  docsF?: string;
  docK?: string;
  stops?: {
    n: string;
    type: string;
    fac: string;
    city: string;
    appt: string;
    done: number;
    todo: number;
    k: string;
    lc: string;
    stTxt: string;
    sk: string;
  }[];
  assign?: {
    k: string;
    v: string;
    tk: string;
    sub: string;
  }[];
  finRows?: {
    k: string;
    v: string;
  }[];
  total?: string;
  rpm?: string;
  activity?: {
    who: string;
    what: string;
    when: string;
    k: string;
    src: string;
  }[];
  primary?: string;
  full?: Fn;
};

export type DriverView = {
  n: string;
  ini: string;
  pk: string;
  st: string;
  sk: string;
  ql: string;
  qk: string;
  sub: string;
  alert: boolean;
  aK: string;
  aT: string;
  aD: string;
  aB: string;
  q: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  loads: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  now: {
    id: string;
    lane: string;
    st: string;
    k: string;
    t: string;
    go: Fn;
  }[];
  trk: string;
  trl: string;
  pos: string;
  chans: {
    n: string;
    d: string;
    ic: string;
    k: string;
    act: string;
  }[];
  lic: string;
  stats: {
    k: string;
    v: string;
  }[];
};

export type DocReviewView = {
  fields: {
    l: string;
    v: string;
    conf: string;
    pct: string;
    k: string;
    st: string;
    ic: string;
    mono: string;
    note: string;
    cls: string;
  }[];
};

export type DispatchTeamsView = {
  teams: {
    n: string;
    d: string;
    ini: string;
    c: string;
    on: string;
  }[];
  team: {
    n: string;
    sub: string;
  };
  disp: {
    n: string;
    i: string;
    lead: boolean;
  }[];
  trucks: {
    u: string;
    d: string;
    dk: string;
  }[];
  can: string[];
  cant: string[];
  cov: {
    l: string;
    n: string;
    k: string;
    w: string;
  }[];
  hist: {
    who: string;
    what: string;
    when: string;
  }[];
  preview: Fn;
};

export type ForbiddenView = {
  mod: string;
  perm: string;
};

export type FuelView = {
  sub: string;
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[];
  tabs: {
    l: string;
    n: string;
    dot: string;
    on: string;
    cur?: "page";
    go: Fn;
  }[];
  isP: boolean;
  isM: boolean;
  isR: boolean;
  isT: boolean;
  count: string;
  foot: string;
  t: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  rcpts: {
    t: string;
    d: string;
    st: string;
    k: string;
    go: Fn;
  }[];
  prov: {
    n: string;
    d: string;
    ini: string;
    k: string;
    on: number;
    off: boolean;
  }[];
  mi: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  map: {
    vb: string;
    border: string;
    roads: string;
    tx: string;
    okp: string;
    plan: string;
    xing: {
      x: string;
      y: string;
    };
    truck: {
      x: string;
      y: string;
    };
    labels: {
      t: string;
      x: string;
      y: string;
    }[];
    cities: {
      n: string;
      x: string;
      y: string;
    }[];
    aria: string;
  };
  imps: {
    ext: string;
    t: string;
    d: string;
    st: string;
    k: string;
  }[];
  rt: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  rnote: string;
  steps: {
    n: string;
    t: string;
    d: string;
    w: string;
    cls: string;
  }[];
  past: {
    q: string;
    d: string;
    amt: string;
    st: string;
  }[];
  hist: {
    who: string;
    what: string;
    when: string;
    k: string;
  }[];
  rates: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  scan: Fn;
  connect: Fn;
  importMi: Fn;
  addTrip: Fn;
  reports: Fn;
};

export type IntegrationsView = {
  cards: {
    n: string;
    tag: string;
    cat: string;
    ic: string;
    k: string;
    st: string;
    sk: string;
    kv: {
      k: string;
      v: string;
    }[];
    acts: {
      l: string;
      cls: string;
    }[];
  }[];
  t: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
};

export type ListView = {
  tabs?: {
    l: string;
    n: string;
    on: string;
    go?: Fn;
  }[] | null;
  kpis?: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[] | null;
  kpiN: number;
  band?: {
    title: string;
    sub: string;
    total: string;
    segs: {
      l: string;
      v: string;
      k: string;
      w: string;
    }[];
  } | null;
  callout?: {
    k: string;
    ic: string;
    t: string;
    d: string;
    b: string;
    go?: Fn;
  } | null;
  chips: string[];
  adds: string[];
  hidden: string;
  group: string;
  title: string;
  sub: string;
  ph: string;
  actions: {
    l: string;
    cls: string;
    ic: string;
    go: Fn;
  }[];
  cols: string;
  head: {
    l: string;
    al: string;
    nogo?: boolean;
    srt?: boolean;
    son?: string;
    sic?: string;
    aria?: string;
    go?: Fn;
  }[];
  rows: Row[];
  foot: string;
  tsc: string;
  qv: string;
  fz?: string;
  scroll?: boolean;
  setQ?: Fn;
  selectable?: boolean;
  allOn?: string;
  allAll?: boolean;
  allSome?: boolean;
  allAria?: string;
  toggleAll?: Fn;
  bulk?: boolean;
  selN?: string;
  bulkActs?: string[];
  clearSel?: Fn;
  minw?: string;
};

export type LoadView = {
  id: string;
  title: string;
  k: string;
  st: string;
  rk: string;
  rkTxt: string;
  sub: string;
  steps: {
    l: string;
    t: string;
    st: string;
    done: number;
  }[];
  alert: boolean;
  aK: string;
  aTitle: string;
  aText: string;
  aBtn: string;
  a2: string;
  fresh: string;
  fk: string;
  moving: boolean;
  oLab: string;
  dLab: string;
  dK: string;
  tLab: string;
  stats: {
    k: string;
    v: string;
    tk: string;
  }[];
  stops: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  docs: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  drv: string;
  dini: string;
  dpk: string;
  dsub: string;
  asg: {
    k: string;
    v: string;
  }[];
  fin: {
    k: string;
    v: string;
  }[];
  total: string;
  cust: string;
  c1: string;
  c1i: string;
  act: {
    who: string;
    what: string;
    when: string;
    k: string;
    src: string;
  }[];
};

export type LoadsView = {
  range: string;
  total: string;
  sub: string;
  cols: string;
  head: {
    l: string;
    al: string;
  }[];
  rows: Row[];
  tabs: {
    label: string;
    n: string;
    on: string;
    go: Fn;
  }[];
  noFin: boolean;
  allOn: string;
  bulk: boolean;
  selN: string;
};

export type MapView = {
  water: string;
  states: string;
  minor: string;
  major: string;
  trail: string;
  plan: string;
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
  trucks: {
    unit: string;
    x: number;
    y: number;
    h: string;
    k: string;
    cls: string;
    aria: string;
  }[];
  fences: {
    l: string;
    x: number;
    y: number;
    d: string;
    k: string;
  }[];
  clusters: {
    n: string;
    x: number;
    y: number;
    aria: string;
  }[];
  sub: string;
  vn: string;
  filters: {
    l: string;
    n: string;
    k: string;
    on: string;
  }[];
  list: {
    unit: string;
    drv: string;
    line: string;
    spd: string;
    sk: string;
    fresh: string;
    fk: string;
    k: string;
    sel: string;
  }[];
  spark: string;
  zx: string;
  zw: string;
  openLoad: Fn;
};

export type AddModalView = {
  title: string;
  sub: string;
  ic: string;
  size: string;
  hasSteps: boolean;
  steps: {
    l: string;
    n: string;
    cls: string;
    cur?: "step";
    done: boolean;
    todo: boolean;
  }[];
  left: {
    l: string;
    cls: string;
    go: Fn;
  }[];
  right: {
    l: string;
    cls: string;
    go: Fn;
  }[];
  note: string;
  isChoose: boolean;
  isPhoto: boolean;
  isReview: boolean;
  isManual: boolean;
  isUpload: boolean;
  isMap: boolean;
  isCheck: boolean;
  isDone: boolean;
  ddCls: string;
  bulk?: boolean;
  bulkT?: string;
  bulkGo?: Fn;
  choices?: {
    t: string;
    d: string;
    ic: string;
    tag: string;
    cls: string;
    reads: string[];
    hasReads: boolean;
    go: Fn;
  }[];
  readMeta?: string;
  lineage?: string;
  banner?: {
    k: string;
    t: string;
    d: string;
  };
  fields?: ComboboxField[];
  finHidden?: boolean;
  isCdl?: boolean;
  isReg?: boolean;
  isRate?: boolean;
  isPod?: boolean;
  isInsp?: boolean;
  isRcpt?: boolean;
  reg?: {
    plate?: string;
    exp?: string;
    vin?: string;
    year?: string;
    make?: string;
    model?: string;
    gvwr?: string;
    owner?: string;
    expLo?: string;
    plateLo?: string;
  };
  bannerIc?: string;
  hasInsp?: boolean;
  isum?: {
    k: string;
    v: string;
  }[];
  violN?: string;
  viol?: {
    code: string;
    t: string;
    unit: string;
    uid: string;
    oos: boolean;
    basic: string;
    pts: string;
    conf: string;
    ck: string;
    link: string;
    lic: string;
    note: string;
    cls: string;
  }[];
  rc?: {
    lh: string;
    fs: string;
    tot: string;
  };
  hasLines?: boolean;
  lines?: {
    k: string;
    v: string;
  }[];
  total?: string;
  terms?: string;
  hasAfter?: boolean;
  after?: {
    t: string;
    d: string;
    items: {
      t: string;
      k: string;
    }[];
  };
  tmplD?: string;
  upNote?: string;
  pick?: Fn;
  slots?: {
    t: string;
    d: string;
    go: Fn;
  }[];
  slotCols?: string;
  tips?: string[];
  alt?: string;
  toggle?: string;
  groups?: {
    l: string;
    fields: ComboboxField[];
  }[];
  sum?: {
    l: string;
    v: string;
    k: string;
    s: string;
  }[];
  issN?: string;
  opts?: string[];
  iss?: ({
    row: string;
    name: string;
    issue: string;
    k: string;
    ic: string;
    hasOpts: boolean;
    fix: string;
    aria: string;
    opts: ({
      l: string;
      on: string;
      p: "true" | "false";
    })[];
  })[];
  file?: string;
  fileExt?: string;
  fileMeta?: string;
  mapT?: string;
  mapD?: string;
  back?: Fn;
  mcols?: string;
  cols?: {
    col: string;
    sample: string;
    field: string;
    k: string;
    st: string;
    aria: string;
    ic: string;
    scls: string;
  }[];
  doneT?: string;
  doneD?: string;
  doneRows?: {
    t: string;
    n: string;
    k: string;
  }[];
};

export type MessagesView = {
  convs: {
    n: string;
    ini: string;
    pk: string;
    ch: string;
    last: string;
    t: string;
    unread: string;
    on: string;
    uw: string;
  }[];
  msgs: {
    sys?: number;
    k?: string;
    ic?: string;
    title?: string;
    body: string;
    meta: string;
    t: string;
    rx?: number;
    att?: string;
    tx?: number;
  }[];
  quick: string[];
};

export type MaintenanceView = {
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[];
  cols: {
    l: string;
    n: string;
    k: string;
    cards: {
      id: string;
      unit: string;
      title: string;
      pri: string;
      pk: string;
      meta: string;
      vendor: string;
      date: string;
      rts: string;
      rtsd: string;
      rk: string;
    }[];
  }[];
};

export type NewLoadView = {
  steps: {
    l: string;
    d: string;
    st: string;
    n: string;
    done: number;
    todo: number;
  }[];
};

export type NotificationsView = {
  un: string;
  k: string;
  ic: string;
  t: string;
  b: string;
  when: string;
  go: Fn;
}[];

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
  }[];
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
    done: string;
    pct: string;
    items: {
      t: string;
      d: string;
      k: string;
    }[];
  };
};

export type PaletteView = {
  groups: {
    l: string;
    items: {
      t: string;
      s: string;
      ic: string;
      go: Fn;
      badge: string;
      k: string;
      kbd: string;
      on: string;
    }[];
  }[];
  foot: string;
};

export type AlertPolicyView = {
  list: {
    l: string;
    v: string;
    k: string;
    on: string;
  }[];
  who: {
    ini: string;
    n: string;
    when: string;
    ch: {
      l: string;
      ic: string;
      k: string;
    }[];
  }[];
  prev: {
    k: string;
    v: string;
    s: string;
  }[];
};

export type CustomerPortalView = {
  list: {
    id: string;
    po: string;
    lane: string;
    when: string;
    st: string;
    k: string;
    on: string;
  }[];
  miles: {
    l: string;
    t: string;
    st: string;
    done: number;
  }[];
};

export type ReportsView = {
  cat: {
    l: string;
    items: {
      l: string;
      on: string;
      lock: boolean;
      cur?: "page";
      go: Fn;
    }[];
  }[];
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    sk: string;
  }[];
  weeks: {
    l: string;
    v: string;
    h: string;
    k: string;
  }[];
  aria: string;
  t: {
    cols: string;
    head: {
      l: string;
      al: string;
    }[];
    rows: Row[];
  };
  jobs: {
    n: string;
    d: string;
    st: string;
    k: string;
    dis: boolean;
  }[];
  isOnTime: boolean;
  isFuel: boolean;
  ot: LineChart;
  cpm?: LineChart;
  cpmView?: {
    chart: boolean;
    table: boolean;
    c: string;
    t: string;
    cp: "true" | "false";
    tp: "false" | "true";
    toChart: Fn;
    toTable: Fn;
    rows: {
      l: string;
      p: string;
      m: string;
      v: string;
    }[];
  };
  mpg?: {
    n: string;
    v: string;
    x: string;
    sl: string;
    sw: string;
    aria: string;
  }[];
  mpgRef?: string;
  mpgAx?: {
    l: string;
    x: string;
  }[];
  fk?: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    sk: string;
  }[];
};

export type TeamScopeView = {
  on: boolean;
  label: string;
  tip: string;
  preview: boolean;
};

export type SettingsView = {
  nav: {
    l: string;
    ic: string;
    on: string;
    go: Fn;
  }[];
  page: string;
  sub: string;
};

export type SafetyView = {
  cols: string;
  head: string[];
  rows: {
    n: string;
    ini: string;
    open: Fn;
    cells: {
      k: string;
      t: string;
      ic: string;
    }[];
    ok: string;
    ol: string;
  }[];
  kpis: {
    label: string;
    value: string;
    suffix: string;
    sub: string;
    k: string;
    sk: string;
  }[];
  queue: {
    t: string;
    who: string;
    conf: string;
    ck: string;
    src: string;
  }[];
};

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

export type StatesView = {
  sk: string[];
};

export type TruckView = {
  u: string;
  title: string;
  st: string;
  sk: string;
  back: Fn;
  assign: Fn;
  fin: boolean;
  ownTag: string;
  owner: {
    n: string;
    cat: string;
    k: string;
    go: Fn;
    link: boolean;
    kv: {
      k: string;
      v: string;
    }[];
  };
  now: {
    loc: string;
    fresh: string;
    fk: string;
    load: string;
    next: string;
    odo: string;
  };
  drivers: {
    n: string;
    ini: string;
    r: string;
    go: Fn;
  }[];
  team?: {
    t: string;
    d: string;
  } | null;
  specs: {
    k: string;
    v: string;
  }[];
  hist: {
    d: string;
    who: string;
    what: string;
    k: string;
  }[];
  asg: {
    n: string;
    how: string;
    from: string;
    to: string;
  }[];
  wk?: {
    k: string;
    v: string;
  }[] | null;
  maint: {
    wo: string;
    d: string;
    w: string;
    shop: string;
    s: string;
    k: string;
    cost: string;
  }[];
  docs: {
    t: string;
    d: string;
    k: string;
  }[];
  noMaint: boolean;
};

export type TeamView = {
  roles: {
    n: string;
    d: string;
    cnt: string;
    sys: number;
    on: string;
  }[];
  mem: string[];
  acts: string[];
  cols: string;
  groups: ({
    g: string;
    rows: ({
      m: string;
      sens: number;
      note: string;
      cls: string;
      cells: ({
        na: number;
        box: number;
        on?: number;
        cls?: string;
        pressed?: "true" | "false";
        aria?: string;
      })[];
    })[];
  })[];
  ovr: {
    who: string;
    ini: string;
    txt: string;
    t: string;
    k: string;
  }[];
  hist: {
    who: string;
    what: string;
    when: string;
  }[];
};

export type TeamTabsView = {
  l: string;
  n: string;
  go: Fn;
  on: string;
}[];

export interface ConsoleView {
  /** Icon paths by name. */
  I: Record<string, string>;
  A: AssignPanelView;
  ACCT: AccountMenuView;
  AI: AssistantView;
  AU: SignInView;
  B: DispatchBoardView;
  BZ: FinancialsView;
  CR: CreateMenuView;
  D: DashboardView;
  DL: LoadDrawerView;
  DP: DriverView;
  DR: DocReviewView;
  DT: DispatchTeamsView;
  FB: ForbiddenView;
  FU: FuelView;
  IN: IntegrationsView;
  L: ListView;
  LP: LoadView;
  LT: LoadsView;
  M: MapView;
  MD: AddModalView;
  MS: MessagesView;
  MT: MaintenanceView;
  NL: NewLoadView;
  NT: NotificationsView;
  OF: OwnerFormView;
  OP: OwnerPortalView;
  OW: OwnerView;
  PL: PaletteView;
  PO: AlertPolicyView;
  PT: CustomerPortalView;
  RP: ReportsView;
  SC: TeamScopeView;
  SET: SettingsView;
  SF: SafetyView;
  SM: StatementView;
  ST2: StatesView;
  TK: TruckView;
  TM: TeamView;
  TT: TeamTabsView;
  acctExp: "false" | "true";
  acctOn: string;
  aiOn: string;
  clearSel: Fn;
  closeDrawer: Fn;
  closeModal: Fn;
  closeOverlay: Fn;
  closePanel: Fn;
  closeToast: Fn;
  createExp: "false" | "true";
  ddOpen?: string;
  density: string;
  drawer?: string;
  exitPreview: Fn;
  fin: boolean;
  financeAccess?: boolean;
  frameH: string;
  fuelTab?: string;
  goAlerts: Fn;
  goAudit: Fn;
  goDash: Fn;
  goDispatch: Fn;
  goDocs: Fn;
  goDrivers: Fn;
  goFuel: Fn;
  goLoads: Fn;
  goMessages: Fn;
  goNew: Fn;
  goOwners: Fn;
  goReports: Fn;
  goReview: Fn;
  goSignin: Fn;
  goTracking: Fn;
  hasDrawer: boolean;
  hasModal: boolean;
  hasToast: boolean;
  isAI: boolean;
  isAcct: boolean;
  isConsole: boolean;
  isCreate: boolean;
  isDash: boolean;
  isDispatch: boolean;
  isDocReview: boolean;
  isDriver: boolean;
  isForbidden: boolean;
  isFuel: boolean;
  isInteg: boolean;
  isList: boolean;
  isLoad: boolean;
  isLoads: boolean;
  isMaint: boolean;
  isMenu: boolean;
  isMessages: boolean;
  isNew: boolean;
  isNotif: boolean;
  isOForm: boolean;
  isOPortal: boolean;
  isOwner: boolean;
  isPalette: boolean;
  isPolicy: boolean;
  isPortal: boolean;
  isReports: boolean;
  isSafety: boolean;
  isSettings: boolean;
  isSignin: boolean;
  isStates: boolean;
  isStmt: boolean;
  isTeam: boolean;
  isTeams: boolean;
  isTracking: boolean;
  isTruck: boolean;
  kind?: string;
  listSel?: string;
  listTab?: string;
  loadId?: string;
  modal?: string;
  modalStep?: string;
  nav: {
    label: string;
    items: {
      label: string;
      d: string;
      count: string;
      hot: string;
      locked: boolean;
      cls: string;
      cur?: "page";
      go: Fn;
      aria: string;
      tip: string;
    }[];
  }[];
  noFin: boolean;
  notifOn: string;
  openPalette: Fn;
  org: {
    name: string;
    sub: string;
    ini: string;
    c: string;
  };
  overlay?: string;
  ownerForm?: string;
  ownerFormPreset?: string;
  ownerId?: string;
  ownerRange?: string;
  ownerTab?: string;
  panel?: string;
  portalTab?: string;
  preselect?: boolean;
  preset?: string;
  report?: string;
  role?: string;
  sbCls: string;
  sbExp: "true" | "false";
  sbIcon: string;
  sbLabel: string;
  screen?: string;
  sidebar?: string;
  step?: string;
  stmtId?: string;
  team?: string;
  theme: string;
  toast: string;
  toggleAI: Fn;
  toggleAcct: Fn;
  toggleAll: Fn;
  toggleCreate: Fn;
  toggleNotif: Fn;
  toggleSb: Fn;
  truckId?: string;
  uid: string;
  user: {
    ini: string;
    name: string;
    role: string;
    email: string;
  };
}
