"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format/dates";

const LOOK: Record<string, [icon: string, tone: string]> = {
  telematics: [I.truck, "brand"], driver_app: [I.mobile, "brand"], assistant: [I.spark, "violet"], maps: [I.map, "teal"],
  telegram: [I.send, "info"], email: [I.mail, "mu"], fuel_cards: [I.fuel, "warn"], accounting: [I.dollar, "mu"],
};
const STATE: Record<string, string> = { connected: "ok", receiving: "ok", enabled: "ok", built_in: "info", off: "off", not_connected: "off" };

/** Integrations: every outside service, whether it is connected and what it did, and what came in. */
export function IntegrationsPage() {
  const { me, set, can } = useConsole();
  const org = me.organization;
  const data = useQuery({ queryKey: [org.id, "integrations"], queryFn: () => unwrap(api.GET("/api/v1/integrations")), refetchInterval: 60_000 });
  if (data.isError) return <ErrorState error={data.error} retry={() => void data.refetch()} />;
  if (!data.data) return <Skeleton rows={8} />;
  const actions = (key: string): [string, () => void, string][] => {
    if (key === "telematics" || key === "driver_app") return [["Live fleet", () => set(goTo("tracking")), ""]];
    if (key === "assistant") return [];
    if (key === "maps") return [["Live fleet", () => set(goTo("tracking")), ""]];
    if (key === "accounting" && can("reports.read")) return [["Reports", () => set(goTo("reports")), ""]];
    if (key === "fuel_cards" && can("expenses.read")) return [["Fuel & IFTA", () => set(goTo("fuel")), ""]];
    return [];
  };
  const cols = "minmax(0,1.3fr) 120px 150px 120px 190px";
  return (
    <div className="c g16">
      <div className="igrid">
        {data.data.integrations.map((it) => {
          const [icon, tone] = LOOK[it.key] ?? [I.link, "mu"];
          return (
            <section key={it.key} className="card icard">
              <div className="r g10">
                <span className="ilogo" data-k={tone}><Icon className="s18" d={icon} /></span>
                <div className="f1" style={{ minWidth: "0" }}>
                  <div className="r g6"><span className="fs14 w6">{it.name}</span>{it.tag ? <span className="tag ell" data-k="mu">{it.tag}</span> : null}</div>
                  <div className="fs12 mu">{it.category}</div>
                </div>
                <span className="badge" data-k={STATE[it.state] ?? "off"}><i></i>{it.state_label}</span>
              </div>
              <dl className="kv" style={{ fontSize: "12px", lineHeight: "17px" }}>
                {it.facts.map((f) => [<dt key={`${f.label}-k`}>{f.label}</dt>, <dd key={`${f.label}-v`}>{f.value}</dd>])}
              </dl>
              <div className="r g6" style={{ marginTop: "auto" }}>
                {actions(it.key).map(([label, go, cls]) => <button key={label} className={`btn sm ${cls}`} onClick={go}>{label}</button>)}
                {it.state === "not_connected" && it.key !== "telematics" ? <span className="fs12 mu">Connecting it isn’t available yet</span> : null}
              </div>
            </section>
          );
        })}
      </div>
      <section className="card oh">
        <div className="ch"><h2 className="h2">Inbound events</h2><span className="fs12 mu" style={{ marginLeft: "auto" }}>Positions are de-duplicated as they arrive; a sample sent twice is kept once</span></div>
        <div className="thead" style={{ gridTemplateColumns: cols }}>
          {["Event", "Provider", "Received", "Key", "Result"].map((h) => <span key={h}>{h}</span>)}
        </div>
        {data.data.events.map((e, i) => (
          <div key={`${e.key}-${i}`} className="trow" style={{ gridTemplateColumns: cols }}>
            <div className="td"><div className="ell mono fs12 w5">{e.event}</div></div>
            <div className="td"><div className="ell t2">{e.provider}</div></div>
            <div className="td"><div className="ell mono fs12 t3">{formatDateTime(e.received_at, org.timezone)}</div></div>
            <div className="td"><div className="ell mono fs12 mu">{e.key}</div></div>
            <div className="td"><span className="badge" data-k="ok"><i></i>{e.result}</span></div>
          </div>
        ))}
        {!data.data.events.length ? <div className="cb fs12 mu">Nothing has come in yet. Positions from a telematics integration or the driver app, and messages from drivers, show here as they arrive.</div> : null}
      </section>
      <p className="note"><Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />Each provider sits behind an adapter, so it can be swapped. Credentials are kept by the server and never shown in the app.</p>
    </div>
  );
}
