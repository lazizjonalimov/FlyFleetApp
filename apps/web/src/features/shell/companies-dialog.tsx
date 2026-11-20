"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, Problem } from "@/components/feedback/dialog";
import { useConsole } from "@/features/console/console-provider";
import { I } from "@/features/console/icons";
import { api, unwrap } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { CompanyMark } from "./company-mark";

/** The account owner's list of companies: add one, archive one they no longer operate, restore it. */
export function CompaniesDialog({ onClose }: { onClose: () => void }) {
  const { me, notify } = useConsole();
  const router = useRouter();
  const key = [me.account.id, "account", "companies"];
  const list = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/v1/account/companies")) });
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setPending(true);
    setProblem(null);
    try {
      await work();
      notify(done);
      await list.refetch();
      router.refresh();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const data = list.data;
  return (
    <Dialog onClose={onClose} title="Companies" sub={data ? `${data.active_count} of ${data.max_companies} active companies in ${data.account_name}` : "Everything under your account"} icon={I.building} width={560}
      footer={<><span className="sp"></span><button className="btn" onClick={onClose} disabled={pending}>Done</button><button className="btn pri" disabled={pending || name.trim().length < 2} onClick={() => void run(async () => { await unwrap(api.POST("/api/v1/account/companies", { body: { name: name.trim() } })); setName(""); }, `${name.trim()} was added`)}>{pending ? "Working…" : "Add company"}</button></>}>
      <Problem message={problem} />
      <div className="c g6">
        {data?.companies.map((c) => (
          <div key={c.id} className="r g8 fs13" style={{ alignItems: "center" }}>
            <CompanyMark code={c.code} color={c.color} size={28} />
            <span className="f1 c"><span className="w5">{c.name}</span><span className="fs12 mu">{[c.mc_number, c.dot_number ? `DOT ${c.dot_number}` : "", c.status === "active" ? "Active" : "Archived"].filter(Boolean).join(" · ")}</span></span>
            <button className="btn xs" disabled={pending} onClick={() => void run(() => c.status === "active" ? unwrap(api.POST("/api/v1/account/companies/{company_id}/archive", { params: { path: { company_id: c.id } } })) : unwrap(api.POST("/api/v1/account/companies/{company_id}/restore", { params: { path: { company_id: c.id } } })), c.status === "active" ? `${c.name} was archived` : `${c.name} was restored`)}>{c.status === "active" ? "Archive" : "Restore"}</button>
          </div>
        ))}
      </div>
      <div className="hr"></div>
      <div className="fld"><label htmlFor="newco">New company name</label><input id="newco" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the company" /><span className="fs12 mu">Set its short code and colour afterwards under Settings → Organization.</span></div>
    </Dialog>
  );
}
