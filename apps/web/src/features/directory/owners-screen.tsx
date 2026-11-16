"use client";

import { useConsole } from "@/features/console/console-provider";
import { useSoon } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { nothing } from "@/features/lists/unbuilt";
import { useList } from "@/features/lists/use-list";

/** Owners of equipment the carrier runs. Nothing records owners yet, so the list is empty. */
export function OwnersScreen() {
  const { I } = useConsole();
  const soon = useSoon();
  const list = useList<{ id: string }>({
    key: "owners",
    group: "Directory",
    title: "Owners",
    sub: () => "Individuals and businesses that own trucks and trailers working for the carrier. Owning equipment is separate from driving it and from working here.",
    placeholder: "Name, contact, email, phone or city",
    fetch: nothing,
    defaultSort: "name",
    tabs: [{ label: "All" }, { label: "Owner-operators" }, { label: "Non-operating" }, { label: "Individuals" }, { label: "Businesses" }, { label: "Onboarding" }, { label: "Ended" }],
    columns: [
      { label: "Owner", width: "220px", cell: () => ({}) },
      { label: "Entity", width: "96px", cell: () => ({}) },
      { label: "Category", width: "168px", cell: () => ({}) },
      { label: "Contact", width: "160px", cell: () => ({}) },
      { label: "Phone", width: "120px", cell: () => ({}) },
      { label: "Email", width: "minmax(0,1fr)", cell: () => ({}) },
      { label: "Trucks", width: "72px", right: true, cell: () => ({}) },
      { label: "Trailers", width: "72px", right: true, cell: () => ({}) },
      { label: "Status", width: "108px", cell: () => ({}) },
    ],
    actions: [
      { l: "Owner portal settings", cls: "", ic: "", go: soon("The owner portal") },
      { l: "Add owner", cls: "pri", ic: I.plus, go: soon("Adding owners") },
    ],
    empty: { icon: I.owner, title: "No owners yet", text: "Owner records, their agreements and their settlements aren’t available yet. Trucks and trailers carry their ownership type in the meantime." },
  });
  return <ListScreen list={list} />;
}
