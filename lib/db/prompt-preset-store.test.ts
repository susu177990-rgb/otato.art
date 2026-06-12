import { describe, expect, it } from "vitest";
import {
  replaceSitePromptPresetsByKind,
  syncPromptLibraryFromWorkspaces,
  upsertSitePromptPreset,
  type SitePromptPreset,
} from "@/lib/db/prompt-preset-store";

describe("prompt preset ordering", () => {
  it("persists the caller order as sort_order", async () => {
    const upsertedRows: Array<Record<string, unknown>> = [];
    const deletedKinds: string[] = [];
    const deleteNotFilters: Array<[string, string, string]> = [];

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
                  not(column: string, operator: string, value: string) {
                    deleteNotFilters.push([column, operator, value]);
                    return {
                      async not(column2: string, operator2: string, value2: string) {
                        deleteNotFilters.push([column2, operator2, value2]);
                        return { error: null };
                      },
                    };
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
    expect(deleteNotFilters).toEqual([
      ["id", "like", "user_preset_%"],
      ["id", "in", '("new-preset","old-preset")'],
    ]);
  });

  it("upserts one user preset at the front without deleting existing presets", async () => {
    const upsertedRows: Array<Record<string, unknown>> = [];
    let deleteCalled = false;

    const supabase = {
      from(table: string) {
        if (table !== "site_prompt_presets") throw new Error(`unexpected table ${table}`);
        return {
          select(columns: string) {
            if (columns !== "sort_order") throw new Error(`unexpected select columns ${columns}`);
            return {
              eq(column: string, value: string) {
                if (column !== "preset_type") throw new Error(`unexpected eq column ${column}`);
                if (value !== "image") throw new Error(`unexpected preset type ${value}`);
                return {
                  order(columnName: string, options: { ascending: boolean }) {
                    if (columnName !== "sort_order" || !options.ascending) throw new Error("unexpected order");
                    return {
                      async limit(count: number) {
                        if (count !== 1) throw new Error(`unexpected limit ${count}`);
                        return { data: [{ sort_order: 3 }], error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          async upsert(rows: Array<Record<string, unknown>>) {
            upsertedRows.push(...rows);
            return { error: null };
          },
          delete() {
            deleteCalled = true;
            return {};
          },
        };
      },
    };

    const preset: SitePromptPreset = {
      id: "user-preset",
      kind: "image",
      title: " User preset ",
      promptTemplate: "make image",
      coverImageUrl: " https://example.com/cover.png ",
      refSlotHints: ["图1"],
      tags: ["资产", "资产", ""],
      description: " Shared preset ",
    };

    const saved = await upsertSitePromptPreset(supabase as never, "image", preset);

    expect(deleteCalled).toBe(false);
    expect(saved).toMatchObject({
      id: "user-preset",
      kind: "image",
      title: "User preset",
      promptTemplate: "make image",
      coverImageUrl: "https://example.com/cover.png",
      refSlotHints: ["图1"],
      tags: ["资产"],
      description: "Shared preset",
    });
    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0]).toMatchObject({
      id: "user-preset",
      preset_type: "image",
      title: "User preset",
      prompt_template: "make image",
      cover_image_url: "https://example.com/cover.png",
      ref_slot_hints: ["图1"],
      tags: ["资产"],
      description: "Shared preset",
      sort_order: 2,
    });
  });

  it("preserves user-uploaded image/video presets when syncing workspace presets", async () => {
    const deleteFilters: Array<[string, unknown]> = [];
    const deleteNotFilters: Array<[string, string, string]> = [];

    const supabase = {
      from(table: string) {
        if (table !== "site_prompt_presets") throw new Error(`unexpected table ${table}`);
        return {
          async upsert() {
            return { error: null };
          },
          delete() {
            return {
              in(column: string, value: unknown) {
                deleteFilters.push([column, value]);
                return {
                  not(column2: string, operator2: string, value2: string) {
                    deleteNotFilters.push([column2, operator2, value2]);
                    return {
                      async not(column3: string, operator3: string, value3: string) {
                        deleteNotFilters.push([column3, operator3, value3]);
                        return { error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    await syncPromptLibraryFromWorkspaces(
      supabase as never,
      {
        customModes: [{ id: "custom-image", label: "Image" }],
        prompts: { "custom-image": "image prompt" },
        coverImageUrlByMode: {},
        refSlotHintsByMode: {},
        promptTagsByMode: {},
        promptDescriptionsByMode: {},
      } as never,
      {
        customModes: [{ id: "custom-video", label: "Video" }],
        prompts: { "custom-video": "video prompt" },
        coverImageUrlByMode: {},
        promptTagsByMode: {},
        promptDescriptionsByMode: {},
      } as never,
    );

    expect(deleteFilters).toEqual([["preset_type", ["image", "video"]]]);
    expect(deleteNotFilters).toEqual([
      ["id", "like", "user_preset_%"],
      ["id", "in", '("custom-image","custom-video")'],
    ]);
  });
});
