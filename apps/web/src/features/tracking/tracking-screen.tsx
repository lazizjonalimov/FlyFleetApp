"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format/dates";
import { place, plural } from "@/lib/format/text";

const MAP = "M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13";

/**
 * Live fleet. Positions come from telematics, which isn't connected yet, so the map is empty; the loads on the
 * road are listed beside it with what is known about them.
 */
export function TrackingScreen() {
  const { me, set } = useConsole();
  const org = me.organization;
  const moving = useQuery({ queryKey: [org.id, "loads", "tracking"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { view: "active", sort: "delivery_at", limit: 50 } } })), refetchInterval: 60_000 });
  const onRoad = (moving.data?.items ?? []).filter((load) => ["dispatched", "at_pickup", "in_transit", "at_delivery"].includes(load.status));
  return (
    <div className="col">
      <div className="mtop">
        <div className="c">
          <div className="r g10">
            <h1 className="h1" style={{ fontSize: "18px", lineHeight: "24px" }}>Live fleet</h1>
            <span className="badge" data-k="mu">
              <i></i>
              No live positions
            </span>
          </div>
          <span className="fs12 mu"><span>{moving.data ? `${plural(onRoad.length, "load")} on the road` : ""}</span></span>
        </div>
        <span className="sp"></span>
        <button className="btn" onClick={() => set(goTo("settings"))}>
          <Icon className="s14" d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          Integrations
        </button>
      </div>
      <div className="mapw" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        <div style={{ display: "grid", placeItems: "center" }}>
          <EmptyState icon={MAP} title="Live positions need a telematics connection" text="Once trucks report their position, they show here with their trails and geofences. Until then, dispatchers log check calls on each load." />
        </div>
        <aside className="card oh c" style={{ margin: "16px", minHeight: "0" }}>
          <div className="ch">
            <h2 className="h2">On the road</h2>
            <span className="cnt" data-k="brand">{onRoad.length}</span>
          </div>
          <div style={{ overflow: "auto", minHeight: "0" }}>
            {moving.data && !onRoad.length ? <div className="cb fs13 mu">No loads are moving right now.</div> : null}
            {onRoad.map((load) => (
              <button key={load.id} className="wl wlb" onClick={() => set({ screen: "loads", drawer: load.id, overlay: "none", modal: "none" })}>
                <div className="f1 mw0">
                  <div className="r g6">
                    <span className="mono fs12 w5">{load.load_number}</span>
                    <span className="badge" data-k={loadTone(load.status)}>
                      <i></i>
                      {loadLabel(load.status)}
                    </span>
                  </div>
                  <div className="fs13 ell">{`${place(load.origin_city, load.origin_state)} → ${place(load.destination_city, load.destination_state)}`}</div>
                  <div className="fs12 mu ell">{[load.assignment ? `${load.assignment.driver.name} · ${load.assignment.vehicle.name}` : "", load.delivery_at ? `deliver ${formatDateTime(load.delivery_at, org.timezone)}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
