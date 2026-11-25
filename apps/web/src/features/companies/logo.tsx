"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { checkPhoto, PHOTO_TYPES } from "@/features/account/photo";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { CompanyMark } from "@/features/shell/company-mark";
import { errorMessage, toApiError } from "@/lib/api/errors";
import { COMPANIES_KEY } from "./use-companies";

/**
 * Set a company's logo. `company` is the slug of the company it is for (the one in the address when left out),
 * so a company just created can be given its logo before anyone has opened it.
 */
export async function uploadLogo(file: File, company?: string): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/v1/organization/logo", { method: "PUT", body, credentials: "same-origin", headers: company ? { "X-Company": company } : undefined });
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
}

/** Choosing a logo file: the same rules as a profile photo (JPEG, PNG or WebP, up to 5 MB). */
export const checkLogo = checkPhoto;
export const LOGO_ACCEPT = PHOTO_TYPES.join(",");

/** Settings › Organization: the company's logo, shown instead of its coloured initials, with upload and remove. */
export function CompanyLogoCard() {
  const { me, org, can, notify } = useConsole();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const logo = me.organization.logo_url ?? null;
  const editable = can("organization.manage");

  const done = async (text: string) => {
    notify(text);
    await queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
    router.refresh();
  };

  async function upload(file: File) {
    const problem = checkLogo(file);
    if (problem) return notify(problem, true);
    setPending("upload");
    try {
      await uploadLogo(file);
      await done("Company logo updated");
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  async function remove() {
    setPending("remove");
    try {
      const response = await fetch("/api/v1/organization/logo", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
      await done("Company logo removed · its initials show again");
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }

  return (
    <section className="card" style={{ maxWidth: "860px", marginBottom: "16px" }} aria-labelledby={`${id}-h`}>
      <div className="cb r g14">
        <CompanyMark code={org.ini} color={org.c} logo={logo} size={56} />
        <div className="f1 c g6">
          <h2 id={`${id}-h`} className="fs13 w6">Company logo</h2>
          <span className="fs12 mu">{logo ? "Shown instead of the coloured initials wherever the company appears: the switcher, lists across companies, the Companies page." : "Optional. Without one, the company shows its initials on its colour. JPEG, PNG or WebP, up to 5 MB; it’s fitted into a square, never cropped."}</span>
          {editable ? (
            <div className="r g8">
              <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={pending !== null}>
                <Icon className="s14" d={I.upload} />
                {pending === "upload" ? "Uploading…" : logo ? "Change logo" : "Upload logo"}
              </button>
              {logo ? <button type="button" className="btn sm ghost" onClick={() => void remove()} disabled={pending !== null}>{pending === "remove" ? "Removing…" : "Remove logo"}</button> : null}
            </div>
          ) : null}
        </div>
        <input ref={input} type="file" accept={LOGO_ACCEPT} hidden aria-hidden="true" tabIndex={-1}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </div>
    </section>
  );
}
