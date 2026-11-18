"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Fragment, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { goTo } from "@/features/console/shell";
import type { ConsoleState } from "@/features/console/state";
import { loadLabel, loadTone } from "@/features/fleet/labels";
import { useDebounced } from "@/hooks/use-debounced";
import { api, unwrap } from "@/lib/api/client";

type Item = { key: string; t: string; s: string; ic: string; go: () => void; kbd?: string; badge?: { l: string; k: string } };

const KINDS: Record<string, { label: string; ic: string; open: (id: string) => ConsoleState }> = {
  load: { label: "Loads", ic: I.loads, open: (id) => ({ screen: "loads", drawer: id }) },
  customer: { label: "Customers", ic: I.building, open: () => goTo("customers") },
  driver: { label: "Drivers", ic: I.user, open: (id) => ({ screen: "driver", driverId: id }) },
  vehicle: { label: "Trucks", ic: I.truck, open: (id) => ({ screen: "truck", unitId: id, unitKind: "truck" }) },
  trailer: { label: "Trailers", ic: I.trailer, open: (id) => ({ screen: "truck", unitId: id, unitKind: "trailer" }) },
  invoice: { label: "Invoices", ic: I.invoice, open: () => goTo("invoices") },
  work_order: { label: "Work orders", ic: I.wrench, open: () => goTo("maintenance") },
  document: { label: "Documents", ic: I.file, open: (id) => ({ ...goTo("docreview"), docId: id }) },
};
/** A result's state, where it has one, as a badge. */
const badgeOf = (type: string, status: string | null | undefined): Item["badge"] =>
  !status ? undefined : type === "load" ? { l: loadLabel(status), k: loadTone(status) } : type === "document" && status === "pending" ? { l: "Review", k: "info" } : undefined;

/** Search every record the role may see, and jump anywhere, opened with ⌘K. */
export function CommandPalette() {
  const { me, isPalette, closeOverlay, nav, CR, set, can } = useConsole();
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const q = useDebounced(text.trim(), 200);
  const search = useQuery({ queryKey: [me.organization.id, "search", q], queryFn: () => unwrap(api.GET("/api/v1/search", { params: { query: { q, limit: 5 } } })), enabled: isPalette && q.length >= 2 });
  if (!isPalette) return null;

  const close = () => {
    setText("");
    setCursor(0);
    closeOverlay();
  };
  const groups: { l: string; items: Item[] }[] = [];
  const found = q.length >= 2 ? (search.data ?? []) : [];
  for (const [type, kind] of Object.entries(KINDS)) {
    const mine = found.filter((result) => result.type === type);
    if (mine.length) groups.push({ l: kind.label, items: mine.map((result) => ({ key: result.id, t: result.title, s: result.subtitle ?? "", ic: kind.ic, badge: badgeOf(type, result.status), go: () => { close(); set({ ...kind.open(result.id), overlay: "none", modal: "none" }); } })) });
  }
  const words = text.trim().toLowerCase();
  const places = nav.flatMap((group) => group.items).filter((item) => !item.locked && (!words || item.label.toLowerCase().includes(words)));
  if (places.length) groups.push({ l: "Go to", items: places.slice(0, words ? 6 : 5).map((item) => ({ key: `go-${item.label}`, t: item.label, s: "Open", ic: item.d, go: () => { close(); item.go(); } })) });
  // What can be done with what was found, then what can be made: the matching kinds, or the most common two.
  const loads = found.filter((result) => result.type === "load");
  const actions: Item[] = [
    ...(can("dispatch.assign") ? loads.filter((l) => l.status === "planned").slice(0, 2).map((l) => ({ key: `assign-${l.id}`, t: `Assign a driver to ${l.title}`, s: "Opens the assignment panel", ic: I.user, go: () => { close(); set({ ...goTo("dispatch"), panel: "assign", assignLoad: l.id }); } })) : []),
    ...(can("loads.close") ? loads.filter((l) => l.status === "pod_review").slice(0, 2).map((l) => ({ key: `pod-${l.id}`, t: `Review the POD for ${l.title}`, s: "Opens the load", ic: I.file, go: () => { close(); set({ screen: "loads", drawer: l.id, overlay: "none", modal: "none" }); } })) : []),
  ];
  const matching = CR.filter((item) => words && item.t.toLowerCase().includes(words));
  const creates = (matching.length ? matching : CR.slice(0, 2)).slice(0, 4);
  actions.push(...creates.map((item) => ({ key: `new-${item.t}`, t: item.t, s: item.s, ic: item.ic, go: () => { close(); item.go(); } })));
  if (actions.length) groups.push({ l: "Actions", items: actions });
  const flat = groups.flatMap((group) => group.items);
  const active = Math.min(cursor, Math.max(0, flat.length - 1));
  const foot = q.length >= 2 && search.isFetching ? "Searching…" : "Only results your role can open are shown";

  return (
    <>
      <div className="scrim" onClick={close} style={{ zIndex: "40" }}></div>
      <div className="pal" role="dialog" aria-label="Search everything">
        <div className="palin">
          <Icon className="s18 mu" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          <input
            autoFocus
            value={text}
            placeholder="Search loads, drivers, trucks, invoices…"
            aria-label="Search everything"
            onChange={(event) => {
              setText(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor(Math.min(active + 1, flat.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                flat[active]?.go();
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palbody">
          {q.length >= 2 && search.data && !search.data.length ? <div className="palg"><span>{`No records match “${q}”`}</span></div> : null}
          {groups.map((g) => (
            <Fragment key={g.l}>
              <div className="palg"><span>{g.l}</span></div>
              {g.items.map((it) => (
                <button key={it.key} className={clsx("pali", flat.indexOf(it) === active && "on")} onClick={it.go} onMouseEnter={() => setCursor(flat.indexOf(it))}>
                  <span className="paic"><Icon className="s14" d={it.ic} /></span>
                  <span className="f1 c">
                    <span className="fs13 w5 tx ell"><span>{it.t}</span></span>
                    <span className="fs12 mu ell"><span>{it.s}</span></span>
                  </span>
                  {it.badge ? <span className="badge" data-k={it.badge.k}><i></i>{it.badge.l}</span> : null}
                  {it.kbd ? <span className="kbd"><span>{it.kbd}</span></span> : null}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
        <div className="palf">
          <span className="r g4">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            move
          </span>
          <span className="r g4">
            <span className="kbd">↵</span>
            open
          </span>
          <span className="sp"></span>
          <span><span>{foot}</span></span>
        </div>
      </div>
    </>
  );
}
