import { describe, expect, it } from "vitest";
import { buildProjectScriptHref } from "./project-script-route";

describe("project script route", () => {
  it("keeps the project id in the script route", () => {
    expect(buildProjectScriptHref("project / 01")).toBe(
      "/projects/project%20%2F%2001/script",
    );
  });
});
