import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260808120000_add_seedream_5_pro_image_model.sql", "utf8");

describe("Seedream 5.0 Pro image model migration", () => {
  it("extends the image model constraint and shared workspace settings", () => {
    expect(sql).toContain("'seedream-5-pro'");
    expect(sql).toContain("'bytedance/seedream-5-pro'");
    expect(sql).toContain("'provider', 'seedream'");
  });

  it("seeds only the supported 1K and 2K billing rows", () => {
    expect(sql).toMatch(/\('1K', 48::bigint/);
    expect(sql).toMatch(/\('2K', 96::bigint/);
    expect(sql).not.toMatch(/\('4K',/);
    expect(sql).toContain('"referenceImageCrunCredits":0.5');
  });
});
