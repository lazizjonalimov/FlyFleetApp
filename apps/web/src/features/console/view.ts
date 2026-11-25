// The shapes the shared table and list screen draw: a cell, a row, and a list screen's whole view.

/** An event handler bound to a control. */
export type Fn = (event?: unknown) => void;

export type Cell = {
  isChk?: number;
  on?: string;
  go?: Fn;
  isTx?: number;
  /** A company's mark and name, in the Company column of a combined list. */
  isCo?: number;
  co?: { code: string; color: string; logo?: string | null };
  /** The company's short code shown before a number where companies mix. */
  pre?: string;
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
  /** The row's own actions, under "⋯". */
  menu?: { l: string; go: () => void; cls?: string }[];
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
  /** Filters in force, each with a way to remove it. */
  chips: { l: string; clear: Fn }[];
  /** Filters that can be added: a menu of the values the company's records hold. */
  adds: FilterMenu[];
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
  bulkActs?: { l: string; go: Fn }[];
  clearSel?: Fn;
  minw?: string;
  /** Show or hide columns; the choice is remembered on this device. */
  columns?: { l: string; on: boolean; locked: boolean; toggle: Fn }[];
  colsOpen?: boolean;
  toggleCols?: Fn;
  closeMenus?: Fn;
  /** Saves every matching row as a CSV file. */
  exportAll?: Fn;
  exporting?: boolean;
  /** Numbered pages, as far as the count allows; `gap` stands for the pages skipped between two. */
  pages?: { n: number; on: boolean; go: Fn; gap?: boolean }[];
  /** The rows shown, "1–25", and of how many, when the count is known. */
  range?: string;
  of?: string;
  /** How many rows a page holds, and the choices. */
  size?: number;
  sizes?: { n: number; on: boolean; go: Fn }[];
  sizeOpen?: boolean;
  toggleSize?: Fn;
};

export type FilterMenu = {
  l: string;
  open: boolean;
  toggle: Fn;
  q: string;
  setQ: Fn;
  search: boolean;
  head: string;
  opts: { l: string; n: string; go: Fn }[];
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

