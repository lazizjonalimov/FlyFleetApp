"use client";

import { useConsole } from "@/features/console/console-provider";
import { goTo } from "@/features/console/shell";
import { useSoon } from "@/features/console/use-action";
import { ListScreen } from "@/features/lists/list-screen";
import { nothing } from "@/features/lists/unbuilt";
import { useList } from "@/features/lists/use-list";

/** My tasks. Nothing creates tasks yet, so the queue is empty; what needs attention is under Fleet alerts. */
export function TasksScreen() {
  const { I, set } = useConsole();
  const soon = useSoon();
  const list = useList<{ id: string }>({
    key: "tasks",
    group: "Overview",
    title: "My tasks",
    sub: () => "Created from exceptions and by teammates",
    placeholder: "Search tasks",
    fetch: nothing,
    defaultSort: "due",
    tabs: [{ label: "Open" }, { label: "Due today" }, { label: "Assigned by me" }, { label: "Done" }],
    columns: [
      { label: "Task", width: "minmax(0,1.7fr)", cell: () => ({}) },
      { label: "Due", width: "92px", cell: () => ({}) },
      { label: "Priority", width: "96px", cell: () => ({}) },
      { label: "Linked", width: "104px", cell: () => ({}) },
      { label: "", width: "108px", cell: () => ({}) },
    ],
    actions: [{ l: "New task", cls: "pri", ic: I.plus, go: soon("Creating tasks") }],
    empty: { icon: I.tasks, title: "No tasks yet", text: "Tasks aren’t being created yet. What needs someone now is listed under Fleet alerts.", action: { label: "Open Fleet alerts", go: () => set(goTo("alerts")) } },
  });
  return <ListScreen list={list} />;
}
