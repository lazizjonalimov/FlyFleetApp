"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useId, useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { Icon } from "@/components/ui/icon";
import { I } from "@/features/console/icons";
import { CompanyMark } from "@/features/shell/company-mark";
import { useSwitchCompany } from "@/features/shell/company-switch";
import { useDebounced } from "@/hooks/use-debounced";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { COMPANIES_KEY, useMyCompanies } from "./use-companies";

/** The company colours, with names for people who can't see them. The API accepts these eight. */
export const SWATCHES: [color: string, name: string][] = [
  ["#1F4FE0", "Flight blue"], ["#0E9F6E", "Green"], ["#D97706", "Amber"], ["#7C3AED", "Violet"],
  ["#DB2777", "Pink"], ["#0891B2", "Teal"], ["#DC2626", "Red"], ["#4D7C0F", "Olive"],
];
export const FLEET_SIZES = [["1-5", "1–5 trucks"], ["6-20", "6–20 trucks"], ["21-50", "21–50 trucks"], ["51+", "51+ trucks"]] as const;
export const STATES: [code: string, name: string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const SKIPPED = new Set(["the", "of", "and", "inc", "llc", "co"]);
/** The initials a new company's mark gets: the same rule the API uses (2 to 4 letters). */
export function initialsOf(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const initials = words.filter((w) => !SKIPPED.has(w.toLowerCase())).map((w) => w[0]).join("").slice(0, 4);
  const base = (initials.length >= 2 ? initials : words[0]?.slice(0, 3) ?? "CO").toUpperCase();
  return base.length < 2 ? (base + "X").slice(0, 2) : base;
}

/** Emails typed in a box, separated by commas, spaces or new lines. */
export function emailsIn(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const ok = (p: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p);
  return { valid: [...new Set(parts.filter(ok).map((p) => p.toLowerCase()))], invalid: parts.filter((p) => !ok(p)) };
}

type Step = "choose" | "details" | "review" | "join";
type Details = { name: string; mc: string; dot: string; state: string; fleet: string; color: string };
const USABLE = new Set(["authorized", "unchecked"]);

/** Add a company: create a new one, or join one with an invitation code. */
export function AddCompanyDialog({ onClose, start = "choose" }: { onClose: () => void; start?: "choose" | "join" }) {
  const id = useId();
  const companies = useMyCompanies();
  const switchTo = useSwitchCompany();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(start === "join" ? "join" : "choose");
  const [mode, setMode] = useState<"create" | "join">(start === "join" ? "join" : "create");
  const [form, setForm] = useState<Details>({ name: "", mc: "", dot: "", state: "", fleet: "", color: SWATCHES[0]![0] });
  const [invites, setInvites] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const full = companies.data ? companies.data.used >= companies.data.limit : false;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The MC number is checked once typing pauses: format, not already on FlyFleet, and what FMCSA says.
  const mcDigits = useDebounced(form.mc.replace(/\D/g, ""), 400);
  const mcCheck = useQuery({
    queryKey: ["me", "mc-check", mcDigits],
    queryFn: () => unwrap(api.POST("/api/v1/me/companies/mc-check", { body: { mc_number: mcDigits } })),
    enabled: mcDigits.length >= 5 && mcDigits.length <= 7,
    // always asked afresh: a number free a minute ago may have just been taken (by you, a moment ago)
    staleTime: 0,
    gcTime: 0,
  });
  const mcOk = !!mcCheck.data && USABLE.has(mcCheck.data.status) && mcCheck.data.mc_number === form.mc.replace(/\D/g, "");
  const detailsReady = form.name.trim().length >= 3 && mcOk && !!form.state && !!form.fleet && (!form.dot || /^\d{1,8}$/.test(form.dot.replace(/\D/g, "")));
  const people = emailsIn(invites);

  // An invitation code is looked up once all 8 characters are in.
  const typed = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const preview = useQuery({
    queryKey: ["me", "invite-code", typed],
    queryFn: () => unwrap(api.GET("/api/v1/me/invitations/code/{code}", { params: { path: { code: typed } } })),
    enabled: typed.length === 8,
    retry: false,
  });

  const set = (key: keyof Details) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });

  async function create() {
    setPending(true);
    setProblem(null);
    setErrors({});
    try {
      const made = await unwrap(api.POST("/api/v1/me/companies", {
        body: { name: form.name.trim(), mc_number: form.mc, dot_number: form.dot || null, home_state: form.state, fleet_size: form.fleet as "1-5", color: form.color, invite_emails: people.valid },
      }));
      await queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
      onClose();
      await switchTo(made.company, { toast: `${made.company.name} created · you are its Main Admin`, path: `/${made.company.slug}/dashboard` });
    } catch (error) {
      const fields = error instanceof ApiError ? error.fieldErrors : {};
      setErrors(fields);
      setProblem(errorMessage(error));
      if (fields.name || fields.mc_number || fields.home_state || fields.dot_number) setStep("details");
      setPending(false);
    }
  }

  async function join() {
    setPending(true);
    setProblem(null);
    try {
      const joined = await unwrap(api.POST("/api/v1/me/invitations/join", { body: { code: typed } }));
      await queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
      onClose();
      await switchTo(joined, { toast: `You joined ${joined.name} as ${joined.role_label}`, path: `/${joined.slug}/dashboard` });
    } catch (error) {
      setProblem(errorMessage(error));
      setPending(false);
    }
  }

  const steps = mode === "create" ? ["Choose", "Details", "Review"] : ["Choose", "Invitation code"];
  const at = step === "choose" ? 0 : step === "details" || step === "join" ? 1 : 2;
  const back = () => setStep(step === "review" ? "details" : "choose");

  const footer = (
    <>
      {step !== "choose" ? <button type="button" className="btn" onClick={back} disabled={pending}>Back</button> : null}
      <span className="sp"></span>
      <button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button>
      {step === "choose" ? (
        <button type="button" className="btn pri" disabled={full} onClick={() => setStep(mode === "create" ? "details" : "join")}>Continue</button>
      ) : step === "details" ? (
        <button type="button" className="btn pri" disabled={!detailsReady} onClick={() => setStep("review")}>Continue</button>
      ) : step === "review" ? (
        <button type="button" className="btn pri" disabled={pending || people.invalid.length > 0} onClick={() => void create()}>{pending ? "Creating…" : "Create company"}</button>
      ) : (
        <button type="button" className="btn pri" disabled={pending || !preview.data || preview.data.already_member} onClick={() => void join()}>{pending ? "Joining…" : "Join company"}</button>
      )}
    </>
  );

  const mcState = !form.mc ? null : form.mc.replace(/\D/g, "").length < 5 || form.mc.replace(/\D/g, "").length > 7
    ? { k: "mu", text: "An MC number is 5 to 7 digits" }
    : mcCheck.isFetching || mcDigits !== form.mc.replace(/\D/g, "") ? { k: "mu", text: "Checking…" }
    : mcCheck.data ? { k: mcCheck.data.status === "authorized" ? "ok" : USABLE.has(mcCheck.data.status) ? "warn" : "bad", text: mcCheck.data.message }
    : mcCheck.isError ? { k: "bad", text: errorMessage(mcCheck.error) } : null;

  return (
    <Dialog title="Add a company" sub={companies.data ? `${companies.data.used} of ${companies.data.limit} companies used` : "Create one, or join one you were invited to"} icon={I.building} width={600} onClose={onClose} footer={footer}>
      <ol className="r g16 fs12" aria-label="Steps">
        {steps.map((label, i) => (
          <li key={label} className={clsx("r g6", i === at ? "w6 tx" : "mu")} aria-current={i === at ? "step" : undefined}>
            <span className={clsx("stepn", i < at && "done", i === at && "on")} aria-hidden="true">{i < at ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Problem message={problem} />

      {step === "choose" ? (
        <>
          {full ? (
            <div className="banner" data-k="warn" role="status">
              <Icon className="s14" d={I.alert} />
              <div className="f1">{`You’re at the limit of ${companies.data!.limit} companies, active and archived together. Leave or archive one to add another.`}</div>
            </div>
          ) : null}
          <div className="c g8" role="radiogroup" aria-label="How to add a company">
            {([["create", I.plus, "Create a new company", "Set up a company you run. You become its Main Admin; it starts empty."],
               ["join", I.userplus, "Join a company with an invitation code", "Use the 8-character code from an invitation someone sent you."]] as const).map(([value, icon, title, text]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} className={clsx("hccard", mode === value && "on")} onClick={() => setMode(value)}>
                <span className="paic"><Icon className="s14" d={icon} /></span>
                <span className="c g2"><span className="fs13 w6">{title}</span><span className="fs12 mu">{text}</span></span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === "details" ? (
        <div className="c g12">
          <div className="r g12">
            <CompanyMark code={form.name.trim() ? initialsOf(form.name) : "?"} color={form.color} size={44} />
            <div className="c"><span className="fs13 w6">{form.name.trim() || "Your company"}</span><span className="fs12 mu">How the company’s mark will look</span></div>
          </div>
          <div className="fld">
            <label htmlFor={`${id}-name`}>Legal company name</label>
            <input id={`${id}-name`} className={clsx("inp", errors.name && "err")} value={form.name} onChange={set("name")} maxLength={160} autoFocus />
            {errors.name ? <span className="errt">{errors.name}</span> : form.name && form.name.trim().length < 3 ? <span className="errt">At least 3 characters</span> : null}
          </div>
          <div className="r g12">
            <div className="fld f1">
              <label htmlFor={`${id}-mc`}>MC number</label>
              <input id={`${id}-mc`} className={clsx("inp mono", mcState?.k === "bad" && "err")} inputMode="numeric" value={form.mc} onChange={set("mc")} placeholder="123456" maxLength={12} aria-describedby={`${id}-mcs`} />
              <span id={`${id}-mcs`} className={clsx("fs12", mcState?.k === "ok" ? "pwok" : mcState?.k === "bad" ? "errt" : "mu")} aria-live="polite">
                {mcState ? <>{mcState.k === "ok" ? <Icon className="s12" d={I.check} /> : null} {mcState.text}</> : "5 to 7 digits, checked with FMCSA"}
              </span>
            </div>
            <div className="fld f1">
              <label htmlFor={`${id}-dot`}>USDOT number <span className="mu">(optional)</span></label>
              <input id={`${id}-dot`} className={clsx("inp mono", errors.dot_number && "err")} inputMode="numeric" value={form.dot} onChange={set("dot")} maxLength={12} />
              {errors.dot_number ? <span className="errt">{errors.dot_number}</span> : null}
            </div>
          </div>
          <div className="r g12">
            <div className="fld f1">
              <label htmlFor={`${id}-state`}>Home state</label>
              <select id={`${id}-state`} className="inp" value={form.state} onChange={set("state")}>
                <option value="">Choose a state</option>
                {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
            <div className="fld f1">
              <label htmlFor={`${id}-fleet`}>Fleet size</label>
              <select id={`${id}-fleet`} className="inp" value={form.fleet} onChange={set("fleet")}>
                <option value="">Choose a size</option>
                {FLEET_SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="fld">
            <span className="lbl" id={`${id}-color`}>Company colour</span>
            <div className="r g8" role="radiogroup" aria-labelledby={`${id}-color`}>
              {SWATCHES.map(([color, name]) => (
                <button key={color} type="button" role="radio" aria-checked={form.color === color} aria-label={name} title={name}
                  className={clsx("swatch", form.color === color && "on")} style={{ background: color }} onClick={() => setForm({ ...form, color })}>
                  {form.color === color ? <Icon className="s14" d={I.check} /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="c g12">
          <div className="r g12">
            <CompanyMark code={initialsOf(form.name)} color={form.color} size={44} />
            <div className="c"><span className="fs14 w6">{form.name.trim()}</span><span className="fs12 mu">You’ll be its Main Admin</span></div>
          </div>
          <dl className="dl2">
            <dt>MC number</dt><dd className="mono">{`MC-${form.mc.replace(/\D/g, "")}`} <span className={clsx("fs12", mcCheck.data?.status === "authorized" ? "pwok" : "mu")}>· {mcCheck.data?.message}</span></dd>
            <dt>USDOT</dt><dd className="mono">{form.dot || "—"}</dd>
            <dt>Home state</dt><dd>{STATES.find(([c]) => c === form.state)?.[1]}</dd>
            <dt>Fleet size</dt><dd>{FLEET_SIZES.find(([v]) => v === form.fleet)?.[1]}</dd>
            <dt>Colour</dt><dd>{SWATCHES.find(([c]) => c === form.color)?.[1]}</dd>
          </dl>
          <div className="fld">
            <label htmlFor={`${id}-invites`}>Invite teammates <span className="mu">(optional)</span></label>
            <textarea id={`${id}-invites`} className={clsx("inp", people.invalid.length && "err")} rows={3} value={invites} onChange={(e) => setInvites(e.target.value)} placeholder="name@company.com, another@company.com" aria-describedby={`${id}-invh`} />
            <span id={`${id}-invh`} className={people.invalid.length ? "errt" : "fs12 mu"}>
              {people.invalid.length ? `Not an email address: ${people.invalid.join(", ")}` : people.valid.length ? `${people.valid.length} will be emailed an invitation as Read-only; change their roles later under Team & access.` : "They’re emailed an invitation link and a code, valid for 7 days."}
            </span>
          </div>
          <p className="note"><Icon className="s14" d={I.shield} /><span>The new company starts empty and separate: none of your other companies’ loads, drivers, customers or people are in it. Its creation is recorded in its audit log.</span></p>
        </div>
      ) : null}

      {step === "join" ? (
        <div className="c g12">
          <div className="fld">
            <label htmlFor={`${id}-code`}>Invitation code</label>
            <input id={`${id}-code`} className="inp mono" style={{ letterSpacing: ".2em", textTransform: "uppercase", maxWidth: "220px" }} value={code} onChange={(e) => setCode(e.target.value)} maxLength={9} autoFocus autoComplete="off" aria-describedby={`${id}-codeh`} />
            <span id={`${id}-codeh`} className="fs12 mu">8 letters and numbers, from the invitation. Codes expire after 7 days.</span>
          </div>
          {typed.length === 8 && preview.isError ? <div className="banner" data-k="bad" role="alert"><Icon className="s14" d={I.alert} /><div className="f1">{errorMessage(preview.error)}</div></div> : null}
          {preview.data ? (
            <div className="hccard on" role="status" style={{ cursor: "default" }}>
              <CompanyMark code={preview.data.invitation.company_code} color={preview.data.invitation.company_color} size={36} />
              <span className="c g2">
                <span className="fs13 w6">{preview.data.invitation.company_name}</span>
                <span className="fs12 mu">{[preview.data.invitation.mc_number, `${preview.data.invitation.drivers} drivers`, `${preview.data.invitation.trucks} trucks`].filter(Boolean).join(" · ")}</span>
                <span className="fs12">{`Invited by ${preview.data.invitation.invited_by_name ?? "a Main Admin"} as ${preview.data.invitation.role_label}`}</span>
                {preview.data.already_member ? <span className="fs12 errt">You’re already in this company</span> : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
