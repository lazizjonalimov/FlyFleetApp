"use client";

import { useQuery } from "@tanstack/react-query";
import { cell } from "@/components/data-table/cell";
import { EmptyState, ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { useAction } from "@/features/console/use-action";
import type { Cell } from "@/features/console/view";
import { api, unwrap } from "@/lib/api/client";
import { formatNumber, plural } from "@/lib/format/text";
import { quarterLabel, short, Table, type TRow, whole } from "./shared";

const SHOWN = 5;

/** Miles by truck and state for the quarter, each truck's MPG and where its miles came from, the gaps to look at,
 * and the imports and hand-entered trips behind them. */
export function MileageTab({ quarter, today, onImport, onAddTrip, onConnect }: { quarter: string; today: string; onImport: (() => void) | null; onAddTrip: (() => void) | null; onConnect: () => void }) {
  const { me, set } = useConsole();
  const act = useAction();
  const org = me.organization;
  const mileage = useQuery({ queryKey: [org.id, "ifta", "mileage", quarter], queryFn: () => unwrap(api.GET("/api/v1/ifta/mileage", { params: { query: { quarter } } })) });
  const sources = useQuery({ queryKey: [org.id, "ifta", "sources", quarter], queryFn: () => unwrap(api.GET("/api/v1/ifta/sources", { params: { query: { quarter } } })) });
  const m = mileage.data;
  const states = (m?.states ?? []).slice(0, SHOWN);
  const others = (m?.states ?? []).slice(SHOWN);
  const cols = `minmax(0,1.1fr) ${[...states, ...(others.length ? ["+"] : [])].map(() => "52px").join(" ")} 60px 40px minmax(0,1.05fr)`;
  const head = [{ l: "Truck", al: "" }, ...states.map((s) => ({ l: s, al: "rt" })), ...(others.length ? [{ l: "Other", al: "rt" }] : []), { l: "Total", al: "rt" }, { l: "MPG", al: "rt" }, { l: "Source", al: "" }];
  const n = (v: string | number | undefined): Cell => (v && Number(v) ? cell.num(whole(v)) : { ...cell.text("—", "", "mu"), al: "rt" });
  const start = `${quarter.slice(0, 4)}-${String((Number(quarter.slice(5)) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const rows: TRow[] = (m?.rows ?? []).map((r) => {
    const source: Cell = r.held
      ? cell.risk(`${plural(r.held, "trip")} held`, "info", I.sheet)
      : !Number(r.total) && Number(r.gallons)
        ? cell.risk("No miles", "warn", I.alert)
        : r.sources.includes("gps")
          ? cell.risk("GPS", "ok", I.pin)
          : r.sources.includes("import")
            ? cell.risk("CSV", "info", I.sheet)
            : cell.risk("Manual", "info", I.pencil);
    return {
      key: r.vehicle_id,
      open: () => set({ screen: "truck", unitId: r.vehicle_id, unitKind: "truck", overlay: "none", modal: "none" }),
      cells: [
        cell.text(r.unit_number, r.driver ?? "No driver", "mono fs12 w5", r.driver ? "" : "mu"),
        ...states.map((s) => n(r.miles[s])),
        ...(others.length ? [n(others.reduce((sum, s) => sum + Number(r.miles[s] ?? 0), 0))] : []),
        n(r.total),
        r.mpg ? cell.num(r.mpg) : { ...cell.text("—", "", "mu"), al: "rt" },
        source,
      ],
    };
  });
  if (m && rows.length) {
    const gallons = m.rows.reduce((sum, r) => sum + Number(r.gallons), 0);
    rows.push({
      key: "total",
      cls: "tot",
      cells: [
        cell.text(`Fleet · ${plural(m.rows.length, "truck")}`, `${quarter.slice(4)} so far`, "w6"),
        ...states.map((s) => n(m.totals[s])),
        ...(others.length ? [n(others.reduce((sum, s) => sum + Number(m.totals[s] ?? 0), 0))] : []),
        n(m.total),
        gallons && Number(m.total) ? cell.num((Number(m.total) / gallons).toFixed(2)) : { ...cell.text("—", "", "mu"), al: "rt" },
        cell.text(`${formatNumber(Math.round(gallons))} gal`, "bought", "t3"),
      ],
    });
  }
  const release = (trip: string) => act(() => unwrap(api.POST("/api/v1/ifta/trips/{trip_id}/release", { params: { path: { trip_id: trip } } })), "Miles counted on the return");
  const remove = (trip: string) => act(() => unwrap(api.DELETE("/api/v1/ifta/trips/{trip_id}", { params: { path: { trip_id: trip } } })), "Trip removed");
  const gaps = m?.gaps ?? [];
  return (
    <div className="fugrid r3 vz">
      <section className="card oh c">
        <div className="ch">
          <div className="f1 c">
            <h2 className="h2">Miles by truck and state</h2>
            <span className="fs12 mu">{`${quarter.slice(4)} so far · ${short(start)} – ${short(today)} · MPG = miles ÷ gallons bought`}</span>
          </div>
          {onImport ? (
            <button className="btn sm" onClick={onImport}>
              <Icon className="s14" d={I.sheet} />
              Import CSV
            </button>
          ) : null}
          {onAddTrip ? (
            <button className="btn sm" onClick={onAddTrip}>
              <Icon className="s14 b" d="M12 5v14M5 12h14" />
              Add a trip
            </button>
          ) : null}
        </div>
        {mileage.isPending ? <Skeleton /> : null}
        {mileage.isError ? <ErrorState error={mileage.error} retry={() => void mileage.refetch()} /> : null}
        {m && !m.rows.length ? (
          <EmptyState icon={I.map} title={`No miles for ${quarterLabel(quarter)} yet`} text="Miles come from GPS once a telematics provider is connected. Until then, import them from a spreadsheet or add each trip by hand." />
        ) : null}
        {rows.length ? <Table label="Miles by truck and state" cols={cols} head={head} rows={rows} /> : null}
        {m && m.rows.length ? (
          <div className="tfoot">
            <span className="num">{`Showing ${plural(m.rows.length, "truck")} · the total row is the whole fleet`}</span>
            <span className="sp"></span>
            <button className="lnk" onClick={() => window.open(`/api/v1/ifta/returns/${quarter}/export`, "_blank", "noopener")}>Export CSV</button>
          </div>
        ) : null}
      </section>
      <div className="c g16">
        <section className="card oh">
          <div className="ch" style={{ minHeight: "58px" }}>
            <div className="f1 c">
              <h2 className="h2">GPS state-line allocation</h2>
              <span className="fs12 mu">Each mile goes to the state it was driven in</span>
            </div>
          </div>
          <EmptyState icon={I.map} title="No GPS connected" text="With a telematics provider connected, each load’s miles are split where the truck crosses a state line. Until then, miles come from imports and trips added by hand.">
            <button className="btn sm" onClick={onConnect}>Connect GPS</button>
          </EmptyState>
        </section>
        <section className="card oh">
          <div className="ch">
            <h2 className="h2">Gaps to review</h2>
            {gaps.length ? <span className="tag" data-k="warn">{`${gaps.length} open`}</span> : null}
          </div>
          {m && !gaps.length ? <div className="cb fs13 mu">Nothing to review. Every truck that bought fuel has miles, and no imported miles are held.</div> : null}
          {gaps.map((g) => (
            <div key={`${g.kind}-${g.trip_id ?? g.vehicle_id}`} className="cb c g8" style={{ borderTop: "1px solid var(--bd2)" }}>
              <div className="r g8 ast">
                <span className="plogo" data-k={g.kind === "held" ? "info" : "warn"}><Icon className="s14" d={g.kind === "held" ? I.sheet : I.alert} /></span>
                <div className="f1">
                  <div className="fs13 w5"><span>{g.title}</span></div>
                  <div className="fs12 mu"><span>{g.detail}</span></div>
                </div>
              </div>
              {g.kind === "held" && g.trip_id && onImport ? (
                <div className="r g8" style={{ paddingLeft: "38px" }}>
                  <button className="btn sm pri" onClick={() => void release(g.trip_id!)}>Count these miles</button>
                  <button className="btn sm" onClick={() => void remove(g.trip_id!)}>Remove</button>
                </div>
              ) : g.kind === "no_miles" && (onImport || onAddTrip) ? (
                <div className="r g8" style={{ paddingLeft: "38px" }}>
                  {onImport ? <button className="btn sm pri" onClick={onImport}>Import miles</button> : null}
                  {onAddTrip ? <button className="btn sm" onClick={onAddTrip}>Add a trip</button> : null}
                </div>
              ) : null}
            </div>
          ))}
        </section>
        <section className="card oh">
          <div className="ch"><h2 className="h2">{"Imports & manual trips"}</h2></div>
          {sources.data && !sources.data.length ? <div className="cb fs13 mu">No mileage imported or entered by hand this quarter.</div> : null}
          {(sources.data ?? []).map((x) => (
            <div key={`${x.kind}-${x.import_id ?? x.vehicle_id}`} className="wl">
              <span className="xls" style={{ width: "30px", height: "34px" }}><span>{x.ext}</span></span>
              <div className="f1 mw0">
                <div className="fs13 w5 ell"><span>{x.title}</span></div>
                <div className="fs12 mu ell"><span>{x.detail}</span></div>
              </div>
              <span className="badge" data-k={x.tone}>
                <i></i>
                <span>{x.status}</span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
