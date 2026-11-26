"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { I } from "@/features/console/icons";
import { CompanyMark } from "@/features/shell/company-mark";
import {
  addDays, BOARD, clockOf, dayLabel, dayOf, dueForSection, dueLabel, dueTone, monthGrid, monthName, PRIORITY, REPEAT, SECTIONS,
  sectionOf, shiftDay, shortDate, slaOf, SOURCE, stepsDone, weekdayOf, type SectionKey, type Task,
} from "./model";

const CHECK = "M5 12l5 5 9-10";
const LEFT = "M15 6l-6 6 6 6";
const RIGHT = "M9 6l6 6-6 6";

export type RowHandlers = {
  now: number;
  zone: string;
  open: (t: Task) => void;
  tick: (t: Task) => void;
  go: (t: Task) => void;
  snooze: (t: Task) => void;
  moveDue: (t: Task, due: number, where: string) => void;
};

/** The small tags under a title: where it came from, repeats, steps, snoozed, the promise's clock, what it waits on. */
export function TaskTags({ t, now, zone }: { t: Task; now: number; zone: string }) {
  const sla = slaOf(t, now);
  const today = dayOf(now, zone);
  return (
    <span className="r g4 wrap" style={{ marginTop: "2px" }}>
      <span className="tag" data-k={SOURCE[t.source].k}>{SOURCE[t.source].label}</span>
      {t.recurrence !== "none" ? <span className="tag" data-k="brand">{REPEAT[t.recurrence]}</span> : null}
      {t.subtasks.length ? <span className="tag" data-k="mu">{`${stepsDone(t)} of ${t.subtasks.length}`}</span> : null}
      {t.status === "snoozed" && t.snoozed_until ? <span className="tag" data-k="warn">{`Snoozed · ${dayLabel(dayOf(t.snoozed_until, zone), today)} ${clockOf(t.snoozed_until, zone)}`}</span> : null}
      {sla ? <span className="tag" data-k={sla.k}>{sla.text}</span> : null}
      {t.blocker ? <span className="tag" data-k="warn">{`Blocked by ${t.blocker.title}`}</span> : null}
      {t.escalated && t.status !== "done" ? <span className="tag" data-k="bad">Escalated</span> : null}
    </span>
  );
}

const closed = (t: Task) => t.status === "done" || t.status === "cancelled";

type ListProps = RowHandlers & {
  tasks: Task[];
  sections: boolean;
  extra: "assignee" | "company" | null;
  selecting: boolean;
  selected: Set<string>;
  toggle: (t: Task) => void;
  toggleAll: () => void;
  focus: string | null;
};

/** The list: in sections by when things are due (or flat, for Snoozed, Assigned by me and Done). */
export function TaskList(props: ListProps) {
  const { tasks, sections, extra, selecting, selected, now, zone } = props;
  const cols = `36px minmax(0,1fr) 110px 84px 110px${extra ? " 150px" : ""} 150px`;
  const groups = sections
    ? SECTIONS.map((s) => ({ ...s, rows: tasks.filter((t) => sectionOf(t, now, zone) === s.key) })).filter((g) => g.rows.length)
    : [{ key: "all", label: "", k: "mu", rows: tasks }];
  const all = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  return (
    <>
      <div className="thead" style={{ gridTemplateColumns: cols }} role="presentation">
        <span>{selecting ? <button type="button" className={clsx("chk", all && "on")} aria-pressed={all} aria-label="Select all" onClick={props.toggleAll}><Icon className="s12 b" d={CHECK} /></button> : null}</span>
        <span>Task</span><span>{tasks.some(closed) && !sections ? "Done" : "Due"}</span><span>Priority</span><span>Linked</span>
        {extra ? <span>{extra === "assignee" ? "Assignee" : "Company"}</span> : null}
        <span></span>
      </div>
      {groups.map((g) => (
        <section key={g.key} aria-label={sections ? g.label : "Tasks"}>
          {sections ? (
            <div className="r g8" style={{ padding: "8px 16px", background: "var(--sf2)", borderBottom: "1px solid var(--bd2)" }}>
              <span className="dot" data-k={g.k}></span><h2 className="fs12 w6 tx">{g.label}</h2><span className="fs12 mu">{g.rows.length}</span>
            </div>
          ) : null}
          <ul className="c" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {g.rows.map((t) => <Row key={t.id} t={t} cols={cols} {...props} />)}
          </ul>
        </section>
      ))}
    </>
  );
}

function Row({ t, cols, extra, selecting, selected, toggle, focus, now, zone, open, tick, go, snooze }: ListProps & { t: Task; cols: string }) {
  const done = closed(t);
  const on = selecting ? selected.has(t.id) : done;
  const tone = dueTone(t, now);
  return (
    <li className={clsx("trow tkrow", focus === t.id && "foc", selecting && selected.has(t.id) && "sel")} data-task={t.id} aria-current={focus === t.id ? "true" : undefined}
      style={{ gridTemplateColumns: cols, cursor: "default", alignItems: "start", paddingTop: "10px", paddingBottom: "10px" }}>
      <span>
        <button type="button" className={clsx("chk", on && "on")} aria-pressed={on} onClick={() => (selecting ? toggle(t) : tick(t))}
          aria-label={selecting ? `Select ${t.title}` : done ? `Reopen ${t.title}` : `Complete ${t.title}`}>
          <Icon className="s12 b" d={CHECK} />
        </button>
      </span>
      <div className="c g2 mw0">
        <button type="button" className={clsx("tkt", done && "dim")} onClick={() => open(t)}>{t.title}</button>
        {t.detail || (done && t.outcome) ? <span className="fs12 mu ell">{done ? t.outcome : t.detail}</span> : null}
        <TaskTags t={t} now={now} zone={zone} />
      </div>
      <span className={clsx("num w5", tone && "tc")} data-k={tone ?? undefined}>{dueLabel(t, now, zone)}</span>
      <span><span className="tag" data-k={PRIORITY[t.priority].k}>{PRIORITY[t.priority].label}</span></span>
      <span className="mono fs12 t2 ell">{t.entity_label ?? ""}</span>
      {extra === "assignee" ? <span className="fs12 t2 ell">{t.assignee?.name ?? "—"}</span> : null}
      {extra === "company" && t.organization ? (
        <span className="r g6 mw0"><CompanyMark code={t.organization.code} color={t.organization.color} logo={t.organization.logo_url} size={18} /><span className="fs12 t2 ell">{t.organization.name}</span></span>
      ) : extra === "company" ? <span></span> : null}
      <span className="r g4" style={{ justifyContent: "flex-end" }}>
        {!done && t.status !== "snoozed" && (t.action || t.entity_id) ? <button type="button" className="btn sm" onClick={() => go(t)} aria-label={`${t.action ?? "Open"}: ${t.title}`}>{t.action ?? "Open"}</button> : null}
        {t.status === "open" ? (
          <button type="button" className="btn ghost icon sm" aria-label={`Snooze ${t.title}`} title="Snooze" onClick={() => snooze(t)}><Icon className="s14" d={I.clock} /></button>
        ) : null}
      </span>
    </li>
  );
}

/** The board: Overdue, Now, Today and Later, with ‹ › to move a card by changing when it's due. */
export function TaskBoard({ tasks, now, zone, open, moveDue }: RowHandlers & { tasks: Task[] }) {
  const index = (k: SectionKey) => BOARD.findIndex((b) => b.key === k);
  return (
    <div className="tkgrid" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
      {BOARD.map((col, i) => {
        const cards = tasks.filter((t) => sectionOf(t, now, zone) === col.key);
        return (
          <section key={col.key} className="kcol" aria-label={col.label}>
            <div className="kch r g8"><span className="dot" data-k={col.k}></span><h2 className="fs12 w6 tx">{col.label}</h2><span className="fs12 mu">{cards.length}</span></div>
            <ul className="c g8" style={{ padding: "0 8px 10px", listStyle: "none", margin: 0 }}>
              {cards.map((t) => {
                const from = index(sectionOf(t, now, zone));
                const sla = slaOf(t, now);
                const move = (to: number) => moveDue(t, dueForSection(BOARD[to]!.key, now, zone), BOARD[to]!.label);
                return (
                  <li key={t.id} className="wo">
                    <button type="button" className="tkt" onClick={() => open(t)}>{t.title}</button>
                    {t.detail ? <span className="fs12 mu ell">{t.detail}</span> : null}
                    <span className="r g4 wrap">
                      <span className="tag" data-k={PRIORITY[t.priority].k}>{PRIORITY[t.priority].label}</span>
                      <span className="fs12 num t2">{dueLabel(t, now, zone)}</span>
                      {sla ? <span className="tag" data-k={sla.k}>{sla.text}</span> : null}
                      {t.blocker ? <span className="tag" data-k="warn">{`Blocked by ${t.blocker.title}`}</span> : null}
                    </span>
                    <span className="r g2" style={{ justifyContent: "flex-end" }}>
                      {i > 0 ? <button type="button" className="btn ghost icon sm" aria-label={`Move ${t.title} to ${BOARD[from - 1]?.label ?? BOARD[0]!.label}`} onClick={() => move(Math.max(from - 1, 0))}><Icon className="s12" d={LEFT} /></button> : null}
                      {i < BOARD.length - 1 ? <button type="button" className="btn ghost icon sm" aria-label={`Move ${t.title} to ${BOARD[from + 1]?.label ?? BOARD[3]!.label}`} onClick={() => move(Math.min(from + 1, 3))}><Icon className="s12" d={RIGHT} /></button> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

type CalendarProps = RowHandlers & { tasks: Task[]; range: "today" | "week" | "month"; undated: number };

/** Today in time order, the next seven days, or the month. */
export function TaskCalendar(props: CalendarProps) {
  const { tasks, range, now, zone, open, moveDue } = props;
  const today = dayOf(now, zone);
  const shift = (t: Task, by: number) => {
    const due = shiftDay(t, by, now, zone);
    moveDue(t, due, dayLabel(dayOf(due, zone), today));
  };
  const arrows = (t: Task, left: boolean, right: boolean, target: (by: number) => string) => (
    <span className="r g2">
      {left ? <button type="button" className="btn ghost icon sm" aria-label={`Move ${t.title} to ${target(-1)}`} onClick={() => shift(t, -1)}><Icon className="s12" d={LEFT} /></button> : null}
      {right ? <button type="button" className="btn ghost icon sm" aria-label={`Move ${t.title} to ${target(1)}`} onClick={() => shift(t, 1)}><Icon className="s12" d={RIGHT} /></button> : null}
    </span>
  );
  const nameOf = (t: Task, by: number) => (t.due_at ? dayLabel(addDays(dayOf(t.due_at, zone), by), today) : "Today");

  if (range === "today") {
    const items = tasks.filter((t) => t.due_at && dayOf(t.due_at, zone) === today).sort((a, b) => a.due_at!.localeCompare(b.due_at!));
    return (
      <section className="card oh" aria-labelledby="tk-today">
        <div className="ch"><h2 className="h2" id="tk-today">Today</h2><span className="sp"></span><span className="fs12 mu">{`${weekdayOf(today)} ${shortDate(today)} · ${items.length} scheduled`}</span></div>
        {items.length ? (
          <ul className="c" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((t) => {
              const sla = slaOf(t, now);
              return (
                <li key={t.id} className="r g12" style={{ padding: "10px 16px", borderTop: "1px solid var(--bd2)" }}>
                  <span className="num w5 t2" style={{ width: "52px" }}>{t.all_day ? "All day" : clockOf(t.due_at!, zone)}</span>
                  <div className="c g2 f1 mw0"><button type="button" className="tkt" onClick={() => open(t)}>{t.title}</button>{t.detail ? <span className="fs12 mu ell">{t.detail}</span> : null}</div>
                  <span className="tag" data-k={PRIORITY[t.priority].k}>{PRIORITY[t.priority].label}</span>
                  {sla ? <span className="tag" data-k={sla.k}>{sla.text}</span> : null}
                  {arrows(t, true, true, (by) => nameOf(t, by))}
                </li>
              );
            })}
          </ul>
        ) : <div className="fs13 mu" style={{ padding: "24px 16px", textAlign: "center" }}>Nothing scheduled for today.</div>}
      </section>
    );
  }

  if (range === "week") {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const cols = [...days.map((d) => ({ key: d, label: dayLabel(d, today) === "Today" ? `Today ${shortDate(d)}` : `${weekdayOf(d)} ${shortDate(d)}`, items: tasks.filter((t) => t.due_at && dayOf(t.due_at, zone) === d) })),
      { key: "none", label: "No date", items: tasks.filter((t) => !t.due_at) }];
    return (
      <div className="tkgrid" style={{ gridTemplateColumns: "repeat(8,minmax(0,1fr))" }}>
        {cols.map((col, ci) => (
          <section key={col.key} className={clsx("kcol", ci === 0 && "tktoday")} aria-label={col.label}>
            <div className="kch r g6"><h2 className="fs12 w6 tx">{col.label}</h2><span className="fs12 mu">{col.items.length}</span></div>
            <ul className="c g6" style={{ padding: "0 6px 8px", listStyle: "none", margin: 0 }}>
              {col.items.sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "")).map((t) => (
                <li key={t.id} className="wo" style={{ padding: "8px" }}>
                  <button type="button" className="tkt" onClick={() => open(t)}>{t.title}</button>
                  <span className="r g4 wrap"><span className="fs12 num t2">{t.due_at ? (t.all_day ? "All day" : clockOf(t.due_at, zone)) : "No date"}</span><span className="tag" data-k={PRIORITY[t.priority].k}>{PRIORITY[t.priority].label}</span></span>
                  {col.key === "none"
                    ? <span className="r" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost icon sm" aria-label={`Move ${t.title} to Today`} onClick={() => moveDue(t, shiftDay(t, 0, now, zone), "Today")}><Icon className="s12" d={RIGHT} /></button></span>
                    : <span className="r" style={{ justifyContent: "flex-end" }}>{arrows(t, ci > 0, ci < 6, (by) => nameOf(t, by))}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const cells = monthGrid(today);
  return (
    <section className="card oh" aria-labelledby="tk-month">
      <div className="ch"><h2 className="h2" id="tk-month">{monthName(today)}</h2><span className="sp"></span><span className="fs12 mu">{props.undated ? `${props.undated} ${props.undated === 1 ? "task has" : "tasks have"} no date and aren’t shown` : ""}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => <span key={h} className="fs12 w6 t2" aria-hidden="true" style={{ padding: "6px 8px", background: "var(--sf2)", borderBottom: "1px solid var(--bd2)" }}>{h}</span>)}
        {cells.map((d) => {
          const items = tasks.filter((t) => t.due_at && dayOf(t.due_at, zone) === d);
          const inMonth = d.slice(0, 7) === today.slice(0, 7);
          return (
            <div key={d} role="group" className="c g2" aria-label={`${weekdayOf(d)} ${shortDate(d)}${d === today ? ", today" : ""}: ${items.length} ${items.length === 1 ? "task" : "tasks"}`}
              style={{ background: d === today ? "var(--prit)" : inMonth ? "var(--sf)" : "var(--sf2)", minHeight: "92px", padding: "6px 8px", borderRight: "1px solid var(--bd2)", borderBottom: "1px solid var(--bd2)" }}>
              <span className={clsx("fs12 w6", inMonth ? "tx" : "mu")} aria-hidden="true">{Number(d.slice(8))}</span>
              {items.slice(0, 3).map((t) => <button key={t.id} type="button" className="tkt fs12 ell" style={{ maxWidth: "100%" }} onClick={() => open(t)}>{t.title}</button>)}
              {items.length > 3 ? <span className="fs12 mu">{`+${items.length - 3} more`}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
