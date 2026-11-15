import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <div className="ff" data-theme="light" data-density="compact">
      <div className="forb">
        <div className="c g8" style={{ alignItems: "center", maxWidth: "420px", textAlign: "center" }}>
          <span className="forbic">
            <Icon className="s20" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          </span>
          <h1 className="fs16 w6" style={{ marginTop: "6px" }}>
            This page doesn’t exist
          </h1>
          <p className="fs13 mu pre">The link may be old, or the record may belong to a company you are not signed in to.</p>
          <div className="r g8" style={{ marginTop: "8px" }}>
            <Link className="btn pri" href="/">
              Go to your workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
