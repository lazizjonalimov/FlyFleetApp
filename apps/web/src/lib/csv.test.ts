import { describe, expect, it } from "vitest";
import { csvText } from "./csv";

describe("csvText", () => {
  it("quotes only what needs quoting", () => {
    expect(csvText(["Unit", "Owner"], [["101", "Becker, Tom"], ["102", 'Say "hi"'], ["103", null]])).toBe(
      'Unit,Owner\r\n101,"Becker, Tom"\r\n102,"Say ""hi"""\r\n103,',
    );
  });
});
