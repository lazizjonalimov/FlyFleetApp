import { Logo } from "@/components/layout/logo";

/** The surface around sign-in and sign-up: what FlyFleet is on the left, the form on the right. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="authl">
        <div className="r g10">
          <Logo height={52} tone="night" />
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
      <div className="authr">{children}</div>
    </div>
  );
}
