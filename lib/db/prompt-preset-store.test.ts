import { describe, expect, it } from "vitest";
import { replaceSitePromptPresetsByKind, type SitePromptPreset } from "@/lib/db/prompt-preset-store";

describe("prompt preset ordering", () => {
  it("persists the caller order as sort_order", async () => {
    const upsertedRows: Array<Record<string, unknown>> = [];
    const deletedKinds: string[] = [];

    const supabase = {
      from(table: string) {
        if (table !== "site_prompt_presets") throw new Error(`unexpected table ${table}`);
        return {
          async upsert(rows: Array<Record<string, unknown>>) {
            upsertedRows.push(...rows);
            return { error: null };
          },
          delete() {
            return {
              eq(column: string, value: string) {
                if (column !== "preset_type") throw new Error(`unexpected eq column ${column}`);
                deletedKinds.push(value);
                return {
                  async not() {
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const presets: SitePromptPreset[] = [
      {
        id: "new-preset",
        kind: "chat",
        title: "New preset",
        promptTemplate: "new",
        coverImageUrl: "",
        refSlotHints: [],
        tags: [],
      },
      {
        id: "old-preset",
        kind: "chat",
        title: "Old preset",
        promptTemplate: "old",
        coverImageUrl: "",
        refSlotHints: [],
        tags: [],
      },
    ];

    await replaceSitePromptPresetsByKind(supabase as never, "chat", presets);

    expect(upsertedRows.map((row) => [row.id, row.sort_order])).toEqual([
      ["new-preset", 0],
      ["old-preset", 1],
    ]);
    expect(deletedKinds).toEqual(["chat"]);
  });
});
