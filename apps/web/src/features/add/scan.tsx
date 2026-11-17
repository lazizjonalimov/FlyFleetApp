"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Problem } from "@/components/feedback/dialog";
import { combo } from "@/components/forms/combo";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";
import { goTo } from "@/features/console/shell";
import { useAction } from "@/features/console/use-action";
import { pickFile } from "@/features/documents/use-upload";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Schema } from "@/lib/api/types";
import { fromLocalInput } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";
import { checkFile, uploadDocument } from "@/lib/upload";
import { ModalFrame } from "./frame";
import type { Flow } from "./flows";
import { given, reviewFields, type Lists, type Read, type RField } from "./review";

type Doc = Schema<"DocumentOut">;
const STEPS = ["Photo", "Check", "Save"];
const TONE: Record<string, string> = { ok: "ok", info: "info", warn: "warn", bad: "bad" };
const ICON: Record<string, string> = { ok: "M5 12l5 5 9-10", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01", warn: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01", bad: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" };

/** Add a record from a document: upload it, check what was read next to the document, save. */
export function ScanFlow({ kind, flow, onBack, onClose }: { kind: string; flow: Flow; onBack: () => void; onClose: () => void }) {
  const { me, notify } = useConsole();
  const [docs, setDocs] = useState<(Doc | null)[]>(flow.scan.slots.map(() => null));
  const [busy, setBusy] = useState<number | null>(null);
  const [reads, setReads] = useState<Read[] | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (slot: number, camera = false) => {
    const file = await pickFile(camera ? "image/*" : undefined);
    if (!file) return;
    const bad = checkFile(file);
    if (bad) return notify(bad, true);
    setBusy(slot);
    setProblem(null);
    try {
      const doc = await uploadDocument({ file, type: flow.scan.doc });
      setDocs((list) => list.map((d, i) => (i === slot ? doc : d)));
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setBusy(null);
  };
  const read = async () => {
    const sent = docs.filter((d): d is Doc => !!d);
    if (!sent.length) return setProblem(`Upload the ${flow.scan.slots[0]![0].toLowerCase()} first`);
    setReading(true);
    setProblem(null);
    try {
      const done: Read[] = [];
      for (const d of sent) done.push(await unwrap(api.POST("/api/v1/intake/reads", { body: { document_id: d.id, kind: flow.scan.intake } })));
      setReads(done);
    } catch (error) {
      setProblem(errorMessage(error));
    }
    setReading(false);
  };

  if (reads) return <Review key={reads.map((r) => r.id).join()} kind={kind} flow={flow} reads={reads} docs={docs.filter((d): d is Doc => !!d)} onRetake={() => { setReads(null); setDocs(flow.scan.slots.map(() => null)); }} onClose={onClose} />;
  const slots = flow.scan.slots;
  return (
    <ModalFrame
      title={flow.scan.title}
      sub={`${flow.title} · ${me.organization.name}`}
      icon={flow.icon}
      steps={STEPS}
      step={0}
      onClose={onClose}
      left={[{ l: "Back", cls: "ghost", go: onBack }]}
      right={[{ l: "Cancel", go: onClose }, { l: reading ? "Reading…" : "Read it", cls: "pri", go: () => void read(), disabled: reading || busy !== null || !docs[0] }]}
    >
      <div className="mbody c g16">
        <Problem message={problem} />
        <div style={{ display: "grid", gridTemplateColumns: slots.length > 1 ? "1fr 1fr" : "1fr", gap: "12px" }}>
          {slots.map(([t, d], i) => (
            <div key={t} className="drop">
              <span className="cic"><Icon className="s20" d={docs[i] ? "M5 12l5 5 9-10" : "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"} /></span>
              <span className="fs14 w6 tx"><span>{t}</span></span>
              <span className="fs12 mu"><span>{docs[i] ? docs[i]!.filename : d}</span></span>
              <span className="r g8" style={{ marginTop: "6px" }}>
                <button className="btn sm pri" onClick={() => void upload(i)} disabled={busy !== null}>
                  <Icon className="s14" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  {busy === i ? "Uploading…" : docs[i] ? "Replace" : "Upload"}
                </button>
                <button className="btn sm" onClick={() => void upload(i, true)} disabled={busy !== null}>
                  <Icon className="s14" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
                  Use phone camera
                </button>
              </span>
              <span className="fs11 mu">JPG, PNG, WebP or PDF · up to 15 MB</span>
            </div>
          ))}
        </div>
        <div className="tips">
          <span className="fs12 w6 t2">For the best read</span>
          {flow.scan.tips.map((tp) => (
            <span key={tp} className="r g8 ast fs12 t3">
              <Icon className="s14 pc" d="M5 12l5 5 9-10" />
              <span><span>{tp}</span></span>
            </span>
          ))}
        </div>
        <p className="note">
          <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
          <span>{tx(flow.scan.note)}</span>
        </p>
      </div>
    </ModalFrame>
  );
}

function Viewer({ docs, reads, fields, sel, onSel }: { docs: Doc[]; reads: Read[]; fields: RField[]; sel: string | null; onSel: (key: string) => void }) {
  const [enhanced, setEnhanced] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [show, setShow] = useState(true);
  const lineage = reads.some((r) => r.reader === "text")
    ? "Text read straight from the PDF; no image cleanup needed."
    : reads.some((r) => r.reader === "vision")
      ? "Read from the photo. Boxes show where each value was found."
      : "Nothing was read automatically; type the values from the document.";
  return (
    <div className="viewer">
      <div className="vtool">
        <div className="seg sm" role="group" aria-label="Image version">
          <button className={enhanced ? "" : "on"} onClick={() => setEnhanced(false)}>Original</button>
          <button className={enhanced ? "on" : ""} onClick={() => setEnhanced(true)}>Enhanced</button>
        </div>
        <span className="vdiv"></span>
        <button className="btn ghost icon sm" aria-label="Zoom in" onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 0.5))}>
          <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6" />
        </button>
        <button className="btn ghost icon sm" aria-label="Rotate" onClick={() => setTurn((t) => (t + 90) % 360)}><Icon className="s14" d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></button>
        <span className="sp"></span>
        <label className="r g6 fs12 t3">
          <input type="checkbox" className="cbx" checked={show} onChange={(e) => setShow(e.currentTarget.checked)} />
          Show what we read
        </label>
      </div>
      <div className="lineage">
        <Icon className="s14" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
        <span>{lineage} The original is kept with the record.</span>
      </div>
      <div className="rvstage" style={{ flexDirection: "column", gap: "16px", alignItems: "center" }}>
        {docs.map((doc, di) => {
          const read = reads[di];
          const pages = doc.content_type === "application/pdf" ? Array.from({ length: read?.pages ?? 1 }, (_, i) => i + 1) : [1];
          return pages.map((page) => {
            const src = doc.content_type === "application/pdf" ? `/api/v1/documents/${doc.id}/pages/${page}` : `/api/v1/documents/${doc.id}/download?disposition=inline`;
            const boxes = fields.filter((f) => f.read && f.read.readId === read?.id && (f.read.page ?? 1) === page && f.read.box.length === 4);
            return (
              <div key={`${doc.id}-${page}`} style={{ position: "relative", width: `${Math.round(560 * zoom)}px`, maxWidth: zoom > 1 ? "none" : "100%", transform: `rotate(${turn}deg)`, flex: "none", boxShadow: "0 2px 10px rgba(11,18,32,.18)", background: "#FFFFFF" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the user's session; not optimizable */}
                <img src={src} alt={`${doc.filename}${pages.length > 1 ? `, page ${page}` : ""}`} style={{ display: "block", width: "100%", filter: enhanced ? "contrast(1.15) brightness(1.04) saturate(0.9)" : "none" }} />
                {show
                  ? boxes.map((f) => {
                      const [x0, y0, x1, y1] = f.read!.box as [number, number, number, number];
                      const low = (f.read!.confidence ?? 1) < 0.8;
                      return (
                        <button
                          key={f.key}
                          className={clsx("ocr", low && "lo", sel === f.key && "sel")}
                          aria-label={`${f.label} on the document`}
                          onClick={() => onSel(f.key)}
                          style={{ left: `${x0 * 100 - 0.6}%`, top: `${y0 * 100 - 0.5}%`, width: `${(x1 - x0) * 100 + 1.2}%`, height: `${(y1 - y0) * 100 + 1}%`, padding: "0", background: low ? "rgba(229,160,0,.12)" : "rgba(31,79,224,.08)" }}
                        ></button>
                      );
                    })
                  : null}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

function Review({ kind, flow, reads, docs, onRetake, onClose }: { kind: string; flow: Flow; reads: Read[]; docs: Doc[]; onRetake: () => void; onClose: () => void }) {
  const { me, can, set, notify } = useConsole();
  const act = useAction();
  const org = me.organization;
  const lists: Lists = {
    customers: useQuery({ queryKey: [org.id, "customers", "pick"], queryFn: () => unwrap(api.GET("/api/v1/customers", { params: { query: { status: "active", sort: "name", limit: 100 } } })), enabled: kind === "load", staleTime: 60_000 }).data?.items.map((c) => ({ v: c.id, l: c.name })) ?? [],
    loads: useQuery({ queryKey: [org.id, "loads", "pick-pod"], queryFn: () => unwrap(api.GET("/api/v1/loads", { params: { query: { sort: "-pickup_at", limit: 100 } } })), enabled: kind === "invoice", staleTime: 30_000 }).data?.items.filter((l) => ["delivered", "pod_review", "completed", "at_delivery", "in_transit"].includes(l.status)).map((l) => ({ v: l.id, l: `${l.load_number} · ${l.customer.name}`, ab: l.status.replace(/_/g, " ") })) ?? [],
    drivers: useQuery({ queryKey: [org.id, "drivers", "pick"], queryFn: () => unwrap(api.GET("/api/v1/drivers", { params: { query: { sort: "name", limit: 100 } } })), enabled: kind === "inspection", staleTime: 60_000 }).data?.items.map((d) => ({ v: d.id, l: d.full_name })) ?? [],
    trucks: useQuery({ queryKey: [org.id, "vehicles", "pick"], queryFn: () => unwrap(api.GET("/api/v1/vehicles", { params: { query: { sort: "unit_number", limit: 100 } } })), enabled: kind === "inspection", staleTime: 60_000 }).data?.items.map((u) => ({ v: u.id, l: `Truck ${u.unit_number}`, ab: u.plate ?? "" })) ?? [],
    trailers: useQuery({ queryKey: [org.id, "trailers", "pick"], queryFn: () => unwrap(api.GET("/api/v1/trailers", { params: { query: { sort: "unit_number", limit: 100 } } })), enabled: kind === "inspection", staleTime: 60_000 }).data?.items.map((u) => ({ v: u.id, l: `Trailer ${u.unit_number}`, ab: u.plate ?? "" })) ?? [],
  };
  const base = reviewFields(kind, reads, lists);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(base.map((f) => [f.key, f.value])));
  const [others, setOthers] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<string | null>(() => base.find((f) => f.read && (f.read.confidence ?? 1) < 0.8)?.key ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [linkPerson, setLinkPerson] = useState(true);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Lists arrive after the first render: options and matched records come from the latest data.
  const fields = reviewFields(kind, reads, lists).map((f) => ({ ...f, value: vals[f.key] ?? f.value }));
  const checks = reads.flatMap((r) => r.checks);
  const first = reads[0]!;
  const failed = reads.find((r) => r.status !== "done");
  const banner = failed ? { tone: "warn", title: failed.status === "needs_reader" ? "Photo not read." : "Couldn’t read this.", detail: failed.error ?? "" } : checks[0] ?? null;
  const person = checks.find((c) => c.record_type === "person" && c.tone === "info");
  const duplicate = checks.find((c) => c.tone === "bad" && c.record_id);
  const ms = reads.reduce((total, r) => total + r.duration_ms, 0);
  const seconds = ms < 1000 ? "under a second" : `${(ms / 1000).toFixed(1)} s`;
  const meta = failed && failed.status === "needs_reader" ? "Not read" : `Read in ${seconds} · ${docs.length > 1 ? `${docs.length} files` : first.pages > 1 ? `${first.pages} pages` : docs[0]?.content_type === "application/pdf" ? "1 page" : "1 photo"}`;
  const put = (key: string, value: string) => setVals((v) => ({ ...v, [key]: value }));
  const state = { open, q, setOpen, setQ };
  const v = (key: string) => given(vals[key]);

  const apply = async (entity_type: "driver" | "vehicle" | "trailer" | "load" | "inspection", entity_id: string) => {
    for (const r of reads) {
      const saved = Object.fromEntries(fields.filter((f) => f.read?.readId === r.id).map((f) => [f.readKey ?? f.key, f.input === "combo" && f.readKey ? f.read!.value : (vals[f.key] ?? "")]));
      await unwrap(api.POST("/api/v1/intake/reads/{read_id}/apply", { params: { path: { read_id: r.id } }, body: { entity_type, entity_id, saved } }));
    }
  };
  const missing = fields.filter((f) => f.required && !given(vals[f.key]));

  const save = async () => {
    if (missing.length) return setProblem(`Fill in ${missing.map((f) => f.label.toLowerCase()).join(", ")}`);
    setPending(true);
    setProblem(null);
    try {
      let message = "";
      let go: Record<string, unknown> | null = null;
      if (kind === "driver") {
        const d = await unwrap(api.POST("/api/v1/drivers", { body: {
          first_name: v("first_name")!, last_name: v("last_name")!, phone: v("phone"), cdl_number: v("cdl_number"), cdl_state: v("cdl_state"),
          cdl_class: (v("cdl_class") as "A" | "B" | "C" | null), endorsements: v("endorsements"), restrictions: v("restrictions"), cdl_expiry: v("cdl_expiry"),
          date_of_birth: v("date_of_birth"), driver_type: "company", pay_type: "per_mile", pay_rate: "0", status: "active", pay_by: "carrier",
          ...(person && linkPerson ? { person_id: person.record_id } : {}),
        } }));
        await apply("driver", d.id);
        message = `${d.full_name} added · qualification file started`;
        go = { screen: "driver", driverId: d.id };
      } else if (kind === "truck" || kind === "trailer") {
        const common = { unit_number: v("unit_number")!, vin: v("vin"), year: v("year") ? Number(v("year")) : null, make: v("make"), model: v("model"), plate: v("plate"), plate_state: v("plate_state"), registration_expiry: v("registration_expiry"), ownership: "owned" as const, status: "active" as const };
        const unit = kind === "truck"
          ? await unwrap(api.POST("/api/v1/vehicles", { body: { ...common, gvwr: v("gvwr") ? Number(v("gvwr")) : null, registered_owner: v("registered_owner") } }))
          : await unwrap(api.POST("/api/v1/trailers", { body: { ...common, type: (others.type ? "other" : v("type") ?? "dry_van") as "dry_van", type_other: others.type ? v("type") : null, length_ft: v("length_ft") ? Number(v("length_ft")) : null } }));
        await apply(kind === "truck" ? "vehicle" : "trailer", unit.id);
        message = `${unit.unit_number} added · registration filed with it`;
        go = { screen: "truck", unitId: unit.id, unitKind: kind };
      } else if (kind === "load") {
        const when = (d: string | null, t: string | null) => (d ? fromLocalInput(`${d}T${t && /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : "08:00"}`, org.timezone) : null);
        const fsc = Number(v("fuel_surcharge") ?? 0);
        const load = await unwrap(api.POST("/api/v1/loads", { params: { header: { "idempotency-key": crypto.randomUUID() } }, body: {
          customer_id: v("customer_id")!, reference: v("reference"), status: "draft", customer_rate: v("line_haul") ?? "0",
          charges: fsc > 0 ? [{ type: "fuel_surcharge", rate: fsc.toFixed(2) }] : [],
          equipment_type: (v("equipment_type") ?? "dry_van") as "dry_van", commodity: v("commodity"),
          weight_lbs: v("weight_lbs") ? Number(v("weight_lbs")) : null, miles: v("miles") ? Number(v("miles")) : null,
          stops: [
            { type: "pickup", name: v("pickup_name"), city: v("pickup_city")!, state: v("pickup_state"), appt_start: when(v("pickup_date"), v("pickup_time")) },
            { type: "delivery", name: v("delivery_name"), city: v("delivery_city")!, state: v("delivery_state"), appt_start: when(v("delivery_date"), v("delivery_time")) },
          ],
        } as never }));
        await apply("load", load.id);
        message = `Draft ${load.load_number} created from the rate confirmation`;
        go = { ...goTo("loads"), drawer: load.id };
      } else if (kind === "invoice") {
        const loadId = v("load_id")!;
        for (const [key, type] of [["detention", "detention"], ["lumper", "lumper"]] as const) {
          const amount = Number(v(key) ?? 0);
          if (amount > 0) await unwrap(api.POST("/api/v1/loads/{parent_id}/charges", { params: { path: { parent_id: loadId } }, body: { type, rate: amount.toFixed(2) } as never }));
        }
        await apply("load", loadId);
        let load = await unwrap(api.GET("/api/v1/loads/{load_id}", { params: { path: { load_id: loadId } } }));
        if (load.status === "pod_review" && can("loads.close")) {
          load = await unwrap(api.POST("/api/v1/loads/{load_id}/transitions", { params: { path: { load_id: loadId } }, body: { action: "approve_pod", version: load.version } as never })) as typeof load;
        }
        if (load.status !== "completed") throw new Error(`${load.load_number} isn’t completed yet (${load.status.replace(/_/g, " ")}). The POD is filed with it; invoice it once it is completed.`);
        const invoice = await unwrap(api.POST("/api/v1/invoices", { params: { header: { "idempotency-key": crypto.randomUUID() } }, body: { customer_id: load.customer.id, load_ids: [load.id] } as never }));
        message = `Draft ${invoice.invoice_number ?? "invoice"} created for ${load.customer.name}`;
        go = { screen: "invoice", invoiceId: invoice.id };
      } else if (kind === "inspection") {
        const violations = reads.flatMap((r) => r.violations) as { code: string; description: string; out_of_service: boolean }[];
        const oos = violations.some((x) => x.out_of_service);
        const inspection = await unwrap(api.POST("/api/v1/maintenance/inspections", { params: { header: { "idempotency-key": crypto.randomUUID() } }, body: {
          kind: "roadside", inspected_on: v("inspected_on")!, result: oos ? "out_of_service" : violations.length ? "defects" : "pass",
          vehicle_id: v("vehicle_id"), trailer_id: v("trailer_id"), driver_id: v("driver_id"), report_number: v("report_number"),
          location: [v("location"), v("state")].filter(Boolean).join(", ") || null, inspector: v("inspector"),
          notes: v("level") ? `Level ${v("level")}` : null,
          defects: violations.map((x) => ({ item: `${x.code} ${x.description}`.slice(0, 160), severity: x.out_of_service ? "out_of_service" : "major" })),
        } as never }));
        await apply("inspection", inspection.id);
        message = `Inspection saved${oos ? " · out-of-service order recorded" : ""}`;
        go = goTo("inspections");
      }
      await act(async () => undefined);
      onClose();
      notify(message);
      if (go) set({ ...go, overlay: "none", modal: "none" });
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  };

  const violations = reads.flatMap((r) => r.violations) as { code: string; description: string; unit?: string; out_of_service: boolean }[];
  const invoiceLoad = kind === "invoice" ? lists.loads.find((o) => o.v === vals.load_id) : undefined;
  return (
    <ModalFrame
      title="Check what we read"
      sub={`${flow.title} · ${docs.map((d) => d.filename).join(" + ")}`}
      icon={flow.icon}
      steps={STEPS}
      step={1}
      size="wide"
      onClose={onClose}
      left={[{ l: "Back", cls: "ghost", go: onRetake }, { l: "Retake", go: onRetake }]}
      note="Your edits are logged next to what was read"
      right={[{ l: pending ? "Saving…" : flow.cta, cls: "pri", go: () => void save(), disabled: pending || (!!duplicate && kind !== "invoice") }]}
    >
      <div className="rvw">
        <Viewer docs={docs} reads={reads} fields={fields} sel={sel} onSel={setSel} />
        <aside className="fpanel">
          <div className="r g8" style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <span className="h2">What we read</span>
            <span className="sp"></span>
            <span className="fs12 mu">{meta}</span>
          </div>
          <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px 16px" }}>
            <Problem message={problem} />
            {banner ? (
              <div className="banner" data-k={TONE[banner.tone] ?? "info"}>
                <Icon className="s14 b" d={ICON[banner.tone] ?? ICON.info!} />
                <div>
                  <b>{banner.title}</b> {banner.detail}
                </div>
              </div>
            ) : null}
            {checks.slice(banner === checks[0] ? 1 : 0).map((c) => (
              <div key={c.title} className="banner" data-k={TONE[c.tone] ?? "info"}>
                <Icon className="s14 b" d={ICON[c.tone] ?? ICON.info!} />
                <div><b>{c.title}.</b> {c.detail}</div>
              </div>
            ))}
            {person ? (
              <label className="r g8 fs13">
                <input type="checkbox" className="cbx" checked={linkPerson} onChange={(e) => setLinkPerson(e.currentTarget.checked)} />
                <span>Same person: link the driver to their record</span>
              </label>
            ) : null}
            {kind === "inspection" ? (
              <>
                <div className="ires">
                  <div className="r g6 wrap">
                    <span className="h3 f1">Result</span>
                    {violations.some((x) => x.out_of_service) ? <span className="badge" data-k="bad"><i></i>Out of service</span> : violations.length ? <span className="badge" data-k="warn"><i></i>Violations</span> : <span className="badge" data-k="ok"><i></i>Clean</span>}
                  </div>
                </div>
                {violations.length ? (
                  <div className="r g8" style={{ marginTop: "2px" }}>
                    <span className="h3">Violations</span>
                    <span className="cnt" data-k="bad">{violations.length}</span>
                  </div>
                ) : null}
                {violations.map((x) => (
                  <div key={x.code + x.description} className="vcard">
                    <div className="r g6">
                      <span className="mono fs12 w6 tx"><span>{x.code}</span></span>
                      {x.unit ? <span className="tag" data-k="mu"><span>{x.unit}</span></span> : null}
                      <span className="sp"></span>
                      {x.out_of_service ? <span className="tag" data-k="bad">Out of service</span> : null}
                    </div>
                    <div className="fs13 w5 tx"><span>{x.description}</span></div>
                  </div>
                ))}
                <div className="r g8" style={{ marginTop: "4px" }}>
                  <span className="h3">Report details</span>
                  <span className="sp"></span>
                  <span className="fs12 mu">Matched to your drivers and units</span>
                </div>
              </>
            ) : null}
            <div className="ofg">
              {fields.map((f) => {
                const read = f.read;
                const conf = read?.confidence ?? null;
                // A record field (customer, load, driver, unit) is settled once it points at a record.
                const matched = f.input === "combo" && !!f.readKey && !!vals[f.key];
                const check = !matched && read && (read.state === "check" || (conf ?? 1) < 0.8);
                const [badge, tone] = matched ? ["Matched", "ok"] : f.input === "combo" && f.readKey ? ["Pick", "warn"] : f.badge && !read ? f.badge : read?.note ? [read.note, "ok"] : read ? (check ? ["Check", "warn"] : ["Read", "ok"]) : f.badge ?? (f.value ? ["Matched", "ok"] : ["Add", "mu"]);
                const cf = f.input === "combo"
                  ? combo(state, {
                      k: f.key, l: f.label, value: vals[f.key] ?? "", options: f.options ?? [], onPick: (value) => { put(f.key, value); setOthers((o) => ({ ...o, [f.key]: false })); },
                      placeholder: `Choose ${f.label.toLowerCase()}`, head: f.label, search: (f.options?.length ?? 0) > 8,
                      ...(f.other ? { other: { ...f.other, value: vals[f.key] ?? "", set: (value: string) => put(f.key, value) }, otherOn: !!others[f.key], onOther: () => { setOthers((o) => ({ ...o, [f.key]: true })); put(f.key, ""); } } : {}),
                    })
                  : null;
                return (
                  <div key={f.key} className={clsx("ofld", check && "lo", sel === f.key && "sel", f.half && "half")} onClick={() => setSel(f.key)}>
                    <div className="r g6">
                      <span className="fs12 w5 t2 f1"><span>{f.label}</span>{f.required ? " *" : ""}</span>
                      <span className="risk" data-k={tone}>
                        <Icon className="s12 b" d={tone === "ok" ? "M5 12l5 5 9-10" : tone === "warn" ? ICON.warn! : "M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"} />
                        <span>{badge}</span>
                      </span>
                    </div>
                    {cf ? (
                      <>
                        <Combobox f={cf} />
                        {cf.showOther ? <input className="inp othr" value={vals[f.key] ?? ""} placeholder={f.other?.ph} aria-label={f.other?.label} onChange={(e) => put(f.key, e.currentTarget.value)} /> : null}
                      </>
                    ) : f.input === "seg" ? (
                      <div className="seg" role="group" aria-label={f.label} style={{ alignSelf: "flex-start" }}>
                        {f.options?.map((o) => (
                          <button key={o.v} className={vals[f.key] === o.v ? "on" : ""} aria-pressed={vals[f.key] === o.v} onClick={() => put(f.key, o.v)}>{o.l}</button>
                        ))}
                      </div>
                    ) : (
                      <input className={clsx("inp", (f.mono || f.input === "money" || f.input === "int") && "mono")} type={f.input === "date" ? "date" : "text"} inputMode={f.input === "money" ? "decimal" : f.input === "int" ? "numeric" : undefined}
                        value={vals[f.key] ?? ""} placeholder={f.placeholder} aria-label={f.label} style={{ height: "32px" }} onChange={(e) => put(f.key, e.currentTarget.value)} />
                    )}
                    {conf !== null && conf !== undefined ? (
                      <div className="r g8">
                        <span className="bar" data-k={check ? "warn" : "ok"} style={{ height: "4px" }}><span style={{ width: `${Math.round(conf * 100)}%` }}></span></span>
                        <span className="fs11 mu num nw">{Math.round(conf * 100)}% confidence</span>
                      </div>
                    ) : null}
                    {f.note ? <p className="fs12 t3"><span>{f.note}</span></p> : null}
                  </div>
                );
              })}
            </div>
            {kind === "invoice" && invoiceLoad ? (
              <p className="note">
                <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
                <span>{`The draft invoice bills ${invoiceLoad.l.split(" · ")[0]} with its line haul and charges${Number(vals.detention || 0) + Number(vals.lumper || 0) > 0 ? `, plus ${formatMoney(String(Number(vals.detention || 0) + Number(vals.lumper || 0)))} read from the POD` : ""}. Approving the POD here completes the load.`}</span>
              </p>
            ) : null}
            {duplicate && kind !== "invoice" ? (
              <p className="note">
                <Icon className="s14" d={ICON.bad!} />
                <span>{"Already on file, so nothing new is created. Open the existing record instead."}</span>
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </ModalFrame>
  );
}
