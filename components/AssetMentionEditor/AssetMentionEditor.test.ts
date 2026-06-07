import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getAssetMentionTriggerMatch } from "./AssetMentionEditor";

describe("getAssetMentionTriggerMatch", () => {
  it("opens after an at sign in the middle of text", () => {
    assert.deepEqual(getAssetMentionTriggerMatch("镜头参考@图"), {
      leadOffset: 4,
      matchingString: "图",
      replaceableString: "@图",
    });
  });

  it("opens after a bare at sign in the middle of text", () => {
    assert.deepEqual(getAssetMentionTriggerMatch("镜头参考@"), {
      leadOffset: 4,
      matchingString: "",
      replaceableString: "@",
    });
  });

  it("does not match across whitespace", () => {
    assert.equal(getAssetMentionTriggerMatch("镜头@图 继续"), null);
  });
});
