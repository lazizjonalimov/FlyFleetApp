"use client";

import { clsx } from "clsx";
import { useId, useState } from "react";
import { EmptyState } from "@/components/feedback/states";
import { Icon } from "@/components/ui/icon";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";

/** Where support and the status page are, set for each installation. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@flyfleet.io";
export const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_URL || "https://status.flyfleet.io";

type Topic = { key: string; title: string; text: string; icon: string };
export const TOPICS: Topic[] = [
  { key: "start", title: "Getting started", text: "Your company, your team, and finding your way around", icon: I.play },
  { key: "dispatch", title: "Dispatch & loads", text: "Loads, the dispatch board, tracking and alerts", icon: I.loads },
  { key: "drivers", title: "Drivers & compliance", text: "Drivers, licenses and papers, inspections", icon: I.shield },
  { key: "billing", title: "Billing & settlements", text: "Invoices, payments, driver statements and fuel", icon: I.dollar },
  { key: "integrations", title: "Integrations", text: "Telematics, fuel cards and other providers", icon: I.link },
  { key: "account", title: "Account & access", text: "Your profile, sign-in, roles and permissions", icon: I.key },
];

export const QUESTIONS: { topic: string; q: string; a: string }[] = [
  { topic: "start", q: "How do I find a load, driver or truck quickly?", a: "Press ⌘ K (Ctrl K on Windows) anywhere, or click the search box in the top bar. Type a load number, a name, a unit number or an invoice number, then pick a result with ↑ ↓ and open it with ↵. The same box takes you to any screen." },
  { topic: "start", q: "How do I add people to my company?", a: "Someone who manages the team opens Settings > Team & access and invites them by email, choosing their role. The invitation link lets them set a password, or join with the FlyFleet sign-in their email already has." },
  { topic: "dispatch", q: "How do I create a load?", a: "Choose Create in the top bar, then New load. You can start from a rate confirmation, which FlyFleet reads for you, or type the load in by hand." },
  { topic: "dispatch", q: "Why can I see only some trucks?", a: "If you’re a dispatcher on a dispatch team, you see that team’s trucks and the loads, drivers and alerts tied to them. The chip beside the search box says which team. An administrator manages teams under Settings > Dispatch teams." },
  { topic: "drivers", q: "Why can’t a driver be dispatched?", a: "A driver with an expired or missing required document, such as a license or medical card, is blocked from dispatch until it is renewed. Compliance lists what is expired, expiring soon or missing." },
  { topic: "billing", q: "How do I invoice a delivered load?", a: "Choose Create > New invoice, and start from the proof of delivery or pick the completed loads yourself. Completed loads that aren’t invoiced yet also show under the bell." },
  { topic: "integrations", q: "How do I connect telematics or fuel cards?", a: "An administrator opens Settings > Integrations and connects the provider. Live fleet and Fuel & IFTA fill in once it is connected." },
  { topic: "account", q: "Why does a screen say my role doesn’t include it?", a: "Each role opens only the screens its permissions allow. On such a screen, Request access asks your company’s owners and administrators for you." },
  { topic: "account", q: "How do I sign out of another computer?", a: "Open the account menu, then Profile & preferences. Under Sessions, choose Sign out beside that device, or sign out of all other sessions at once." },
  { topic: "account", q: "How do I choose which alerts reach me?", a: "Open the account menu, then Notification settings, and switch each alert on or off for each channel." },
];

/** The help center: topics, popular questions, how to reach support, and whether FlyFleet is up. */
export function HelpCenter() {
  const { me } = useConsole();
  const id = useId();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  const topics = TOPICS.filter((t) => matches(`${t.title} ${t.text}`) || QUESTIONS.some((q) => q.topic === t.key && matches(`${q.q} ${q.a}`)));
  const questions = QUESTIONS.filter((q) => (!topic || q.topic === topic) && matches(`${q.q} ${q.a}`));
  const support = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`FlyFleet help · ${me.organization.name}`)}`;

  return (
    <div className="col" style={{ overflow: "auto" }}>
      <div className="ph">
        <div className="f1">
          <nav className="crumb" aria-label="Breadcrumb"><b aria-current="page"><span>Help center</span></b></nav>
          <h1 className="h1">Help center</h1>
          <p className="sub">Answers about FlyFleet, and how to reach support when you need a person</p>
        </div>
        <a className="btn pri" href={support}>
          <Icon className="s14" d={I.mail} />
          Contact support
        </a>
      </div>

      <div className="c g20" style={{ padding: "4px 24px 24px", maxWidth: "1040px" }}>
        <div className="fld" style={{ maxWidth: "560px" }}>
          <label htmlFor={`${id}-q`} className="sr-only">Search help</label>
          <div className="r g8 inp" style={{ height: "40px" }}>
            <Icon className="s14 mu" d={I.search} />
            <input id={`${id}-q`} type="search" className="f1" style={{ border: "none", outline: "none", background: "transparent", height: "100%" }} placeholder="Search help, e.g. invoice, dispatch team, sign out" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        <section aria-labelledby={`${id}-topics`} className="c g10">
          <h2 id={`${id}-topics`} className="fs14 w6">Topics</h2>
          {topics.length ? (
            <div className="hcgrid">
              {topics.map((t) => (
                <button key={t.key} className={clsx("hccard", topic === t.key && "on")} aria-pressed={topic === t.key} onClick={() => setTopic(topic === t.key ? null : t.key)}>
                  <span className="paic"><Icon className="s14" d={t.icon} /></span>
                  <span className="c g2">
                    <span className="fs13 w6">{t.title}</span>
                    <span className="fs12 mu">{t.text}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby={`${id}-faq`} className="c g10">
          <div className="r g8">
            <h2 id={`${id}-faq`} className="fs14 w6 f1">{topic ? `Popular questions · ${TOPICS.find((t) => t.key === topic)?.title}` : "Popular questions"}</h2>
            {topic ? <button className="btn sm ghost" onClick={() => setTopic(null)}>Show all</button> : null}
          </div>
          {questions.length ? (
            <div className="card oh">
              {questions.map((item) => (
                <details key={item.q} className="faq">
                  <summary><Icon className="s14 mu" d={I.chevR} /><span>{item.q}</span></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          ) : (
            <EmptyState icon={I.search} title="No answers match" text="Try other words, or contact support and a person will help.">
              <a className="btn sm" href={support}>Contact support</a>
            </EmptyState>
          )}
        </section>

        <div className="r g8 fs13">
          <Icon className="s14 mu" d={I.zap} />
          <a className="lnk" href={STATUS_URL} target="_blank" rel="noopener noreferrer">System status</a>
          <span className="mu">· Whether FlyFleet is up, and any incident in progress</span>
        </div>
      </div>
    </div>
  );
}
