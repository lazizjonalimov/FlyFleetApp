import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleFrame } from "@/features/console/console-frame";
import { ConsoleProvider } from "@/features/console/console-provider";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { ListScreen } from "@/features/lists/list-screen";
import { LoadsScreen } from "@/features/loads/loads-screen";

// the address the console believes it is at
const at = { pathname: "/lone-star-freight/dashboard", search: "" };
const router = { push: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => at.pathname,
  useSearchParams: () => new URLSearchParams(at.search),
}));

function open(address: string, page: React.ReactNode) {
  const [pathname, search = ""] = address.split("?");
  at.pathname = pathname!;
  at.search = search;
  window.history.replaceState(null, "", address);
  return render(
    <ConsoleProvider>
      <ConsoleFrame>{page}</ConsoleFrame>
    </ConsoleProvider>,
  );
}

const sidebar = () => within(screen.getByRole("complementary", { name: "Main navigation" }));

beforeEach(() => {
  router.push.mockClear();
  router.prefetch.mockClear();
});

describe("the console at an address", () => {
  it("draws the shell around the screen for it, for the signed-in role", () => {
    open("/lone-star-freight/dashboard", <DashboardScreen />);
    expect(screen.getByRole("heading", { name: "Dashboard", level: 1 })).toBeInTheDocument();
    expect(sidebar().getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("Dana Kim");
  });

  it("takes the role from the address", () => {
    open("/lone-star-freight/dashboard?role=dispatcher", <DashboardScreen />);
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("Jordan Lee");
    expect(sidebar().getByRole("button", { name: "Invoices, no access" })).toBeInTheDocument();
  });

  it("puts the refusal in place of a screen the role may not open", () => {
    open("/lone-star-freight/finance/invoices?role=dispatcher", <ListScreen />);
    expect(screen.getByRole("heading", { name: "You don’t have access to Invoices" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invoices", level: 1 })).not.toBeInTheDocument();
  });

  it("opens the drawer the address names", () => {
    open("/lone-star-freight/loads?drawer=FF-24790", <LoadsScreen />);
    expect(screen.getByRole("complementary", { name: "Load details" })).toHaveTextContent("FF-24790");
  });
});

describe("moving around", () => {
  it("goes to a section through the router, once", async () => {
    open("/lone-star-freight/dashboard", <DashboardScreen />);
    await userEvent.click(sidebar().getByRole("button", { name: "Loads" }));
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/lone-star-freight/loads");
  });

  it("carries the role and the look along, and nothing else", async () => {
    open("/lone-star-freight/dashboard?role=dispatcher&theme=dark&overlay=notifications", <DashboardScreen />);
    await userEvent.click(sidebar().getByRole("button", { name: "Loads" }));
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/lone-star-freight/loads?role=dispatcher&theme=dark");
  });

  it("opens a load's drawer by changing the address in place, once, though the click runs two handlers", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    open("/lone-star-freight/loads?preselect=true", <LoadsScreen />);
    // the load number is a button inside a row that opens the same drawer
    await userEvent.click(screen.getAllByRole("button", { name: "FF-24817" })[0]!);
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/lone-star-freight/loads?preselect=true&drawer=FF-24817");
    expect(router.push).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("does not move for a change that only opens something on the screen", async () => {
    open("/lone-star-freight/dashboard", <DashboardScreen />);
    await userEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("the keyboard", () => {
  it("opens search with Ctrl or ⌘ K and closes the top layer with Escape", async () => {
    open("/lone-star-freight/dashboard", <DashboardScreen />);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Search everything" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Search everything" })).not.toBeInTheDocument();
  });

  it("closes a dialog before what is under it", async () => {
    open("/lone-star-freight/loads?drawer=FF-24817&modal=add&kind=load", <LoadsScreen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Load details" })).toBeInTheDocument();
  });
});
