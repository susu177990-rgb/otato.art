import assert from "node:assert/strict";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_MODEL_ORDER,
  buildVideoPromptFromSlots,
  composerSlotCountForTemplate,
  getVideoCapabilities,
  getVideoParameterCapabilities,
  mergeVideoSettings,
  isDisabledVideoModel,
  modelSupportsUiMode,
  videoModelsForUiMode,
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
assert.equal(getVideoCapabilities("seedance-2.0-mini").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("seedance-2.0").supportedModes.includes("start_end_frame"), true);
assert.equal(getVideoCapabilities("seedance-2.0-fast").supportedModes.includes("start_end_frame"), true);
assert.equal(getVideoCapabilities("seedance-2.0-mini").supportedModes.includes("start_end_frame"), true);
assert.equal(VIDEO_MODEL_ORDER.includes(["seedance", "1.5"].join("-") as never), false);
assert.equal(getVideoCapabilities("seedance-1.5-pro").supportedModes.includes("start_end_frame"), true);
assert.equal(getVideoCapabilities("seedance-1.5-pro").maxImageReferences, 2);
const seedance15Params = getVideoParameterCapabilities("seedance-1.5-pro", "text_to_video");
assert.equal(seedance15Params.durationCapability?.type, "range");
assert.equal(seedance15Params.durationCapability?.defaultValue, 5);
assert.equal(seedance15Params.soundControl?.kind, "generate_audio");
assert.equal(seedance15Params.soundControl?.defaultEnabled, true);
assert.equal(getVideoCapabilities("doubao-seedance-1.0-pro-fast").supportedModes.includes("start_frame"), true);
assert.equal(getVideoCapabilities("doubao-seedance-1.0-pro-fast").supportedModes.includes("start_end_frame"), false);
assert.equal(getVideoCapabilities("doubao-seedance-1.0-pro-fast").maxImageReferences, 1);
assert.equal(getVideoParameterCapabilities("doubao-seedance-1.0-pro-fast", "start_frame").soundControl, undefined);
assert.equal(getVideoParameterCapabilities("doubao-seedance-1.0-pro-fast", "start_frame").aspectRatios.includes("keep_ratio"), true);
assert.equal(getVideoCapabilities("seedance-1.0-pro").supportedModes.includes("start_frame"), true);
assert.equal(getVideoCapabilities("seedance-1.0-pro").supportedModes.includes("start_end_frame"), false);
assert.equal(getVideoCapabilities("seedance-1.0-pro").maxImageReferences, 1);
assert.equal(getVideoCapabilities("kling-3.0").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("kling-3.0").supportedModes.includes("video_edit"), false);
assert.equal(getVideoCapabilities("kling-3.0").resolutions.includes("4k"), true);
assert.equal(getVideoCapabilities("kling-3.0").maxVideoReferences, 0);
assert.equal(getVideoCapabilities("kling-3.0-motion").supportedModes.includes("motion_control"), true);
assert.equal(getVideoCapabilities("kling-3.0-motion").supportsMotionControl, true);
assert.equal(getVideoCapabilities("kling-2.6-motion").supportedModes.includes("motion_control"), true);
assert.equal(getVideoCapabilities("kling-2.6-motion").supportsMotionControl, true);
assert.equal(getVideoCapabilities("kling-2.6-motion").maxImageReferences, 1);
const klingMotionParams = getVideoParameterCapabilities("kling-3.0-motion", "motion_control");
assert.equal(klingMotionParams.supportsAspectRatio, false);
assert.equal(klingMotionParams.supportsDuration, false);
assert.equal(klingMotionParams.soundControl?.kind, "keep_original_sound");
assert.deepEqual(videoModelsForUiMode("motion_control"), ["kling-3.0-motion", "kling-2.6-motion"]);
assert.equal(getVideoCapabilities("happyhorse-1.1").supportedModes.includes("text_to_video"), true);
assert.equal(getVideoCapabilities("happyhorse-1.1").supportedModes.includes("start_frame"), true);
assert.equal(getVideoCapabilities("happyhorse-1.1").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("happyhorse-1.1").supportedModes.includes("video_edit"), false);
assert.equal(getVideoCapabilities("happyhorse-1.1").supportedModes.includes("start_end_frame"), false);
assert.equal(getVideoCapabilities("happyhorse-1.1").maxImageReferences, 9);
assert.equal(getVideoCapabilities("happyhorse-1.1").maxVideoReferences, 0);
assert.equal(getVideoCapabilities("happyhorse-1.1").aspectRatios.includes("4:5"), true);
assert.equal(getVideoParameterCapabilities("happyhorse-1.1", "start_frame").supportsAspectRatio, false);
assert.equal(getVideoCapabilities("happyhorse-1.0").supportedModes.includes("text_to_video"), true);
assert.equal(getVideoCapabilities("happyhorse-1.0").supportedModes.includes("start_frame"), true);
assert.equal(getVideoCapabilities("happyhorse-1.0").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("happyhorse-1.0").supportedModes.includes("video_edit"), true);
assert.equal(getVideoCapabilities("happyhorse-1.0").supportedModes.includes("start_end_frame"), false);
assert.equal(getVideoCapabilities("happyhorse-1.0").maxImageReferences, 9);
assert.equal(getVideoCapabilities("happyhorse-1.0").maxVideoReferences, 1);
assert.equal(getVideoCapabilities("happyhorse-1.0").aspectRatios.includes("5:4"), true);
const happyHorseEditParams = getVideoParameterCapabilities("happyhorse-1.0", "video_edit");
assert.equal(happyHorseEditParams.supportsAspectRatio, false);
assert.equal(happyHorseEditParams.supportsDuration, false);
assert.equal(happyHorseEditParams.soundControl?.kind, "keep_original_sound");
assert.equal(happyHorseEditParams.soundControl?.defaultEnabled, false);
assert.equal(VIDEO_MODEL_ORDER.includes("grok-imagine"), true);
assert.equal(getVideoCapabilities("grok-imagine").supportedModes.includes("text_to_video"), true);
assert.equal(getVideoCapabilities("grok-imagine").supportedModes.includes("start_frame"), true);
assert.equal(getVideoCapabilities("grok-imagine").supportedModes.includes("multi_image_reference"), false);
assert.equal(getVideoCapabilities("grok-imagine").supportedModes.includes("start_end_frame"), false);
assert.equal(getVideoCapabilities("grok-imagine").supportedModes.includes("video_edit"), false);
assert.equal(getVideoCapabilities("grok-imagine").maxImageReferences, 1);
assert.equal(getVideoCapabilities("grok-imagine").maxVideoReferences, 0);
const grokTextParams = getVideoParameterCapabilities("grok-imagine", "text_to_video");
assert.equal(grokTextParams.durationCapability?.type, "range");
assert.equal(grokTextParams.durationCapability?.defaultValue, 6);
assert.equal(grokTextParams.resolutions.includes("480p"), true);
assert.equal(grokTextParams.soundControl, undefined);
assert.equal(grokTextParams.aspectRatios.includes("3:2"), true);
const grokStartParams = getVideoParameterCapabilities("grok-imagine", "start_frame");
assert.equal(grokStartParams.supportsAspectRatio, true);
assert.equal(grokStartParams.aspectRatios.includes("auto"), true);
assert.equal(grokStartParams.durationCapability?.type, "range");
assert.equal(grokStartParams.durationCapability?.type === "range" ? grokStartParams.durationCapability.min : 0, 1);
assert.equal(grokStartParams.durationCapability?.type === "range" ? grokStartParams.durationCapability.max : 0, 15);

assert.equal(modelSupportsUiMode("seedance-2.0", "start_end_frame"), true);
assert.equal(modelSupportsUiMode("seedance-2.0", "multi_image_reference"), true);
assert.equal(modelSupportsUiMode("seedance-2.0-mini", "start_end_frame"), true);
assert.equal(modelSupportsUiMode("seedance-2.0-mini", "multi_image_reference"), true);
assert.equal(modelSupportsUiMode("seedance-1.5-pro", "start_end_frame"), true);
assert.equal(modelSupportsUiMode("seedance-1.5-pro", "multi_image_reference"), false);
assert.equal(modelSupportsUiMode("doubao-seedance-1.0-pro-fast", "start_end_frame"), true);
assert.equal(modelSupportsUiMode("doubao-seedance-1.0-pro-fast", "multi_image_reference"), false);
assert.equal(modelSupportsUiMode("seedance-1.0-pro", "start_end_frame"), true);
assert.equal(modelSupportsUiMode("seedance-1.0-pro", "multi_image_reference"), false);
assert.equal(modelSupportsUiMode("kling-3.0", "video_edit"), false);
assert.equal(modelSupportsUiMode("happyhorse-1.0", "video_edit"), true);
assert.equal(modelSupportsUiMode("happyhorse-1.1", "video_edit"), false);
assert.equal(modelSupportsUiMode("gemini-omni", "multi_image_reference"), true);
assert.equal(isDisabledVideoModel("gemini-omni"), false);
assert.equal(DEFAULT_VIDEO_SETTINGS.models["gemini-omni"].enabled, true);
assert.equal(mergeVideoSettings({ models: { "gemini-omni": { enabled: true } } }).models["gemini-omni"].enabled, true);
const legacyCrunNames = mergeVideoSettings({
  models: {
    "grok-imagine": {
      apiModelNameByMode: {
        text_to_video: "grok-imagine-text-to-video-beta",
        start_frame: "grok-imagine-image-to-video-beta",
      },
    },
    "happyhorse-1.1": {
      apiModelNameByMode: {
        text_to_video: "happyhorse-1.1-text-to-video",
        start_frame: "happyhorse-1.1-image-to-video",
        multi_image_reference: "happyhorse-1.1-reference-to-video",
      },
    },
  },
});
assert.equal(legacyCrunNames.models["grok-imagine"].apiModelNameByMode.text_to_video, "grok-imagine/t2v");
assert.equal(legacyCrunNames.models["grok-imagine"].apiModelNameByMode.start_frame, "grok-imagine-video-1.5-preview");
assert.equal(legacyCrunNames.models["happyhorse-1.1"].apiModelNameByMode.start_frame, "happyhorse-1-1-i2v");
assert.deepEqual(videoModelsForUiMode("video_edit"), ["happyhorse-1.0"]);
const referenceUiModels = videoModelsForUiMode("multi_image_reference");
assert.equal(referenceUiModels.includes("seedance-2.0"), true);
assert.equal(referenceUiModels.includes("seedance-2.0-fast"), true);
assert.equal(referenceUiModels.includes("seedance-2.0-mini"), true);
assert.equal(referenceUiModels.includes("seedance-1.5-pro"), false);
assert.equal(referenceUiModels.includes("doubao-seedance-1.0-pro-fast"), false);
assert.equal(referenceUiModels.includes("seedance-1.0-pro"), false);
assert.equal(referenceUiModels.includes("kling-3.0"), true);
assert.equal(referenceUiModels.includes("happyhorse-1.1"), true);
assert.equal(referenceUiModels.includes("happyhorse-1.0"), true);
assert.equal(referenceUiModels.includes("grok-imagine"), false);
assert.equal(referenceUiModels.includes("veo-3.1"), false);
assert.equal(referenceUiModels.includes("veo-3.1-fast"), true);
assert.equal(referenceUiModels.includes("veo-3.1-lite"), true);
assert.equal(referenceUiModels.includes("gemini-omni"), true);
const startEndUiModels = videoModelsForUiMode("start_end_frame");
assert.equal(startEndUiModels.includes("doubao-seedance-1.0-pro-fast"), true);
assert.equal(startEndUiModels.includes("seedance-1.0-pro"), true);
assert.equal(startEndUiModels.includes("happyhorse-1.1"), true);
assert.equal(startEndUiModels.includes("grok-imagine"), true);
assert.equal(startEndUiModels.includes("gemini-omni"), true);
assert.equal(getVideoCapabilities("gemini-omni").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("veo-3.1").supportedModes.includes("multi_image_reference"), false);
assert.equal(getVideoCapabilities("veo-3.1-fast").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("veo-3.1-lite").supportedModes.includes("multi_image_reference"), true);
assert.equal(getVideoCapabilities("veo-3.1").aspectRatios.includes("auto"), true);
const veoTextParams = getVideoParameterCapabilities("veo-3.1", "text_to_video");
assert.equal(veoTextParams.durationCapability?.type, "presets");
assert.deepEqual(veoTextParams.durationCapability?.type === "presets" ? veoTextParams.durationCapability.values : [], [4, 6, 8]);
assert.equal(veoTextParams.soundControl, undefined);
const veoReferenceParams = getVideoParameterCapabilities("veo-3.1-fast", "multi_image_reference");
assert.deepEqual(veoReferenceParams.aspectRatios, ["16:9"]);
assert.deepEqual(veoReferenceParams.durationCapability?.type === "presets" ? veoReferenceParams.durationCapability.values : [], [8]);

console.log("video workspace smoke: ok");
