import { describe, expect, it } from "vitest";
import { activeAgo, describeDevice } from "./devices";

describe("describing a device", () => {
  it("names the browser and system", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toBe("Chrome on macOS");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe("Firefox on Linux");
  });

  it("says so when it can't tell", () => {
    expect(describeDevice(null)).toBe("Unknown device");
    expect(describeDevice("curl/8.0")).toBe("Unknown device");
  });

  it("says how long ago a session was used", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(activeAgo("2026-11-25T11:58:00Z", now)).toBe("Active now");
    expect(activeAgo("2026-11-25T11:30:00Z", now)).toBe("30 min ago");
    expect(activeAgo("2026-11-25T09:00:00Z", now)).toBe("3 h ago");
    expect(activeAgo("2026-11-23T12:00:00Z", now)).toBe("2 days ago");
  });
});
