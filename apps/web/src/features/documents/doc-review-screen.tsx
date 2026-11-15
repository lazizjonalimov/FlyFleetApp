"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Document review: scan, recognised fields and approval. */
export function DocReviewScreen() {
  const { isDocReview, goDocs, DR } = useConsole();
  if (!isDocReview) return null;
  return (
    <div className="col">
      <div className="ph" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--bd)" }}>
        <div className="f1">
          <div className="crumb">
            <span>{"Safety & fleet"}</span>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <button onClick={goDocs}>Documents</button>
            <Icon className="s12" d="M9 6l6 6-6 6" />
            <b className="mono">POD-FF-24782.pdf</b>
          </div>
          <div className="r g10">
            <h1 className="h1">Proof of delivery · FF-24782</h1>
            <span className="badge" data-k="info">
              <i></i>
              Needs review
            </span>
          </div>
          <p className="sub">Scanned by Sam Whitfield in the driver app · Nov 12, 11:42 CT · 2 pages · Home Depot Supply → HD Supply Shreveport</p>
        </div>
        <div className="r g8">
          <span className="fs12 mu nw">2 of 3 in queue</span>
          <div className="r">
            <button className="btn icon sm" aria-label="Previous document" style={{ borderRadius: "6px 0 0 6px" }}><Icon className="s14" d="M15 6l-6 6 6 6" /></button>
            <button className="btn icon sm" aria-label="Next document" style={{ borderRadius: "0 6px 6px 0", marginLeft: "-1px" }}>
              <Icon className="s14" d="M9 6l6 6-6 6" />
            </button>
          </div>
          <button className="btn bad">Reject…</button>
          <button className="btn pri">
            <Icon className="s14 b" d="M5 12l5 5 9-10" />
            {"Approve & attach"}
          </button>
        </div>
      </div>
      <div className="drg">
        <div className="thumbs">
          <button className="thumb on" aria-label="Page 1">
            <span className="tpaper">
              <i style={{ width: "70%" }}></i>
              <i></i>
              <i style={{ width: "55%" }}></i>
              <i></i>
              <i style={{ width: "80%" }}></i>
            </span>
            <span className="fs11 mu">1 · POD</span>
          </button>
          <button className="thumb" aria-label="Page 2">
            <span className="tpaper">
              <i style={{ width: "60%" }}></i>
              <i style={{ width: "85%" }}></i>
              <i></i>
              <i style={{ width: "40%" }}></i>
            </span>
            <span className="fs11 mu">2 · BOL copy</span>
          </button>
          <button className="thumb add" aria-label="Add page"><Icon className="s14" d="M12 5v14M5 12h14" /></button>
        </div>
        <div className="viewer">
          <div className="vtool">
            <div className="seg sm" role="group" aria-label="Image version">
              <button>Original</button>
              <button className="on">Enhanced</button>
            </div>
            <span className="vdiv"></span>
            <button className="btn ghost icon sm" aria-label="Zoom out"><Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" /></button>
            <span className="mono fs12 t3">100%</span>
            <button className="btn ghost icon sm" aria-label="Zoom in">
              <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6" />
            </button>
            <button className="btn ghost icon sm" aria-label="Rotate"><Icon className="s14" d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></button>
            <button className="btn ghost icon sm" aria-label="Crop"><Icon className="s14" d="M6.1 2v14a2 2 0 0 0 2 2H22M2 6.1h14a2 2 0 0 1 2 2V22" /></button>
            <span className="sp"></span>
            <label className="r g6 fs12 t3">
              <input type="checkbox" className="cbx" defaultChecked />
              Show OCR boxes
            </label>
          </div>
          <div className="lineage">
            <Icon className="s14" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
            <span>Enhanced copy: edges detected · perspective corrected · deskewed 2.1° · contrast +18%. The original photo is kept unchanged.</span>
          </div>
          <div className="vstage">
            <div className="paper">
              <span className="pa pp-t" style={{ left: "32px", top: "24px" }}>DELIVERY RECEIPT</span>
              <span className="pa pp-s" style={{ left: "32px", top: "48px" }}>Proof of delivery — retain with bill of lading</span>
              <span className="pa pp-box" style={{ left: "430px", top: "28px" }}>Page 1 of 1</span>
              <span className="pa pp-rule" style={{ top: "70px", height: "2px" }}></span>
              <span className="pa pp-l" style={{ left: "32px", top: "84px" }}>Consignee</span>
              <span className="pa pp-l" style={{ left: "290px", top: "84px" }}>Carrier</span>
              <span className="pa pp-v" style={{ left: "290px", top: "101px" }}>Lone Star Freight · MC 884213</span>
              <span className="pa pp-l" style={{ left: "32px", top: "132px" }}>Ship date</span>
              <span className="pa pp-l" style={{ left: "290px", top: "132px" }}>Trailer</span>
              <span className="pa pp-v" style={{ left: "290px", top: "149px" }}>TR-5259</span>
              <span className="pa pp-rule" style={{ top: "182px" }}></span>
              <span className="pa pp-l" style={{ left: "32px", top: "190px" }}>BOL #</span>
              <span className="pa pp-l" style={{ left: "200px", top: "190px" }}>Load #</span>
              <span className="pa pp-l" style={{ left: "368px", top: "190px" }}>PO</span>
              <span className="pa pp-l" style={{ left: "32px", top: "244px" }}>Qty</span>
              <span className="pa pp-l" style={{ left: "120px", top: "244px" }}>Description</span>
              <span className="pa pp-l" style={{ left: "430px", top: "244px" }}>Weight</span>
              <span className="pa pp-rule" style={{ top: "262px", background: "#1D2433" }}></span>
              <span className="pa pp-v" style={{ left: "120px", top: "271px" }}>Building materials, palletized</span>
              <span className="pa pp-v" style={{ left: "430px", top: "271px" }}>38,400 lb</span>
              <span className="pa pp-v" style={{ left: "120px", top: "296px", color: "#5A6478" }}>Shrink-wrapped · no hazmat</span>
              <span className="pa pp-rule" style={{ top: "322px" }}></span>
              <span className="pa pp-l" style={{ left: "32px", top: "334px" }}>Received in good order except as noted:</span>
              <span className="pa pp-rule" style={{ top: "388px", background: "#9AA3B2" }}></span>
              <svg className="pa pp-scrib" style={{ left: "40px", top: "420px" }} viewBox="0 0 160 40" aria-hidden="true">
                <path d="M4 30 C 20 4, 30 36, 44 18 S 66 8, 72 26 S 96 34, 104 14 S 130 20, 156 10" />
              </svg>
              <span className="pa pp-rule" style={{ top: "468px", background: "#1D2433" }}></span>
              <span className="pa pp-l" style={{ left: "32px", top: "474px" }}>Receiver signature</span>
              <span className="pa pp-l" style={{ left: "250px", top: "474px" }}>Printed name</span>
              <span className="pa pp-l" style={{ left: "404px", top: "474px" }}>Date / time</span>
              <span className="pa pp-l" style={{ left: "32px", top: "526px" }}>Lone Star Freight · Dallas, TX · Driver S. Whitfield · T-1102</span>
              <span className="pa pp-stamp" style={{ left: "356px", top: "330px" }}>
                RECEIVED
                <br />
                <span>NOV 12 2026</span>
              </span>
              <span className="ocr" style={{ left: "28px", top: "99px" }}>HD Supply Shreveport #6</span>
              <span className="ocr" style={{ left: "28px", top: "147px" }}>11/12/2026</span>
              <span className="ocr" style={{ left: "28px", top: "206px" }}>55102</span>
              <span className="ocr" style={{ left: "196px", top: "206px" }}>FF-24782</span>
              <span className="ocr" style={{ left: "364px", top: "206px" }}>29802</span>
              <span className="ocr" style={{ left: "28px", top: "269px" }}>22 PLT</span>
              <span className="ocr hand" style={{ left: "28px", top: "354px" }}>none</span>
              <span className="ocr hand lo" style={{ left: "246px", top: "436px" }}>R. Alvarez</span>
              <span className="ocr hand lo sel" style={{ left: "400px", top: "436px" }}>11/12 11:34</span>
            </div>
          </div>
        </div>
        <aside className="fpanel">
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
            <div className="r g8">
              <span className="h2">Extracted fields</span>
              <span className="sp"></span>
              <span className="fs12 mu">OCR adapter v2 · 11:42</span>
            </div>
            <div className="r g8" style={{ marginTop: "8px" }}>
              <span className="fs12 t3">Document type</span>
              <span className="tag" data-k="brand">Proof of delivery</span>
              <span className="fs12 mu num">98%</span>
              <button className="lnk">Change</button>
            </div>
          </div>
          <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px" }}>
            <div className="banner" data-k="ok">
              <Icon className="s14 b" d="M5 12l5 5 9-10" />
              <div>
                <b>Matches FF-24782.</b>
                {" BOL and load numbers match, consignee matches stop 2."}
              </div>
            </div>
            {DR.fields.map((f, i) => (
              <div key={i} className={clsx("ofld", f.cls)}>
                <div className="r g6">
                  <span className="fs12 w5 t2 f1"><span>{f.l}</span></span>
                  <span className="risk" data-k={f.k}>
                    <Icon className="s12 b" d={f.ic} />
                    <span>{f.st}</span>
                  </span>
                </div>
                <input className={clsx("inp", f.mono)} defaultValue={f.v} aria-label={f.l} style={{ height: "32px" }} />
                <div className="r g8">
                  <span className="bar" data-k={f.k} style={{ height: "4px" }}><span style={{ width: f.pct }}></span></span>
                  <span className="fs11 mu num nw"><span>{f.conf}</span>{" confidence"}</span>
                </div>
                {f.note ? (
                  <div className="c g6">
                    <p className="fs12 t3"><span>{f.note}</span></p>
                    <input className="inp" placeholder="Correction reason (required if you change the value)" aria-label="Correction reason" style={{ height: "32px" }} />
                    <div className="r g6">
                      <button className="btn xs">Confirm as read</button>
                      <button className="btn xs ghost">Mark unreadable</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="dfoot" style={{ padding: "10px 16px", flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              Malware scan passed · checksum verified · private storage
            </div>
            <div className="r g6 fs12 mu">
              <Icon className="s14" d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
              Raw OCR and your corrections are stored separately
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
