import { describe, expect, it } from "vitest";
import { checkPhoto } from "./photo";

describe("choosing a profile photo", () => {
  it("takes JPEG, PNG or WebP up to 5 MB, and says why not otherwise", () => {
    expect(checkPhoto({ type: "image/png", size: 200_000 })).toBeNull();
    expect(checkPhoto({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
    expect(checkPhoto({ type: "image/gif", size: 1000 })).toBe("Use a JPEG, PNG or WebP picture");
    expect(checkPhoto({ type: "image/svg+xml", size: 1000 })).toBe("Use a JPEG, PNG or WebP picture");
    expect(checkPhoto({ type: "image/jpeg", size: 0 })).toBe("That file is empty");
    expect(checkPhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("Photos can be up to 5 MB");
  });
});
