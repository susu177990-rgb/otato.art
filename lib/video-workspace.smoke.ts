import assert from "node:assert/strict";
import {
  DEFAULT_VIDEO_SETTINGS,
  buildVideoPromptFromSlots,
  composerSlotCountForTemplate,
  getVideoCapabilities,
  mergeVideoSettings,
} from "@/lib/video-workspace";

const migrated = mergeVideoSettings({
  prompts: {
    "cinematic-text-to-video": "Prompt A {{镜头}}",
    custom_story: "Legacy prompt {{主体}}",
  },
  customModes: [{ id: "custom_story", label: "旧自定义模式" }],
  models: {
    "seedance-2.0": {
      baseUrl: "https://seedanceapi.org/v2",
      apiKey: "sk-1",
      modelName: "seedance-2.0",
    },
  },
});

assert.equal(migrated.models["seedance-2.0"].baseUrl, "https://seedanceapi.org/v2");
assert.equal(migrated.models["seedance-2.0"].apiModelName, "seedance-2.0");
assert.equal(migrated.prompts["custom_video_cinematic-text-to-video"], "Prompt A {{镜头}}");
assert.equal(migrated.customModes.length, 2);
const legacyMode = migrated.customModes.find(m => m.id === "custom_video_custom_story");
const cinematicMode = migrated.customModes.find(m => m.id === "custom_video_cinematic-text-to-video");
assert.equal(legacyMode?.label, "旧自定义模式");
assert.equal(migrated.prompts[legacyMode!.id], "Legacy prompt {{主体}}");
assert.equal(cinematicMode?.label, "cinematic-text-to-video");
assert.equal(migrated.uiDefaults.defaultModelId, DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultModelId);

const template = `{{主体}}\n\n{{镜头}}`;
assert.equal(composerSlotCountForTemplate(template), 2);
assert.equal(buildVideoPromptFromSlots(template, ["一只猫", "推进镜头"]), "一只猫\n\n推进镜头");
assert.equal(getVideoCapabilities("seedance-2.0").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("seedance-2.0-fast").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("kling-3.0").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("gemini-omni").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("veo-3.1").supportedModes.includes("multi_image_reference"), false);
assert.equal(getVideoCapabilities("veo-3.1-fast").supportedModes.includes("multi_image_reference"), false);

console.log("video workspace smoke: ok");
