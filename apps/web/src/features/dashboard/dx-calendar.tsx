"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { addDays, byDay, dayChips, longDay, monday, monthCells, monthFirst, monthTitle, shiftMonth, shortDay, useCalendar, useToday, type CalEvent } from "./dx-data";
import type { DrawerSpec } from "./dx-ui";

export const CAT_K: Record<string, string> = { pickup: "brand", delivery: "teal", maintenance: "warn", expiration: "bad", billing: "violet" };
const ORDER = ["pickup", "delivery", "maintenance", "expiration", "billing"];
const LEFT = "M15 6l-6 6 6 6";
const RIGHT = "M9 6l6 6-6 6";

/** The drawer for one event: when, what, who, where, its reference, and the page it belongs to. */
export function eventDrawer(e: CalEvent, close: () => void, go: (e: CalEvent) => void): DrawerSpec {
  const page = e.target.screen === "load" ? "Open load" : e.target.screen === "maintenance" ? "Open maintenance" : e.target.screen === "safety" ? "Open compliance" : e.target.screen === "invoices" ? "Open invoices" : e.target.screen === "stmt" ? "Open statement" : "Open";
  return {
    tag: { label: e.type, k: CAT_K[e.category] ?? "mu" },
    title: e.title,
    sub: e.past ? "Past" : undefined,
    stats: [
      { label: "Date", value: longDay(e.date) },
      { label: "Time", value: e.time ?? "All day" },
      { label: e.category === "pickup" || e.category === "delivery" ? "Driver" : "Who", value: e.who ?? "—" },
      { label: "Reference", value: e.reference ?? "—" },
    ],
    rowsTitle: e.lane ? "Lane" : undefined,
    rows: e.lane ? [{ label: e.lane, value: "" }] : [],
    actions: [{ label: page, primary: true, go: () => { close(); go(e); } }, { label: "Close", go: close }],
  };
}

type Mode = "month" | "week" | "agenda";

/** Month, week or the next seven days; one list of events, from one place, filtered by category. */
export function CalendarTab({ openEvent }: { openEvent: (e: CalEvent) => void }) {
  const today = useToday();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(monthFirst(today));
  const [weekStart, setWeekStart] = useState(monday(today));
  const [picked, setPicked] = useState<string>(today);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const cells = monthCells(month);
  const range = mode === "month" ? [cells[0]!, cells[cells.length - 1]!] : mode === "week" ? [weekStart, addDays(weekStart, 6)] : [today, addDays(today, 6)];
  const cal = useCalendar(range[0]!, range[1]!);
  const cats = ORDER.filter((c) => cal.data?.categories?.[c]);
  const shown = new Set(cats.filter((c) => !hidden.has(c)));
  const events = cal.data?.events ?? [];
  const days = byDay(events, shown);
  const minMonth = shiftMonth(monthFirst(today), -1);
  const maxMonth = shiftMonth(monthFirst(today), 2);
  const toggle = (c: string) => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const eventButton = (e: CalEvent, compact = false) => (
    <button key={e.id} type="button" className={clsx("dx-ev", e.past && "past")} data-k={CAT_K[e.category]} onClick={() => openEvent(e)} aria-label={`${e.title}, ${longDay(e.date)}${e.time ? ` at ${e.time}` : ""}${e.past ? ", past" : ""}`}>
      {!compact && e.time ? <span className="num">{e.time}</span> : null}<span className="ell">{e.title}</span>
    </button>
  );

  return (
    <div className="c g12" style={{ padding: "16px 24px 24px" }}>
      <div className="r g8 wrap">
        <div className="seg" role="group" aria-label="Calendar view">
          {(["month", "week", "agenda"] as Mode[]).map((m) => <button key={m} type="button" className={clsx(mode === m && "on")} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "month" ? "Month" : m === "week" ? "Week" : "Agenda"}</button>)}
        </div>
        <div className="r g6 wrap" role="group" aria-label="Show categories">
          {cats.map((c) => <button key={c} type="button" className="btn xs" aria-pressed={shown.has(c)} onClick={() => toggle(c)}><span className="dot" data-k={CAT_K[c]}></span>{`${cal.data!.categories[c]} ${events.filter((e) => e.category === c).length}`}</button>)}
        </div>
        <span className="sp"></span>
        {mode === "month" ? (
          <div className="r g4">
            <button type="button" className="btn sm icon" aria-label="Previous month" disabled={month <= minMonth} onClick={() => setMonth(shiftMonth(month, -1))}><Icon className="s14" d={LEFT} /></button>
            <span className="fs13 w6 tx" style={{ minWidth: "130px", textAlign: "center" }} aria-live="polite">{monthTitle(month)}</span>
            <button type="button" className="btn sm icon" aria-label="Next month" disabled={month >= maxMonth} onClick={() => setMonth(shiftMonth(month, 1))}><Icon className="s14" d={RIGHT} /></button>
            <button type="button" className="btn sm" onClick={() => { setMonth(monthFirst(today)); setPicked(today); }}>Today</button>
          </div>
        ) : mode === "week" ? (
          <div className="r g4">
            <button type="button" className="btn sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icon className="s14" d={LEFT} />Previous</button>
            <span className="fs13 w6 tx" aria-live="polite">{`${shortDay(weekStart)} – ${shortDay(addDays(weekStart, 6))}`}</span>
            <button type="button" className="btn sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next<Icon className="s14" d={RIGHT} /></button>
          </div>
        ) : null}
      </div>
      {cal.isError ? <div className="banner" data-k="bad" role="alert"><div className="f1">The calendar couldn’t be loaded.</div></div> : null}

      {mode === "month" ? (
        <div className="dx-2col">
          <section className="card oh" aria-label={monthTitle(month)}>
            <div className="dx-month">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => <span key={h} className="dx-mh" aria-hidden="true">{h}</span>)}
              {cells.map((d) => {
                const list = days.get(d) ?? [];
                const { chips, more } = dayChips(list);
                const out = d.slice(0, 7) !== month.slice(0, 7);
                return (
                  <button key={d} type="button" className={clsx("dx-day", out && "out", d === today && "today", d === picked && "on")} aria-pressed={d === picked} onClick={() => setPicked(d)}
                    aria-label={`${longDay(d)}${d === today ? ", today" : ""}: ${list.length} ${list.length === 1 ? "event" : "events"}`}>
                    <span className="dx-dn" aria-hidden="true">{Number(d.slice(8))}</span>
                    {chips.map((c) => <span key={c.key} className="dx-chip ell" data-k={CAT_K[c.category]} aria-hidden="true">{c.label}</span>)}
                    {more ? <span className="fs11 mu" aria-hidden="true">{`+${more} more`}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="card" aria-label={`Events on ${longDay(picked)}`}>
            <div className="ch"><h2 className="h2">{longDay(picked)}</h2><span className="sp"></span><span className="fs12 mu">{`${(days.get(picked) ?? []).length} events`}</span></div>
            <div className="cb c g6">{(days.get(picked) ?? []).length ? (days.get(picked) ?? []).map((e) => eventButton(e)) : <p className="fs13 mu">Nothing on this day.</p>}</div>
          </section>
        </div>
      ) : null}

      {mode === "week" ? (
        <div className="dx-week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
            const list = days.get(d) ?? [];
            return (
              <section key={d} className={clsx("kcol", d === today && "tktoday")} aria-label={`${longDay(d)}${d === today ? ", today" : ""}`}>
                <div className="kch r g6"><h2 className="fs12 w6 tx">{longDay(d)}</h2><span className="fs12 mu">{list.length}</span></div>
                <div className="c g4" style={{ padding: "0 6px 8px" }}>
                  {list.slice(0, 7).map((e) => eventButton(e, true))}
                  {list.length > 7 ? <button type="button" className="lnk fs12" onClick={() => { setMode("month"); setMonth(monthFirst(d)); setPicked(d); }}>{`+${list.length - 7} more`}</button> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {mode === "agenda" ? (
        <section className="card oh" aria-label="Next 7 days">
          {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
            const list = days.get(d) ?? [];
            return (
              <div key={d} className="dx-agenda">
                <h2 className="fs12 w6 tx">{`${longDay(d)}${d === today ? " · Today" : ""}`}</h2>
                <div className="c g4">{list.length ? list.map((e) => eventButton(e)) : <span className="fs12 mu">Nothing scheduled</span>}</div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
