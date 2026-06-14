import { describe, expect, it } from "vitest";
import { buildProjectGalleryItems } from "@/lib/project-assets/gallery";
import { projectAssetStoragePath } from "@/lib/project-assets/storage";
import {
  parseProjectAssetInput,
  parseProjectAssetPatch,
  ProjectAssetValidationError,
} from "@/lib/project-assets/validation";
import {
  deleteProjectAsset,
  insertProjectAsset,
  listProjectAssets,
  updateProjectAsset,
} from "@/lib/project-assets/store";
import type { ProjectAsset } from "@/lib/project-assets/types";

const asset: ProjectAsset = {
  id: "asset-1",
  projectId: "project-1",
  type: "character",
  name: "女主角",
  description: "红色外套",
  tags: ["角色", "主角"],
  primaryImageUrl: "https://example.com/hero.png",
  referenceImageUrls: ["https://example.com/hero-side.png"],
  createdAt: "2026-06-14T10:00:00.000Z",
  updatedAt: "2026-06-14T10:00:00.000Z",
};

function supabaseQuery(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: typeof result) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push([String(property), ...args]);
          return query;
        };
      },
    },
  );
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

describe("project asset CRUD contracts", () => {
  it("normalizes create input into the persisted asset shape", () => {
    expect(
      parseProjectAssetInput({
        type: "character",
        name: "  女主角  ",
        description: "  红色外套  ",
        tags: ["角色", "角色", " 主角 "],
        primaryImageUrl: "https://example.com/hero.png",
        referenceImageUrls: [
          "https://example.com/hero-side.png",
          "https://example.com/hero-side.png",
        ],
      }),
    ).toEqual({
      type: "character",
      name: "女主角",
      description: "红色外套",
      tags: ["角色", "主角"],
      primaryImageUrl: "https://example.com/hero.png",
      referenceImageUrls: ["https://example.com/hero-side.png"],
    });
  });

  it("rejects invalid asset categories and empty updates", () => {
    expect(() =>
      parseProjectAssetInput({
        type: "video",
        name: "错误素材",
        primaryImageUrl: "https://example.com/image.png",
      }),
    ).toThrow(ProjectAssetValidationError);
    expect(() => parseProjectAssetPatch({})).toThrow("没有可更新的素材字段");
  });

  it("uses a project-owned storage path for copied media", () => {
    expect(
      projectAssetStoragePath({
        userId: "user/1",
        projectId: "project/1",
        assetId: "asset/1",
        slot: "reference-2",
        extension: "png",
      }),
    ).toBe("user_1/projects/project_1/assets/asset_1/reference-2.png");
  });

  it("merges project assets into the permanent gallery in newest-first order", () => {
    const items = buildProjectGalleryItems({
      assets: [asset],
      images: [
        {
          id: "image-1",
          createdAt: "2026-06-14T11:00:00.000Z",
          modeId: "free",
          modeName: "自由模式",
          modelId: "gpt-image-2",
          modelName: "gpt-image-2",
          finalPrompt: "prompt",
          userInput: "提示词",
          aspectRatio: "1:1",
          imageSize: "1K",
          imageUrl: "https://example.com/generated.png",
          refImageCount: 0,
          status: "success",
        },
      ],
      videos: [],
    });

    expect(items.map((item) => item.id)).toEqual(["image:image-1", "project-asset:asset-1"]);
    expect(items[1]).toMatchObject({
      kind: "project-asset",
      sourceRecordId: "asset-1",
      mediaUrl: asset.primaryImageUrl,
    });
  });

  it("writes ownership columns on create and scopes read/update/delete by project", async () => {
    const row = {
      id: asset.id,
      project_id: asset.projectId,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      primary_image_url: asset.primaryImageUrl,
      reference_image_urls: asset.referenceImageUrls,
      created_at: asset.createdAt,
      updated_at: asset.updatedAt,
    };

    const create = supabaseQuery({ data: row, error: null });
    await insertProjectAsset(create.client as never, {
      id: asset.id,
      userId: "user-1",
      projectId: asset.projectId,
      value: {
        type: asset.type,
        name: asset.name,
        description: asset.description,
        tags: asset.tags,
        primaryImageUrl: asset.primaryImageUrl,
        referenceImageUrls: asset.referenceImageUrls,
      },
    });
    expect(create.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        id: asset.id,
        user_id: "user-1",
        project_id: asset.projectId,
      }),
    ]);

    const list = supabaseQuery({ data: [row], error: null });
    await listProjectAssets(list.client as never, asset.projectId);
    expect(list.calls).toContainEqual(["eq", "project_id", asset.projectId]);

    const update = supabaseQuery({ data: row, error: null });
    await updateProjectAsset(update.client as never, asset.projectId, asset.id, {
      name: "新名称",
    });
    expect(update.calls).toContainEqual(["eq", "project_id", asset.projectId]);
    expect(update.calls).toContainEqual(["eq", "id", asset.id]);

    const remove = supabaseQuery({ data: [{ id: asset.id }], error: null });
    await deleteProjectAsset(remove.client as never, asset.projectId, asset.id);
    expect(remove.calls).toContainEqual(["eq", "project_id", asset.projectId]);
    expect(remove.calls).toContainEqual(["eq", "id", asset.id]);
  });
});
