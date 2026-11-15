"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";

/** Sign in, then choose an organization. */
export function SignIn() {
  const { isSignin, AU } = useConsole();
  if (!isSignin) return null;
  return (
    <div className="auth">
      <div className="authl">
        <div className="r g10">
          <span className="mark" style={{ width: "34px", height: "34px", borderRadius: "9px" }}><Icon className="s18" d="M4 6l6 6-6 6M13 6l6 6-6 6" /></span>
          <span style={{ fontSize: "20px", fontWeight: "600", color: "#fff", letterSpacing: "-0.01em" }}>FlyFleet</span>
        </div>
        <svg className="authart" viewBox="0 0 560 420" aria-hidden="true">
          <path d="M-20 360 C 80 330, 140 250, 230 240 S 380 200, 420 120 S 520 40, 600 30" />
          <path d="M-20 250 C 60 260, 150 300, 260 290 S 430 330, 600 300" />
          <path d="M120 440 C 150 340, 190 260, 230 240 S 300 120, 330 -20" />
          <path className="hl" d="M40 345 C 120 318, 160 252, 230 240 S 360 205, 404 140" />
          <circle cx="40" cy="345" r="6" />
          <circle cx="404" cy="140" r="6" className="hlc" />
          <circle cx="230" cy="240" r="4" />
        </svg>
        <div className="c g12" style={{ marginTop: "auto" }}>
          <h1 style={{ fontSize: "34px", lineHeight: "40px", fontWeight: "600", letterSpacing: "-0.03em", color: "#fff", maxWidth: "440px" }}>
            One console for the whole carrier.
          </h1>
          <p style={{ fontSize: "15px", lineHeight: "23px", color: "#AEB7C6", maxWidth: "430px" }}>
            Dispatch, live fleet, compliance, documents and billing — scoped to your role, isolated per company.
          </p>
        </div>
        <div className="r g16 fs12" style={{ color: "#8390A6", marginTop: "28px" }}>
          <span>flyfleet.io</span>
          <span>Status</span>
          <span>Privacy</span>
          <span>Security</span>
        </div>
      </div>
      <div className="authr">
        {AU.form ? (
          <div className="authcard">
            <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em" }}>Sign in</h2>
            <p className="fs13 mu" style={{ marginTop: "4px" }}>Use your work email. Admins confirm with a second factor.</p>
            <div className="c g12" style={{ marginTop: "20px" }}>
              <div className="fld">
                <label htmlFor="au-e">Work email</label>
                <input id="au-e" className="inp" type="email" defaultValue="dana.kim@lonestarfreight.com" style={{ height: "40px" }} />
              </div>
              <div className="fld">
                <div className="r jb">
                  <label htmlFor="au-p" className="lbl">Password</label>
                  <button className="lnk">Forgot password?</button>
                </div>
                <input id="au-p" className="inp" type="password" defaultValue="correct-horse" style={{ height: "40px" }} />
              </div>
              <button className="btn pri lg" style={{ width: "100%" }} onClick={AU.next}>Continue</button>
              <div className="r g10 fs12 mu">
                <span className="hr f1"></span>
                or
                <span className="hr f1"></span>
              </div>
              <button className="btn lg" style={{ width: "100%" }}>
                <Icon className="s14" d="M15 7a2 2 0 0 1 2 2M21 9a6 6 0 0 1-7.7 5.8L11 17H9v2H7v2H3v-3.6l6.2-6.2A6 6 0 1 1 21 9z" />
                Continue with single sign-on
              </button>
            </div>
            <p className="note" style={{ marginTop: "18px" }}>
              <Icon className="s14" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
              Sessions use secure cookies. Tokens never reach the browser.
            </p>
          </div>
        ) : null}
        {AU.org ? (
          <div className="authcard" style={{ width: "460px" }}>
            <div className="r g8">
              <span className="badge" data-k="ok">
                <Icon className="s12 b" d="M5 12l5 5 9-10" />
                Verified with MFA
              </span>
            </div>
            <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.015em", marginTop: "12px" }}>Choose an organization</h2>
            <p className="fs13 mu" style={{ marginTop: "4px" }}>Signed in as dana.kim@lonestarfreight.com. Each company’s data stays separate.</p>
            <div className="c g8" style={{ marginTop: "18px" }}>
              {AU.orgs.map((o, i) => (
                <div key={i} className={clsx("orgc", o.cls)}>
                  <span className="orgmk" style={{ background: o.c, width: "36px", height: "36px", borderRadius: "8px", fontSize: "13px" }}><span>{o.ini}</span></span>
                  <div className="f1">
                    <div className="r g6">
                      <span className="fs14 w6"><span>{o.n}</span></span>
                      {o.inv ? (
                        <span className="tag" data-k="warn">Invitation</span>
                      ) : null}
                    </div>
                    <div className="fs12 mu"><span>{o.d}</span></div>
                  </div>
                  {o.acts.map((a, i2) => (
                    <button key={i2} className={clsx("btn sm", a.cls)} onClick={a.go}><span>{a.l}</span></button>
                  ))}
                </div>
              ))}
            </div>
            <div className="r g8 fs12 mu" style={{ marginTop: "18px" }}>
              <span className="f1">Not you?</span>
              <button className="lnk" onClick={AU.back}>Use a different account</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
