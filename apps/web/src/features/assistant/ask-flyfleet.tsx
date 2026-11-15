"use client";

import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Ask FlyFleet: the assistant panel. */
export function AskFlyFleet() {
  const { isAI, closeOverlay, AI } = useConsole();
  if (!isAI) return null;
  return (
    <aside className="aip" aria-label="Ask FlyFleet">
      <div className="r g8" style={{ padding: "14px 16px", borderBottom: "1px solid var(--bd)" }}>
        <span className="ilogo" data-k="violet" style={{ width: "30px", height: "30px" }}>
          <Icon className="s14" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
        </span>
        <div className="f1">
          <div className="fs14 w6">Ask FlyFleet</div>
          <div className="fs11 mu">Answers from records you can see · read-only</div>
        </div>
        <button className="btn ghost icon sm" aria-label="New chat"><Icon className="s14" d="M12 5v14M5 12h14" /></button>
        <button className="btn ghost icon sm" onClick={closeOverlay} aria-label="Close assistant"><Icon d="M18 6L6 18M6 6l12 12" /></button>
      </div>
      <div className="aiscope">
        <span className="r g6">
          <Icon className="s12" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          {"Using: "}<span>{AI.uses}</span>
        </span>
        {AI.hidden ? (
          <span className="r g6">
            <Icon className="s12" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
            {"Hidden for your role: "}<span>{AI.hidden}</span>
          </span>
        ) : null}
      </div>
      <div className="aibody">
        <div className="aiq">What needs my attention before 2 pm, and what should I do first?</div>
        <div className="aia">
          <p className="fs13">Three things, in order of deadline:</p>
          <ol className="c g10" style={{ marginTop: "8px" }}>
            {AI.items.map((a, i) => (
              <li key={i} className="aili">
                <span className="ain mono"><span>{a.n}</span></span>
                <div className="f1">
                  <p className="fs13 t2"><span>{a.t}</span></p>
                  <div className="r g4 wrap" style={{ marginTop: "5px" }}>
                    {a.src.map((s, i2) => (
                      <button key={i2} className="srcchip" onClick={s.go}>
                        <Icon className="s12" d={s.ic} />
                        <span>{s.l}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {AI.draft ? (
            <div className="aiact">
              <div className="r g8">
                <span className="tag" data-k="violet">Draft · needs your approval</span>
                <span className="sp"></span>
                <span className="fs11 mu">Email to Walmart DC 6094</span>
              </div>
              <p className="fs12 t2" style={{ marginTop: "6px", lineHeight: "17px" }}>
                Hi Kelly — load FF-24817 (PO 71904) is running late due to traffic on I-35 near Ardmore. Our updated ETA at DC 6094 is 16:40 CT against the 15:00 appointment. Can you confirm whether a later slot works today? — Lone Star Freight Dispatch
              </p>
              <div className="r g6" style={{ marginTop: "8px" }}>
                <button className="btn xs">Edit</button>
                <button className="btn xs pri">{"Approve & send"}</button>
              </div>
            </div>
          ) : null}
          <div className="r g8 fs11 mu" style={{ marginTop: "10px" }}>
            <span className="f1">Data as of 11:20 CT · 7 records read · AI can be wrong — check the sources.</span>
            <button className="btn ghost xs icon" aria-label="Helpful">
              <Icon className="s12" d="M7 10v12M15 5.9L14 10h5.8a2 2 0 0 1 2 2.3l-1.4 9a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z" />
            </button>
          </div>
        </div>
      </div>
      <div className="aiin">
        <div className="r g6 wrap">
          {AI.sugg.map((sg, i) => (
            <button key={i} className="btn xs"><span>{sg}</span></button>
          ))}
        </div>
        <div className="r g8 aibox">
          <input placeholder="Ask about loads, drivers, documents…" aria-label="Ask FlyFleet" />
          <button className="btn pri sm icon" aria-label="Send question"><Icon className="s14" d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></button>
        </div>
      </div>
    </aside>
  );
}
