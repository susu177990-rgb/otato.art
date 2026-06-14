import { describe, expect, it } from "vitest";
import { projectAssetStoragePath } from "./storage";

describe("project asset storage paths", () => {
  it("scopes copied media to the user, project, and stable asset id", () => {
    expect(
      projectAssetStoragePath({
        userId: "user-1",
        projectId: "project/1",
        assetId: "asset:1",
        slot: "reference-8",
        extension: "png",
      }),
    ).toBe("user-1/projects/project_1/assets/asset_1/reference-8.png");
  });
});
