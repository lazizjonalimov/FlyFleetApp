import type { Metadata } from "next";
import { apiFetch } from "@/lib/auth/server";
import type { Schema } from "@/lib/api/types";

export const metadata: Metadata = { title: "Shipment tracking", robots: { index: false, follow: false } };
type Tracking = Schema<"PublicTracking">;

const when = (iso: string | null | undefined, zone: string) =>
  iso ? new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso)) : "";
const KIND: Record<string, string> = { pickup: "Pickup", delivery: "Delivery", fuel_scale: "Stop" };

/**
 * The page a carrier's customer opens from a tracking link, without signing in. It shows only what the carrier
 * chose to share; a link that was turned off or has expired shows nothing about the load.
 */
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: Tracking | null = null;
  try {
    const response = await apiFetch(`/public/tracking/${encodeURIComponent(token)}`);
    data = response.ok ? ((await response.json()) as Tracking) : null;
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <main className="trk">
        <div className="card trk-card c g8" style={{ padding: "24px" }}>
          <h1 className="h2">This tracking link isn’t active</h1>
          <p className="fs13 mu">It may have been turned off, or the shipment was delivered more than a week ago. Ask the carrier for a new link.</p>
        </div>
      </main>
    );
  }
  const zone = data.timezone;
  const done = ["delivered", "pod_review", "completed"].includes(data.status);
  return (
    <main className="trk">
      <div className="card trk-card c g16" style={{ padding: "24px" }}>
        <div className="c g4">
          <span className="fs12 mu">{data.company}</span>
          <div className="r g8" style={{ flexWrap: "wrap" }}>
            <h1 className="h1" style={{ margin: 0 }}>{`Load ${data.load_number}`}</h1>
            <span className="badge" data-k={done ? "ok" : "info"}><i></i>{data.status_label}</span>
          </div>
          {data.reference ? <span className="fs13 t2">{`Your reference ${data.reference}`}</span> : null}
        </div>
        {data.eta ? (
          <div className="banner" data-k="info">
            <div className="f1"><div className="bt">{`Expected at the delivery ${when(data.eta, zone)}`}</div><div>Estimated from the truck’s latest position.</div></div>
          </div>
        ) : null}
        {data.position ? (
          <div className="fs13"><span className="w5">Last seen</span>{` near ${String(data.position.place ?? "")} · ${when(String(data.position.recorded_at), zone)}`}</div>
        ) : null}
        <ol className="c g12" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Stops">
          {data.stops.map((s, i) => (
            <li key={i} className="r g10" style={{ alignItems: "flex-start" }}>
              <span className="smk" data-k={s.departed_at ? "ok" : s.arrived_at ? "brand" : ""}>{i + 1}</span>
              <div className="c">
                <span className="over">{KIND[s.type] ?? "Stop"}</span>
                <span className="fs14 w5">{[s.city, s.state].filter(Boolean).join(", ")}</span>
                <span className="fs12 mu">
                  {s.departed_at ? `Left ${when(s.departed_at, zone)}` : s.arrived_at ? `Arrived ${when(s.arrived_at, zone)}` : s.appointment ? `Appointment ${when(s.appointment, zone)}` : "Not yet"}
                </span>
              </div>
            </li>
          ))}
        </ol>
        {data.driver_name ? <div className="fs13"><span className="w5">Driver</span>{` ${data.driver_name}${data.driver_phone ? ` · ${data.driver_phone}` : ""}`}</div> : null}
        {data.pod_available ? <a className="btn sm" href={`/track/${encodeURIComponent(token)}/pod`} target="_blank" rel="noopener">View proof of delivery</a> : null}
        <span className="fs12 mu">{`Updated ${when(data.updated_at, zone)} · times in the carrier’s time zone · reload the page for the latest`}</span>
      </div>
    </main>
  );
}
