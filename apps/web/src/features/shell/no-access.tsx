import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/**
 * A link into a company the person can't open: not a member, or it was archived and they aren't its Main Admin.
 * Says so plainly, without saying whether the company exists (that isn't theirs to know).
 */
export function NoAccess({ home }: { home: string }) {
  return (
    <div className="ff" data-theme="light" data-density="compact">
      <main className="forb">
        <div className="c g8" style={{ alignItems: "center", maxWidth: "440px", textAlign: "center" }}>
          <span className="forbic">
            <Icon className="s20" d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
          </span>
          <h1 className="fs16 w6" style={{ marginTop: "6px" }}>You don’t have access to this company</h1>
          <p className="fs13 mu pre">The link is for a company you aren’t a member of, or one that was archived. Ask one of its Main Admins to invite you; with their invitation code, choose Add a company › Join.</p>
          <div className="r g8" style={{ marginTop: "8px" }}>
            <Link className="btn pri" href={home}>Go to your company</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
