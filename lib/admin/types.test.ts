import { describe, expect, it } from "vitest";
import {
  canAdmin,
  normalizeAdminRole,
  normalizeApiUsageMode,
} from "@/lib/admin/types";

describe("admin management contracts", () => {
  it("keeps role permissions ordered", () => {
    expect(canAdmin("owner", "manageRoles")).toBe(true);
    expect(canAdmin("admin", "manageUsers")).toBe(true);
    expect(canAdmin("reviewer", "review")).toBe(true);
    expect(canAdmin("reviewer", "manageUsers")).toBe(false);
    expect(canAdmin("admin", "manageRoles")).toBe(true);
  });

  it("normalizes unsafe admin inputs to conservative defaults", () => {
    expect(normalizeAdminRole("owner")).toBe("owner");
    expect(normalizeAdminRole("root")).toBe("reviewer");
  });

  it("defaults API modes without exposing site keys", () => {
    expect(normalizeApiUsageMode({ llm: "user", image: "site", video: "bad" })).toEqual({
      llm: "user",
      image: "site",
      video: "site",
    });
  });
});
