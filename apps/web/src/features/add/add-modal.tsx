"use client";

import { Fragment } from "react";
import { clsx } from "clsx";
import { Combobox } from "@/components/forms/combobox";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { tx } from "@/features/console/dom";

/** Add a record from a photo or by hand, or import a spreadsheet. */
export function AddModal() {
  const { hasModal, closeModal, MD, I } = useConsole();
  if (!hasModal) return null;
  return (
    <>
      <div className="scrim" style={{ zIndex: "50" }} onClick={closeModal}></div>
      <div className={clsx("modal", MD.size, MD.ddCls)} role="dialog" aria-modal="true" aria-label={MD.title}>
        <div className="mh">
          <span className="mhic"><Icon className="s18" d={MD.ic} /></span>
          <div className="f1">
            <h2 className="fs16 w6 tx"><span>{MD.title}</span></h2>
            <p className="fs13 mu" style={{ marginTop: "2px" }}><span>{MD.sub}</span></p>
          </div>
          {MD.hasSteps ? (
            <ol className="mst" aria-label="Steps">
              {MD.steps.map((st, i) => (
                <li key={i} className={st.cls} aria-current={st.cur}>
                  <span className="n">
                    {st.done ? (
                      <Icon className="s12 b" d="M5 12l5 5 9-10" />
                    ) : null}
                    {st.todo ? (
                      <span>{st.n}</span>
                    ) : null}
                  </span>
                  <span>{st.l}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <button className="btn ghost icon sm" onClick={closeModal} aria-label="Close"><Icon d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        {MD.isChoose ? (
          <div className="mbody">
            <div className="choices">
              {MD.choices?.map((o, i) => (
                <button key={i} className={clsx("choice", o.cls)} onClick={o.go}>
                  <span className="r" style={{ width: "100%" }}>
                    <span className="cic"><Icon className="s20" d={o.ic} /></span>
                    <span className="sp"></span>
                    {o.tag ? (
                      <span className="tag" data-k="brand"><span>{o.tag}</span></span>
                    ) : null}
                  </span>
                  <span className="fs15 w6 tx"><span>{o.t}</span></span>
                  <span className="fs13 mu pre" style={{ lineHeight: "19px" }}><span>{o.d}</span></span>
                  {o.hasReads ? (
                    <span className="r g4 wrap" style={{ marginTop: "2px" }}>
                      {o.reads.map((x, i2) => (
                        <span key={i2} className="tag" data-k="mu"><span>{x}</span></span>
                      ))}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {MD.bulk ? (
              <div className="bulkln">
                <span className="eqic"><Icon className="s14" d={I.sheet} /></span>
                <span className="f1">{tx(MD.bulkT)}{" "}Bring them in from a CSV or Excel file.</span>
                <button className="btn sm" onClick={MD.bulkGo}>Import a spreadsheet</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {MD.isPhoto ? (
          <div className="mbody c g16">
            <div style={{ display: "grid", gridTemplateColumns: MD.slotCols, gap: "12px" }}>
              {MD.slots?.map((sl, i) => (
                <div key={i} className="drop">
                  <span className="cic"><Icon className="s20" d={I.camera} /></span>
                  <span className="fs14 w6 tx"><span>{sl.t}</span></span>
                  <span className="fs12 mu"><span>{sl.d}</span></span>
                  <span className="r g8" style={{ marginTop: "6px" }}>
                    <button className="btn sm pri" onClick={sl.go}>
                      <Icon className="s14" d={I.upload} />
                      Upload
                    </button>
                    <button className="btn sm" onClick={sl.go}>
                      <Icon className="s14" d={I.mobile} />
                      Use phone camera
                    </button>
                  </span>
                  <span className="fs11 mu">or drop a file here · JPG, PNG, HEIC or PDF</span>
                </div>
              ))}
            </div>
            <div className="tips">
              <span className="fs12 w6 t2">For the best read</span>
              {MD.tips?.map((tp, i) => (
                <span key={i} className="r g8 ast fs12 t3">
                  <Icon className="s14 pc" d="M5 12l5 5 9-10" />
                  <span><span>{tp}</span></span>
                </span>
              ))}
            </div>
            <p className="note">
              <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
              <span>{tx(MD.alt)}</span>
            </p>
          </div>
        ) : null}
        {MD.isReview ? (
          <div className="rvw">
            <div className="viewer">
              <div className="vtool">
                <div className="seg sm" role="group" aria-label="Image version">
                  <button>Original</button>
                  <button className="on">Enhanced</button>
                </div>
                <span className="vdiv"></span>
                <button className="btn ghost icon sm" aria-label="Zoom in">
                  <Icon className="s14" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6" />
                </button>
                <button className="btn ghost icon sm" aria-label="Rotate"><Icon className="s14" d="M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></button>
                <span className="sp"></span>
                <label className="r g6 fs12 t3">
                  <input type="checkbox" className="cbx" defaultChecked />
                  Show what we read
                </label>
              </div>
              <div className="lineage">
                <Icon className="s14" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
                <span>{tx(MD.lineage)}</span>
              </div>
              <div className="rvstage">
                {MD.isCdl ? (
                  <div className="idcard" role="img" aria-label="Photo of a commercial driver license, sample">
                    <div className="band">
                      <span style={{ font: "800 18px/1 var(--ui)", letterSpacing: ".06em" }}>TX</span>
                      <span style={{ font: "700 11px/1 var(--ui)", letterSpacing: ".14em" }}>COMMERCIAL DRIVER LICENSE</span>
                      <span className="sp"></span>
                      <span style={{ font: "600 10px/1 var(--ui)", letterSpacing: ".12em", opacity: ".8" }}>USA</span>
                    </div>
                    <div className="ph">
                      <svg viewBox="0 0 104 132" width="104" height="132" aria-hidden="true">
                        <circle cx="52" cy="50" r="22" fill="#A7B3C4" />
                        <path d="M12 132c4-30 20-44 40-44s36 14 40 44z" fill="#A7B3C4" />
                      </svg>
                    </div>
                    <span className="idk" style={{ left: "140px", top: "58px" }}>4d DL NO.</span>
                    <span className="ocr" style={{ left: "136px", top: "69px", fontSize: "14px" }}>41208837</span>
                    <span className="idk" style={{ left: "300px", top: "58px" }}>9 CLASS</span>
                    <span className="ocr" style={{ left: "296px", top: "69px", fontSize: "14px" }}>A</span>
                    <span className="idk" style={{ left: "140px", top: "98px" }}>1 LAST</span>
                    <span className="ocr" style={{ left: "136px", top: "109px" }}>MEDINA</span>
                    <span className="idk" style={{ left: "140px", top: "136px" }}>2 FIRST</span>
                    <span className="ocr" style={{ left: "136px", top: "147px" }}>CARLOS ANDRES</span>
                    <span className="idk" style={{ left: "140px", top: "176px" }}>8 ADDRESS</span>
                    <span className="idv" style={{ left: "140px", top: "187px", fontSize: "11px", fontWeight: "600" }}>4417 ELM CREST DR, GARLAND TX</span>
                    <span className="idk" style={{ left: "140px", top: "212px" }}>3 DOB</span>
                    <span className="ocr" style={{ left: "136px", top: "223px" }}>06/14/1988</span>
                    <span className="idk" style={{ left: "252px", top: "212px" }}>4b EXP</span>
                    <span className="ocr" style={{ left: "248px", top: "223px" }}>06/14/2030</span>
                    <span className="idk" style={{ left: "140px", top: "250px" }}>9a END</span>
                    <span className="ocr lo sel" style={{ left: "136px", top: "261px" }}>N H</span>
                    <span className="idk" style={{ left: "252px", top: "250px" }}>12 REST</span>
                    <span className="ocr" style={{ left: "248px", top: "261px" }}>NONE</span>
                    <svg viewBox="0 0 104 30" width="104" height="30" style={{ position: "absolute", left: "18px", top: "204px" }} aria-hidden="true">
                      <path d="M4 22 C 14 6, 22 26, 32 14 S 48 8, 56 20 S 74 26, 82 12 S 96 14, 100 8" fill="none" stroke="#1E3A8A" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <span className="glare"></span>
                    <span className="sample">SAMPLE</span>
                  </div>
                ) : null}
                {MD.isReg ? (
                  <div className="paper" style={{ height: "320px" }} role="img" aria-label="Photo of a vehicle registration, sample">
                    <span className="pa pp-t" style={{ left: "32px", top: "24px" }}>VEHICLE REGISTRATION</span>
                    <span className="pa pp-s" style={{ left: "32px", top: "48px" }}>Cab card · keep in the vehicle</span>
                    <span className="pa pp-box" style={{ left: "440px", top: "28px" }}>SAMPLE</span>
                    <span className="pa pp-rule" style={{ top: "70px", height: "2px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "82px" }}>Plate</span>
                    <span className={clsx("ocr", MD.reg?.plateLo)} style={{ left: "28px", top: "97px" }}>{tx(MD.reg?.plate)}</span>
                    <span className="pa pp-l" style={{ left: "200px", top: "82px" }}>State</span>
                    <span className="ocr" style={{ left: "196px", top: "97px" }}>TEXAS</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "82px" }}>Expires</span>
                    <span className={clsx("ocr", MD.reg?.expLo)} style={{ left: "326px", top: "97px" }}>{tx(MD.reg?.exp)}</span>
                    <span className="pa pp-rule" style={{ top: "132px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "142px" }}>Vehicle identification number</span>
                    <span className="ocr" style={{ left: "28px", top: "157px", fontFamily: "var(--mono)" }}>{tx(MD.reg?.vin)}</span>
                    <span className="pa pp-l" style={{ left: "32px", top: "192px" }}>Year</span>
                    <span className="ocr" style={{ left: "28px", top: "207px" }}>{tx(MD.reg?.year)}</span>
                    <span className="pa pp-l" style={{ left: "100px", top: "192px" }}>Make</span>
                    <span className="ocr" style={{ left: "96px", top: "207px" }}>{tx(MD.reg?.make)}</span>
                    <span className="pa pp-l" style={{ left: "180px", top: "192px" }}>Model · body</span>
                    <span className="ocr" style={{ left: "176px", top: "207px" }}>{tx(MD.reg?.model)}</span>
                    <span className="pa pp-l" style={{ left: "420px", top: "192px" }}>GVWR</span>
                    <span className="ocr" style={{ left: "416px", top: "207px" }}>{tx(MD.reg?.gvwr)}</span>
                    <span className="pa pp-rule" style={{ top: "242px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "252px" }}>Registered owner</span>
                    <span className="ocr" style={{ left: "28px", top: "267px" }}>{tx(MD.reg?.owner)}</span>
                  </div>
                ) : null}
                {MD.isRate ? (
                  <div className="paper" role="img" aria-label="Rate confirmation document, sample">
                    <span className="pa pp-t" style={{ left: "32px", top: "24px" }}>RATE CONFIRMATION</span>
                    <span className="pa pp-s" style={{ left: "32px", top: "48px" }}>Georgia-Pacific Transportation · carrier load tender</span>
                    <span className="pa pp-box" style={{ left: "440px", top: "28px" }}>SAMPLE</span>
                    <span className="pa pp-rule" style={{ top: "70px", height: "2px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "82px" }}>Carrier</span>
                    <span className="pa pp-v" style={{ left: "32px", top: "99px" }}>Lone Star Freight · MC 884213</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "82px" }}>Reference</span>
                    <span className="ocr" style={{ left: "326px", top: "97px" }}>PO 31044</span>
                    <span className="pa pp-rule" style={{ top: "130px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "140px" }}>Pickup</span>
                    <span className="ocr" style={{ left: "28px", top: "155px" }}>GP Irving Mill · Irving, TX</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "140px" }}>Window</span>
                    <span className="ocr" style={{ left: "326px", top: "155px" }}>11/16 07:00–09:00</span>
                    <span className="pa pp-l" style={{ left: "32px", top: "190px" }}>Delivery</span>
                    <span className="ocr" style={{ left: "28px", top: "205px" }}>GP Little Rock DC · Little Rock, AR</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "190px" }}>Appointment</span>
                    <span className="ocr lo sel" style={{ left: "326px", top: "205px" }}>11/16 17:00</span>
                    <span className="pa pp-stamp" style={{ left: "372px", top: "184px", fontSize: "12px", lineHeight: "14px", padding: "4px 8px" }}>
                      TENDER
                      <br />
                      ACCEPTED
                    </span>
                    <span className="pa pp-rule" style={{ top: "244px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "254px" }}>Equipment</span>
                    <span className="ocr" style={{ left: "28px", top: "269px" }}>{"53' DRY VAN"}</span>
                    <span className="pa pp-l" style={{ left: "200px", top: "254px" }}>Weight</span>
                    <span className="ocr" style={{ left: "196px", top: "269px" }}>41,800 LB · 24 PLT</span>
                    <span className="pa pp-l" style={{ left: "400px", top: "254px" }}>Miles</span>
                    <span className="pa pp-v" style={{ left: "400px", top: "271px" }}>319</span>
                    <span className="pa pp-rule" style={{ top: "306px", background: "#1D2433" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "318px" }}>Line haul</span>
                    <span className="ocr" style={{ left: "396px", top: "314px", fontFamily: "var(--mono)" }}>{tx(MD.rc?.lh)}</span>
                    <span className="pa pp-l" style={{ left: "32px", top: "346px" }}>Fuel surcharge</span>
                    <span className="ocr" style={{ left: "396px", top: "342px", fontFamily: "var(--mono)" }}>{tx(MD.rc?.fs)}</span>
                    <span className="pa pp-rule" style={{ top: "372px" }}></span>
                    <span className="pa pp-v" style={{ left: "32px", top: "382px" }}>Total</span>
                    <span className="pa pp-v" style={{ left: "400px", top: "382px", fontFamily: "var(--mono)" }}>{tx(MD.rc?.tot)}</span>
                    <svg className="pa pp-scrib" style={{ left: "40px", top: "440px" }} viewBox="0 0 160 40" aria-hidden="true">
                      <path d="M4 30 C 20 4, 30 36, 44 18 S 66 8, 72 26 S 96 34, 104 14 S 130 20, 156 10" />
                    </svg>
                    <span className="pa pp-rule" style={{ top: "486px", background: "#1D2433" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "492px" }}>Authorized by the shipper</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "492px" }}>Page 1 of 2</span>
                  </div>
                ) : null}
                {MD.isPod ? (
                  <div className="paper" role="img" aria-label="Signed proof of delivery, sample">
                    <span className="pa pp-t" style={{ left: "32px", top: "24px" }}>DELIVERY RECEIPT</span>
                    <span className="pa pp-s" style={{ left: "32px", top: "48px" }}>Proof of delivery — retain with bill of lading</span>
                    <span className="pa pp-box" style={{ left: "440px", top: "28px" }}>SAMPLE</span>
                    <span className="pa pp-rule" style={{ top: "70px", height: "2px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "84px" }}>Consignee</span>
                    <span className="ocr" style={{ left: "28px", top: "99px" }}>Builders FirstSource · El Paso, TX</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "84px" }}>Carrier</span>
                    <span className="pa pp-v" style={{ left: "330px", top: "101px" }}>Lone Star Freight</span>
                    <span className="pa pp-rule" style={{ top: "132px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "142px" }}>BOL #</span>
                    <span className="ocr" style={{ left: "28px", top: "157px" }}>55031</span>
                    <span className="pa pp-l" style={{ left: "180px", top: "142px" }}>Load #</span>
                    <span className="ocr" style={{ left: "176px", top: "157px" }}>FF-24775</span>
                    <span className="pa pp-l" style={{ left: "330px", top: "142px" }}>PO</span>
                    <span className="ocr" style={{ left: "326px", top: "157px" }}>88120</span>
                    <span className="pa pp-l" style={{ left: "32px", top: "198px" }}>Qty</span>
                    <span className="pa pp-l" style={{ left: "120px", top: "198px" }}>Description</span>
                    <span className="pa pp-l" style={{ left: "430px", top: "198px" }}>Weight</span>
                    <span className="pa pp-rule" style={{ top: "216px", background: "#1D2433" }}></span>
                    <span className="ocr" style={{ left: "28px", top: "223px" }}>24 PLT</span>
                    <span className="pa pp-v" style={{ left: "120px", top: "225px" }}>Roofing shingles, palletized</span>
                    <span className="pa pp-v" style={{ left: "430px", top: "225px" }}>44,200 lb</span>
                    <span className="pa pp-rule" style={{ top: "262px" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "272px" }}>Time in</span>
                    <span className="ocr hand" style={{ left: "28px", top: "287px" }}>06:40</span>
                    <span className="pa pp-l" style={{ left: "150px", top: "272px" }}>Time out</span>
                    <span className="ocr hand" style={{ left: "146px", top: "287px" }}>09:10</span>
                    <span className="pa pp-stamp" style={{ left: "356px", top: "286px" }}>
                      RECEIVED
                      <br />
                      <span>NOV 11 2026</span>
                    </span>
                    <span className="pa pp-l" style={{ left: "32px", top: "344px" }}>Received in good order except as noted:</span>
                    <span className="pa pp-rule" style={{ top: "394px", background: "#9AA3B2" }}></span>
                    <svg className="pa pp-scrib" style={{ left: "40px", top: "420px" }} viewBox="0 0 160 40" aria-hidden="true">
                      <path d="M4 26 C 18 8, 28 32, 42 16 S 64 10, 70 24 S 92 30, 102 12 S 128 18, 156 12" />
                    </svg>
                    <span className="ocr hand lo sel" style={{ left: "246px", top: "432px" }}>M. Ortiz</span>
                    <span className="ocr hand" style={{ left: "400px", top: "432px" }}>11/11 10:42</span>
                    <span className="pa pp-rule" style={{ top: "468px", background: "#1D2433" }}></span>
                    <span className="pa pp-l" style={{ left: "32px", top: "474px" }}>Receiver signature</span>
                    <span className="pa pp-l" style={{ left: "250px", top: "474px" }}>Printed name</span>
                    <span className="pa pp-l" style={{ left: "404px", top: "474px" }}>Date / time</span>
                  </div>
                ) : null}
                {MD.isInsp ? (
                  <div className="paper" role="img" aria-label="Photo of a roadside inspection report, sample">
                    <span className="pa pp-t" style={{ left: "28px", top: "20px", fontSize: "15px", lineHeight: "18px" }}>DRIVER / VEHICLE EXAMINATION REPORT</span>
                    <span className="pa pp-s" style={{ left: "28px", top: "42px" }}>Roadside inspection · North American Standard · page 1 of 2</span>
                    <span className="pa pp-box" style={{ left: "456px", top: "22px" }}>SAMPLE</span>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "62px", height: "2px", background: "#1D2433" }}></span>
                    <span className="pa pp-l" style={{ left: "28px", top: "70px" }}>Report no.</span>
                    <span className="ocr" style={{ left: "24px", top: "85px" }}>TX-26-0417</span>
                    <span className="pa pp-l" style={{ left: "158px", top: "70px" }}>Date</span>
                    <span className="ocr" style={{ left: "154px", top: "85px" }}>11/12/2026</span>
                    <span className="pa pp-l" style={{ left: "270px", top: "70px" }}>Time</span>
                    <span className="ocr" style={{ left: "266px", top: "85px" }}>14:20 – 15:05</span>
                    <span className="pa pp-l" style={{ left: "410px", top: "70px" }}>Level</span>
                    <span className="ocr" style={{ left: "406px", top: "85px" }}>I</span>
                    <span className="pa pp-l" style={{ left: "28px", top: "112px" }}>Location</span>
                    <span className="ocr" style={{ left: "24px", top: "127px" }}>I-35E NB WEIGH STA · HILLSBORO TX</span>
                    <span className="pa pp-l" style={{ left: "410px", top: "112px" }}>Highway</span>
                    <span className="pa pp-v" style={{ left: "410px", top: "129px" }}>IH-35E</span>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "154px" }}></span>
                    <span className="pa pp-l" style={{ left: "28px", top: "162px" }}>Driver</span>
                    <span className="ocr" style={{ left: "24px", top: "177px" }}>CARTER, JAMAL</span>
                    <span className="pa pp-l" style={{ left: "190px", top: "162px" }}>License</span>
                    <span className="pa pp-v" style={{ left: "190px", top: "179px" }}>TX · CLASS A</span>
                    <span className="pa pp-l" style={{ left: "310px", top: "162px" }}>Carrier</span>
                    <span className="pa pp-v" style={{ left: "310px", top: "179px" }}>LONE STAR FREIGHT LLC</span>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "204px" }}></span>
                    <span className="pa pp-th" style={{ left: "28px", top: "212px" }}>Unit</span>
                    <span className="pa pp-th" style={{ left: "68px", top: "212px" }}>Type</span>
                    <span className="pa pp-th" style={{ left: "112px", top: "212px" }}>Make</span>
                    <span className="pa pp-th" style={{ left: "172px", top: "212px" }}>Unit no.</span>
                    <span className="pa pp-th" style={{ left: "246px", top: "212px" }}>Plate</span>
                    <span className="pa pp-th" style={{ left: "340px", top: "212px" }}>VIN</span>
                    <span className="pa pp-th" style={{ left: "470px", top: "212px" }}>OOS</span>
                    <span className="pa pp-c" style={{ left: "30px", top: "230px" }}>1</span>
                    <span className="pa pp-c" style={{ left: "68px", top: "230px" }}>TT</span>
                    <span className="pa pp-c" style={{ left: "112px", top: "230px" }}>KW</span>
                    <span className="ocr" style={{ left: "168px", top: "227px" }}>1121</span>
                    <span className="pa pp-c" style={{ left: "246px", top: "230px" }}>TX R9C 1205</span>
                    <span className="pa pp-c" style={{ left: "340px", top: "230px" }}>…PE447741</span>
                    <span className="pa pp-c" style={{ left: "474px", top: "230px" }}>N</span>
                    <span className="pa pp-c" style={{ left: "30px", top: "254px" }}>2</span>
                    <span className="pa pp-c" style={{ left: "68px", top: "254px" }}>ST</span>
                    <span className="pa pp-c" style={{ left: "112px", top: "254px" }}>UTIL</span>
                    <span className="ocr" style={{ left: "168px", top: "251px" }}>5301</span>
                    <span className="pa pp-c" style={{ left: "246px", top: "254px" }}>TX 1XJ 5301</span>
                    <span className="pa pp-c" style={{ left: "340px", top: "254px" }}>…NU306188</span>
                    <span className="pa pp-c" style={{ left: "474px", top: "254px", fontWeight: "700" }}>Y</span>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "278px" }}></span>
                    <span className="pa pp-th" style={{ left: "28px", top: "286px" }}>Violation</span>
                    <span className="pa pp-th" style={{ left: "140px", top: "286px" }}>Unit</span>
                    <span className="pa pp-th" style={{ left: "178px", top: "286px" }}>OOS</span>
                    <span className="pa pp-th" style={{ left: "218px", top: "286px" }}>Description</span>
                    <span className="ocr code" style={{ left: "24px", top: "302px" }}>393.47(e)</span>
                    <span className="pa pp-c" style={{ left: "144px", top: "305px" }}>1</span>
                    <span className="pa pp-c" style={{ left: "182px", top: "305px" }}>N</span>
                    <span className="pa pp-c" style={{ left: "218px", top: "305px" }}>Clamp type brake out of adjustment · axle 3 R</span>
                    <span className="ocr code lo sel" style={{ left: "24px", top: "328px" }}>393.9(a)</span>
                    <span className="pa pp-c" style={{ left: "144px", top: "331px" }}>2</span>
                    <span className="pa pp-c" style={{ left: "182px", top: "331px" }}>N</span>
                    <span className="pa pp-c" style={{ left: "218px", top: "331px" }}>Inoperable required lamp · clearance R</span>
                    <span className="ocr code" style={{ left: "24px", top: "354px" }}>393.75(a)(3)</span>
                    <span className="pa pp-c" style={{ left: "144px", top: "357px" }}>2</span>
                    <span className="pa pp-c" style={{ left: "182px", top: "357px", fontWeight: "700" }}>Y</span>
                    <span className="pa pp-c" style={{ left: "218px", top: "357px" }}>Tire flat / audible air leak · axle 5 R outer</span>
                    <span className="pa pp-oos" style={{ left: "356px", top: "384px" }}>
                      OUT OF SERVICE
                      <span>UNIT 2 · 11/12 15:05</span>
                    </span>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "430px" }}></span>
                    <span className="pa pp-l" style={{ left: "28px", top: "438px" }}>Inspector signature · badge</span>
                    <span className="pa pp-l" style={{ left: "300px", top: "438px" }}>Driver signature</span>
                    <svg className="pa pp-scrib" style={{ left: "30px", top: "450px", width: "130px", height: "32px" }} viewBox="0 0 160 40" aria-hidden="true">
                      <path d="M4 28 C 16 6, 26 34, 40 16 S 62 10, 70 26 S 92 32, 102 14 S 128 18, 156 12" />
                    </svg>
                    <span className="pa pp-c" style={{ left: "176px", top: "462px" }}>#1187</span>
                    <svg className="pa pp-scrib" style={{ left: "300px", top: "450px", width: "130px", height: "32px" }} viewBox="0 0 160 40" aria-hidden="true">
                      <path d="M4 22 C 14 6, 22 26, 32 14 S 48 8, 56 20 S 74 26, 82 12 S 96 14, 100 8" />
                    </svg>
                    <span className="pa pp-rule" style={{ left: "28px", right: "28px", top: "494px", background: "#1D2433" }}></span>
                    <span className="pa pp-cert" style={{ left: "24px", top: "502px", width: "492px", height: "46px" }}></span>
                    <span className="pa pp-th" style={{ left: "34px", top: "508px" }}>Carrier certification · violations corrected (49 CFR 396.9)</span>
                    <span className="pa pp-l" style={{ left: "34px", top: "526px" }}>Signature ______________________ Title ______________ Date __________</span>
                  </div>
                ) : null}
                {MD.isRcpt ? (
                  <div className="rcpt" role="img" aria-label="Photo of a fuel receipt, sample">
                    <div className="rc" style={{ fontWeight: "700", fontSize: "13px" }}><span className="ocr lo sel">TRAVEL CENTER #432</span></div>
                    <div className="rc">{"I-35 FRONTAGE RD"}</div>
                    <div className="rc">{"WACO, TX"}</div>
                    <div className="rh"></div>
                    <div className="rl">
                      <span className="ocr">11/12/26 08:02</span>
                      <span>{"PUMP 07"}</span>
                    </div>
                    <div className="rl">
                      <span>{"TRAN"}</span>
                      <span>{"0048213"}</span>
                    </div>
                    <div className="rh"></div>
                    <div className="rl">
                      <span className="ocr">DIESEL #2</span>
                      <span></span>
                    </div>
                    <div className="rl">
                      <span>{"GALLONS"}</span>
                      <span className="ocr">88.214</span>
                    </div>
                    <div className="rl">
                      <span>{"PRICE/GAL"}</span>
                      <span className="ocr">$3.849</span>
                    </div>
                    <div className="rh"></div>
                    <div className="rl" style={{ fontWeight: "700" }}>
                      <span>{"FUEL TOTAL"}</span>
                      <span className="ocr">$339.53</span>
                    </div>
                    <div className="rl">
                      <span className="ocr">CASH</span>
                      <span>{"$340.00"}</span>
                    </div>
                    <div className="rl">
                      <span>{"CHANGE"}</span>
                      <span>{"$0.47"}</span>
                    </div>
                    <div className="rh"></div>
                    <div className="rc">{"THANK YOU · DRIVE SAFE"}</div>
                    <div className="rc" style={{ marginTop: "14px", letterSpacing: ".24em", color: "#7A818C" }}>{"SAMPLE"}</div>
                  </div>
                ) : null}
              </div>
            </div>
            <aside className="fpanel">
              <div className="r g8" style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd2)" }}>
                <span className="h2">What we read</span>
                <span className="sp"></span>
                <span className="fs12 mu">{tx(MD.readMeta)}</span>
              </div>
              <div className="c g10" style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "12px 16px 16px" }}>
                <div className="banner" data-k={MD.banner?.k}>
                  <Icon className="s14 b" d={MD.bannerIc} />
                  <div>
                    <b>{tx(MD.banner?.t)}</b>
                    {" "}{tx(MD.banner?.d)}
                  </div>
                </div>
                {MD.hasInsp ? (
                  <>
                    <div className="ires">
                      <div className="r g6 wrap">
                        <span className="h3 f1">Result</span>
                        <span className="badge" data-k="bad">
                          <i></i>
                          Vehicle out of service
                        </span>
                        <span className="badge" data-k="ok">
                          <i></i>
                          Driver clean
                        </span>
                      </div>
                      <div className="ig">
                        {MD.isum?.map((x, i) => (
                          <div key={i}>
                            <span className="fs11 t3"><span>{x.k}</span></span>
                            <span className="fs13 w6 tx"><span>{x.v}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="r g8" style={{ marginTop: "2px" }}>
                      <span className="h3">Violations</span>
                      <span className="cnt" data-k="bad">{tx(MD.violN)}</span>
                      <span className="sp"></span>
                      <span className="fs12 mu">Codes read from page 1</span>
                    </div>
                    {MD.viol?.map((v, i) => (
                      <div key={i} className={clsx("vcard", v.cls)}>
                        <div className="r g6">
                          <span className="mono fs12 w6 tx"><span>{v.code}</span></span>
                          <span className="tag" data-k="mu">Unit{" "}<span>{v.unit}</span>{" "}·{" "}<span>{v.uid}</span></span>
                          <span className="sp"></span>
                          {v.oos ? (
                            <span className="tag" data-k="bad">Out of service</span>
                          ) : null}
                        </div>
                        <div className="fs13 w5 tx"><span>{v.t}</span></div>
                        <div className="r g6 wrap fs12 t3">
                          <span><span>{v.basic}</span></span>
                          <span aria-hidden="true">·</span>
                          <span><span>{v.pts}</span></span>
                          <span aria-hidden="true">·</span>
                          <span className="tc w5" data-k={v.ck}><span>{v.conf}</span></span>
                        </div>
                        {v.link ? (
                          <div className="r g6 ast fs12 t2">
                            <Icon className="s12" d={v.lic} style={{ marginTop: "2px" }} />
                            <span><span>{v.link}</span></span>
                          </div>
                        ) : null}
                        {v.note ? (
                          <p className="fs12 t3"><span>{v.note}</span></p>
                        ) : null}
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
                  {MD.fields?.map((f, i) => (
                    <div key={i} className={clsx("ofld", f.cls, f.half)}>
                      <div className="r g6">
                        <span className="fs12 w5 t2 f1"><span>{f.l}</span></span>
                        <span className="risk" data-k={f.k}>
                          <Icon className="s12 b" d={f.ic} />
                          <span>{f.st}</span>
                        </span>
                      </div>
                      {f.noDd ? (
                        <input className={clsx("inp", f.mono)} defaultValue={f.v} placeholder={f.ph} aria-label={f.l} style={{ height: "32px" }} />
                      ) : null}
                      {f.isDd ? (
                        <>
                          <Combobox f={f} />
                          {f.showOther ? (
                            <>
                              <label className="othl" htmlFor={f.oid}>{tx(f.otherL)}</label>
                              <input id={f.oid} className="inp othr" defaultValue={f.ov} placeholder={f.otherPh} onInput={f.setOther} />
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {f.hasConf ? (
                        <div className="r g8">
                          <span className="bar" data-k={f.k} style={{ height: "4px" }}><span style={{ width: f.pct }}></span></span>
                          <span className="fs11 mu num nw"><span>{f.conf}</span>{" "}confidence</span>
                        </div>
                      ) : null}
                      {f.note ? (
                        <p className="fs12 t3"><span>{f.note}</span></p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {MD.finHidden ? (
                  <p className="note">
                    <Icon className="s14" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
                    <span>Rates on this document are hidden for your role. Accounting completes them.</span>
                  </p>
                ) : null}
                {MD.hasLines ? (
                  <div className="card oh" style={{ boxShadow: "none" }}>
                    <div className="ch" style={{ minHeight: "38px" }}>
                      <h3 className="h3">Charges</h3>
                      <span className="sp"></span>
                      <span className="tag" data-k="mu">Draft</span>
                    </div>
                    {MD.lines?.map((ln, i) => (
                      <div key={i} className="r jb fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                        <span className="t3"><span>{ln.k}</span></span>
                        <span className="mono num"><span>{ln.v}</span></span>
                      </div>
                    ))}
                    <div className="r jb fs13 w6" style={{ padding: "10px 12px", background: "var(--sf2)" }}>
                      <span>
                        Total
                        {" "}
                        <span className="fs12 mu" style={{ fontWeight: "400" }}>·{" "}{tx(MD.terms)}</span>
                      </span>
                      <span className="mono num">{tx(MD.total)}</span>
                    </div>
                  </div>
                ) : null}
                {MD.hasAfter ? (
                  <div className="card" style={{ boxShadow: "none", padding: "12px 14px" }}>
                    <div className="fs13 w6" style={{ marginBottom: "8px" }}>{tx(MD.after?.t)}</div>
                    <div className="c g8">
                      {MD.after?.items?.map((it, i) => (
                        <div key={i} className="r g8 ast fs12 t2">
                          <span className="dot" data-k={it.k} style={{ marginTop: "5px" }}></span>
                          <span><span>{it.t}</span></span>
                        </div>
                      ))}
                    </div>
                    {MD.after?.d ? (
                      <p className="fs12 mu" style={{ marginTop: "8px" }}>{tx(MD.after?.d)}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
        {MD.isManual ? (
          <div className="mbody">
            {MD.groups?.map((g, i) => (
              <Fragment key={i}>
                <div className="over" style={{ marginBottom: "10px" }}><span>{g.l}</span></div>
                <div className="mgrid">
                  {g.fields.map((f, i2) => (
                    <div key={i2} className="fld" style={{ gridColumn: `span ${f.span}` }}>
                      {f.isInput ? (
                        <>
                          <label htmlFor={f.id}><span>{f.l}</span></label>
                          <input id={f.id} className={clsx("inp", f.mono)} defaultValue={f.v} placeholder={f.ph} />
                        </>
                      ) : null}
                      {f.isDd ? (
                        <>
                          <span className="lbl"><span>{f.l}</span></span>
                          <Combobox f={f} />
                          {f.showOther ? (
                            <>
                              <label className="othl" htmlFor={f.oid}>{tx(f.otherL)}</label>
                              <input id={f.oid} className="inp othr" defaultValue={f.ov} placeholder={f.otherPh} onInput={f.setOther} />
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {f.isSeg ? (
                        <>
                          <span className="lbl"><span>{f.l}</span></span>
                          <div className="seg" role="group" aria-label={f.l} style={{ alignSelf: "flex-start" }}>
                            {f.opts?.map((o, i3) => (
                              <button key={i3} className={o.on} aria-pressed={o.p}><span>{o.l}</span></button>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {f.hint ? (
                        <span className="hint"><span>{f.hint}</span></span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Fragment>
            ))}
            {MD.hasLines ? (
              <>
                <div className="over" style={{ marginBottom: "10px" }}>Charges</div>
                <div className="card oh" style={{ boxShadow: "none", marginBottom: "16px" }}>
                  {MD.lines?.map((ln, i) => (
                    <div key={i} className="r g12 fs13" style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd2)" }}>
                      <span className="f1 t2"><span>{ln.k}</span></span>
                      <input className="inp mono" defaultValue={ln.v} aria-label={ln.k} style={{ width: "140px", height: "30px", textAlign: "right" }} />
                    </div>
                  ))}
                  <div className="r g12 fs13" style={{ padding: "8px 12px" }}>
                    <button className="lnk"><span>+ Add a charge</span></button>
                    <span className="sp"></span>
                    <span className="w6">Total</span>
                    <span className="mono num w6">{tx(MD.total)}</span>
                  </div>
                </div>
              </>
            ) : null}
            {MD.toggle ? (
              <label className="r g8 fs13">
                <input type="checkbox" className="cbx" defaultChecked />
                <span>{MD.toggle}</span>
              </label>
            ) : null}
          </div>
        ) : null}
        {MD.isUpload ? (
          <div className="mbody c g14">
            <div className="drop big">
              <span className="cic"><Icon className="s20" d={I.sheet} /></span>
              <span className="fs15 w6 tx">Drop a spreadsheet here</span>
              <span className="fs12 mu">CSV or Excel (.xlsx, .xls) · from Google Sheets use File › Download › CSV · up to 2,000 rows</span>
              <button className="btn sm pri" style={{ marginTop: "6px" }} onClick={MD.pick}>
                <Icon className="s14" d={I.upload} />
                Choose a file
              </button>
            </div>
            <div className="r g12" style={{ padding: "12px 14px", border: "1px solid var(--bd)", borderRadius: "10px" }}>
              <span className="xls">CSV</span>
              <div className="f1">
                <div className="fs13 w5">Start from our template</div>
                <div className="fs12 mu">{tx(MD.tmplD)}</div>
              </div>
              <button className="btn sm">
                <Icon className="s14" d={I.download} />
                CSV
              </button>
              <button className="btn sm">
                <Icon className="s14" d={I.download} />
                Excel
              </button>
            </div>
            <p className="note">
              <Icon className="s14" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />
              <span>{tx(MD.upNote)}</span>
            </p>
          </div>
        ) : null}
        {MD.isMap ? (
          <div className="mbody c g12">
            <div className="filechip">
              <span className="xls">{tx(MD.fileExt)}</span>
              <div className="f1">
                <div className="fs13 w5 mono">{tx(MD.file)}</div>
                <div className="fs12 mu">{tx(MD.fileMeta)}</div>
              </div>
              <button className="btn sm ghost" onClick={MD.back}>Change file</button>
            </div>
            <div className="banner" data-k="ok">
              <Icon className="s14 b" d="M5 12l5 5 9-10" />
              <div>
                <b>{tx(MD.mapT)}</b>
                {" "}{tx(MD.mapD)}
              </div>
            </div>
            <div className="card oh" style={{ boxShadow: "none" }}>
              <div className="thead" style={{ gridTemplateColumns: MD.mcols }}>
                <span>Column in your file</span>
                <span>Example</span>
                <span></span>
                <span>FlyFleet field</span>
                <span>Status</span>
              </div>
              {MD.cols?.map((r, i) => (
                <div key={i} className="trow" style={{ gridTemplateColumns: MD.mcols, cursor: "default" }}>
                  <span className="mono fs12 w5 ell"><span>{r.col}</span></span>
                  <span className="fs12 t3 ell"><span>{r.sample}</span></span>
                  <Icon className="s14 mu" d="M5 12h14M13 6l6 6-6 6" />
                  <button className={clsx("selb", r.scls)} aria-label={r.aria}>
                    <span className="f1 ell"><span>{r.field}</span></span>
                    <Icon className="s12 mu" d="M6 9l6 6 6-6" />
                  </button>
                  <span className="risk" data-k={r.k}>
                    <Icon className="s12 b" d={r.ic} />
                    <span className="ell"><span>{r.st}</span></span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {MD.isCheck ? (
          <div className="mbody c g12">
            <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", boxShadow: "none" }}>
              {MD.sum?.map((k, i) => (
                <div key={i} className="kpi">
                  <span className="kl">
                    <span className="dot" data-k={k.k}></span>
                    <span>{k.l}</span>
                  </span>
                  <span className="kv2" style={{ fontSize: "22px", lineHeight: "28px" }}><span>{k.v}</span></span>
                  <span className="fs12 mu"><span>{k.s}</span></span>
                </div>
              ))}
            </div>
            <div className="card oh" style={{ boxShadow: "none" }}>
              <div className="ch" style={{ minHeight: "40px" }}>
                <h3 className="h3">Rows to look at</h3>
                <span className="cnt" data-k="warn">{tx(MD.issN)}</span>
                <span className="sp"></span>
                <span className="fs12 mu">Everything else is ready</span>
              </div>
              {MD.iss?.map((r, i) => (
                <div key={i} className="wl" style={{ alignItems: "flex-start" }}>
                  <span className="mono fs12 mu" style={{ width: "48px", flex: "none", paddingTop: "1px" }}>Row{" "}<span>{r.row}</span></span>
                  <div className="f1">
                    <div className="fs13 w5"><span>{r.name}</span></div>
                    <div className="r g6 ast fs12 tc" data-k={r.k} style={{ marginTop: "3px" }}>
                      <Icon className="s12 b" d={r.ic} style={{ marginTop: "2px" }} />
                      <span><span>{r.issue}</span></span>
                    </div>
                  </div>
                  {r.hasOpts ? (
                    <div className="seg sm" role="group" aria-label={r.aria}>
                      {r.opts.map((o, i2) => (
                        <button key={i2} className={o.on} aria-pressed={o.p}><span>{o.l}</span></button>
                      ))}
                    </div>
                  ) : null}
                  {r.fix ? (
                    <span className="tag" data-k="bad"><span>{r.fix}</span></span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="c g8">
              {MD.opts?.map((o, i) => (
                <label key={i} className="r g8 fs13">
                  <input type="checkbox" className="cbx" defaultChecked />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {MD.isDone ? (
          <div className="mbody">
            <div className="c g10" style={{ alignItems: "center", textAlign: "center", padding: "16px 0 8px" }}>
              <span className="donei"><Icon className="s24 b" d="M5 12l5 5 9-10" /></span>
              <h3 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: "600" }}>{tx(MD.doneT)}</h3>
              <p className="fs13 mu" style={{ maxWidth: "460px" }}>{tx(MD.doneD)}</p>
            </div>
            <div className="card oh" style={{ boxShadow: "none", marginTop: "12px" }}>
              {MD.doneRows?.map((r, i) => (
                <div key={i} className="wl">
                  <span className="dot" data-k={r.k}></span>
                  <span className="f1 fs13"><span>{r.t}</span></span>
                  <span className="mono fs13 w6"><span>{r.n}</span></span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mfoot">
          {MD.left.map((b, i) => (
            <button key={i} className={clsx("btn", b.cls)} onClick={b.go}><span>{b.l}</span></button>
          ))}
          <span className="sp"></span>
          {MD.note ? (
            <span className="fs12 mu"><span>{MD.note}</span></span>
          ) : null}
          {MD.right.map((b, i) => (
            <button key={i} className={clsx("btn", b.cls)} onClick={b.go}><span>{b.l}</span></button>
          ))}
        </div>
      </div>
    </>
  );
}
