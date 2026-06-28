import assert from "node:assert/strict";
import {
  buildVideoCreatePayloadForTest,
  validateUnifiedVideoRequest,
} from "@/lib/video-generation-service";
import {
  defaultVideoApiModelNameByMode,
  getVideoModelDefinition,
  type UnifiedVideoGenerateRequest,
  type VideoGenerationModeId,
  type VideoModelId,
} from "@/lib/video-workspace";

function ctxFor(
  modelId: VideoModelId,
  request: UnifiedVideoGenerateRequest,
  overrides: Partial<Record<VideoGenerationModeId, string>> = {},
) {
  return {
    modelId,
    modelDefinition: getVideoModelDefinition(modelId),
    modelSettings: {
      id: modelId,
      label: modelId,
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      apiModelName: getVideoModelDefinition(modelId).defaultApiModelName,
      apiModelNameByMode: {
        ...defaultVideoApiModelNameByMode(modelId),
        ...overrides,
      },
      enabled: true,
      providerOptions: {},
    },
    request,
  };
}

const seedance = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "start_frame",
  prompt: "test",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/a.png" }],
  soundEnabled: false,
});
const seedancePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedance));
assert.deepEqual(seedancePayload, {
  model: "bytedance/seedance2-0-i2v",
  input: {
    prompt: "test",
    resolution: "1080p",
    aspect_ratio: "16:9",
    duration: 5,
    audio: false,
    img_urls: ["https://example.com/a.png"],
  },
});
const customSeedancePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedance, { start_frame: "custom-seedance-start" }));
assert.equal(customSeedancePayload.model, "custom-seedance-start");

const seedanceStartEnd = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "start_end_frame",
  prompt: "start end",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const seedanceStartEndPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedanceStartEnd));
assert.equal(seedanceStartEndPayload.model, "bytedance/seedance2-0-i2v");
assert.deepEqual((seedanceStartEndPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png", "https://example.com/end.png"]);

const seedance15Text = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "text_to_video",
  prompt: "test15 text",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [],
  soundEnabled: false,
});
const seedance15TextPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15Text));
assert.equal(seedance15TextPayload.model, "bytedance/seedance1-5-pro-t2v");
assert.equal((seedance15TextPayload.input as Record<string, unknown>).duration, 8);
assert.equal((seedance15TextPayload.input as Record<string, unknown>).audio, false);

const seedance15Start = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "start_frame",
  prompt: "test15 start",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const seedance15StartPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15Start));
assert.equal(seedance15StartPayload.model, "bytedance/seedance1-5-pro-i2v");
assert.deepEqual((seedance15StartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png"]);

const seedance15StartEnd = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "start_end_frame",
  prompt: "test15 start end",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const seedance15StartEndPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15StartEnd));
assert.equal(seedance15StartEndPayload.model, "bytedance/seedance1-5-pro-i2v");
assert.deepEqual((seedance15StartEndPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png", "https://example.com/end.png"]);

const seedance10Text = validateUnifiedVideoRequest({
  modelId: "doubao-seedance-1.0-pro-fast",
  modeId: "text_to_video",
  prompt: "test10 text",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
  soundEnabled: true,
});
const seedance10TextPayload = buildVideoCreatePayloadForTest(ctxFor("doubao-seedance-1.0-pro-fast", seedance10Text));
assert.equal(seedance10TextPayload.model, "bytedance/seedance1-0-pro-fast-t2v");
assert.equal((seedance10TextPayload.input as Record<string, unknown>).duration, 8);
assert.equal("audio" in (seedance10TextPayload.input as Record<string, unknown>), false);

const seedance10Start = validateUnifiedVideoRequest({
  modelId: "doubao-seedance-1.0-pro-fast",
  modeId: "start_frame",
  prompt: "test10 start",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const seedance10StartPayload = buildVideoCreatePayloadForTest(ctxFor("doubao-seedance-1.0-pro-fast", seedance10Start));
assert.equal(seedance10StartPayload.model, "bytedance/seedance1-0-pro-fast-i2v");
assert.deepEqual((seedance10StartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png"]);

const seedanceMiniText = validateUnifiedVideoRequest({
  modelId: "seedance-2.0-mini",
  modeId: "text_to_video",
  prompt: "mini text",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [],
});
const seedanceMiniTextPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0-mini", seedanceMiniText));
assert.equal(seedanceMiniTextPayload.model, "bytedance/seedance2-0-mini-t2v");
assert.equal((seedanceMiniTextPayload.input as Record<string, unknown>).resolution, "720p");

const seedance10ProStart = validateUnifiedVideoRequest({
  modelId: "seedance-1.0-pro",
  modeId: "start_frame",
  prompt: "test10 pro start",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/pro-start.png" }],
});
const seedance10ProStartPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.0-pro", seedance10ProStart));
assert.equal(seedance10ProStartPayload.model, "bytedance/seedance1-0-pro-i2v");
assert.deepEqual((seedance10ProStartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/pro-start.png"]);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "doubao-seedance-1.0-pro-fast",
      modeId: "start_end_frame",
      prompt: "bad10",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "1080p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

const klingText = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "text_to_video",
  prompt: "kling text",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
  soundEnabled: true,
});
const klingTextPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingText));
assert.deepEqual(klingTextPayload, {
  model: "kling/v3",
  input: {
    mode: "pro",
    multi_shots: false,
    prompt: "kling text",
    duration: 5,
    aspect_ratio: "16:9",
    audio: true,
  },
});
const customKlingTextPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingText, { text_to_video: "custom-kling-text" }));
assert.equal(customKlingTextPayload.model, "custom-kling-text");

const klingStart = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "start_frame",
  prompt: "kling start",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const klingStartPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingStart));
assert.equal(klingStartPayload.model, "kling/v3");
assert.deepEqual((klingStartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png"]);
assert.equal((klingStartPayload.input as Record<string, unknown>).mode, "pro");

const kling = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "start_end_frame",
  prompt: "kling",
  durationSeconds: 10,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const klingPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", kling));
assert.equal(klingPayload.model, "kling/v3");
assert.deepEqual((klingPayload.input as Record<string, unknown>).img_urls, ["https://example.com/start.png", "https://example.com/end.png"]);

const klingReference = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "multi_image_reference",
  prompt: "kling reference",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [
    { role: "image_reference", url: "https://example.com/ref.png", label: "hero" },
    { role: "image_reference", url: "https://example.com/prop.png" },
  ],
  soundEnabled: false,
});
const klingReferencePayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingReference));
assert.equal(klingReferencePayload.model, "kling/v3");
assert.deepEqual((klingReferencePayload.input as Record<string, unknown>).element_list, [
  { name: "element_1", description: "hero", element_image_urls: ["https://example.com/ref.png"] },
  { name: "element_2", description: "reference image 2", element_image_urls: ["https://example.com/prop.png"] },
]);
assert.equal("video_url" in (klingReferencePayload.input as Record<string, unknown>), false);
assert.equal("image_urls" in (klingReferencePayload.input as Record<string, unknown>), false);

const happyHorse11Text = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "text_to_video",
  prompt: "happyhorse 1.1 text",
  durationSeconds: 6,
  aspectRatio: "4:5",
  resolution: "1080p",
  references: [],
});
const happyHorse11TextPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Text));
assert.deepEqual(happyHorse11TextPayload, {
  model: "happyhorse-1-1-t2v",
  input: {
    prompt: "happyhorse 1.1 text",
    resolution: "1080P",
    duration: 6,
    aspect_ratio: "4:5",
  },
});
const customHappyHorsePayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Text, { text_to_video: "custom-happyhorse-text" }));
assert.equal(customHappyHorsePayload.model, "custom-happyhorse-text");

const happyHorse11Start = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "start_frame",
  prompt: "happyhorse 1.1 start",
  durationSeconds: 6,
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/hh11.png" }],
});
const happyHorse11StartPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Start));
assert.equal(happyHorse11StartPayload.model, "happyhorse-1-1-i2v");
assert.deepEqual((happyHorse11StartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/hh11.png"]);
assert.equal("aspect_ratio" in (happyHorse11StartPayload.input as Record<string, unknown>), false);

const happyHorse11Reference = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "multi_image_reference",
  prompt: "character1 and character2 walk through a city",
  durationSeconds: 6,
  aspectRatio: "9:16",
  resolution: "720p",
  references: [
    { role: "image_reference", url: "https://example.com/hh11-a.png" },
    { role: "image_reference", url: "https://example.com/hh11-b.png" },
  ],
});
const happyHorse11ReferencePayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Reference));
assert.equal(happyHorse11ReferencePayload.model, "happyhorse-1-1-r2v");
assert.deepEqual((happyHorse11ReferencePayload.input as Record<string, unknown>).img_urls, ["https://example.com/hh11-a.png", "https://example.com/hh11-b.png"]);
assert.equal((happyHorse11ReferencePayload.input as Record<string, unknown>).aspect_ratio, "9:16");
assert.equal((happyHorse11ReferencePayload.input as Record<string, unknown>).duration, 6);

const happyHorse10Text = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "text_to_video",
  prompt: "happyhorse 1.0 text",
  durationSeconds: 6,
  aspectRatio: "5:4",
  resolution: "720p",
  references: [],
});
const happyHorse10TextPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Text));
assert.equal(happyHorse10TextPayload.model, "happyhorse-1-0-t2v");
assert.equal((happyHorse10TextPayload.input as Record<string, unknown>).aspect_ratio, "5:4");

const happyHorse10Start = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "start_frame",
  prompt: "happyhorse 1.0 start",
  durationSeconds: 6,
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/hh10.png" }],
});
const happyHorse10StartPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Start));
assert.equal(happyHorse10StartPayload.model, "happyhorse-1-0-i2v");
assert.deepEqual((happyHorse10StartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/hh10.png"]);

const happyHorse10Reference = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "multi_image_reference",
  prompt: "character1 wears character2",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/hh10-a.png" },
    { role: "image_reference", url: "https://example.com/hh10-b.png" },
  ],
});
const happyHorse10ReferencePayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Reference));
assert.equal(happyHorse10ReferencePayload.model, "happyhorse-1-0-r2v");
assert.deepEqual((happyHorse10ReferencePayload.input as Record<string, unknown>).img_urls, ["https://example.com/hh10-a.png", "https://example.com/hh10-b.png"]);

const happyHorse10Edit = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "video_edit",
  prompt: "replace the outfit with the reference image",
  durationSeconds: 0,
  resolution: "720p",
  references: [
    { role: "video_reference", url: "https://example.com/source.mp4" },
    { role: "image_reference", url: "https://example.com/style.png" },
  ],
  soundEnabled: true,
});
const happyHorse10EditPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Edit));
assert.equal(happyHorse10EditPayload.model, "happyhorse-1-0-video-edit");
assert.deepEqual((happyHorse10EditPayload.input as Record<string, unknown>).video_url, "https://example.com/source.mp4");
assert.deepEqual((happyHorse10EditPayload.input as Record<string, unknown>).img_urls, ["https://example.com/style.png"]);
assert.equal("duration" in (happyHorse10EditPayload.input as Record<string, unknown>), false);
assert.equal("aspect_ratio" in (happyHorse10EditPayload.input as Record<string, unknown>), false);
assert.equal((happyHorse10EditPayload.input as Record<string, unknown>).audio_setting, "origin");

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.1",
      modeId: "start_end_frame",
      prompt: "bad happyhorse",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.1",
      modeId: "video_edit",
      prompt: "bad happyhorse edit",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.0",
      modeId: "multi_image_reference",
      prompt: "bad happyhorse reference",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/ref.mp4" }],
    }),
  /图片参考/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "kling-3.0",
      modeId: "video_edit",
      prompt: "bad edit",
      durationSeconds: 0,
      resolution: "1080p",
      references: [],
    }),
  /不支持/,
);

const klingMotion = validateUnifiedVideoRequest({
  modelId: "kling-3.0-motion",
  modeId: "motion_control",
  prompt: "motion",
  durationSeconds: 0,
  resolution: "1080p",
  soundEnabled: false,
  references: [
    { role: "start_frame", url: "https://example.com/character.png" },
    { role: "motion_source_video", url: "https://example.com/motion.mp4" },
  ],
});
const klingMotionPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0-motion", klingMotion));
assert.deepEqual(klingMotionPayload, {
  model: "kling/v3-motion-control",
  input: {
    img_urls: ["https://example.com/character.png"],
    video_urls: ["https://example.com/motion.mp4"],
    character_orientation: "image",
    prompt: "motion",
    mode: "pro",
    keep_original_sound: false,
  },
});

const kling26Motion = validateUnifiedVideoRequest({
  modelId: "kling-2.6-motion",
  modeId: "motion_control",
  prompt: "motion 26",
  durationSeconds: 0,
  resolution: "720p",
  references: [
    { role: "start_frame", url: "https://example.com/character-26.png" },
    { role: "motion_source_video", url: "https://example.com/motion-26.mp4" },
  ],
});
const kling26MotionPayload = buildVideoCreatePayloadForTest(ctxFor("kling-2.6-motion", kling26Motion));
assert.equal(kling26MotionPayload.model, "kling/v2-6-motion-control");
assert.deepEqual((kling26MotionPayload.input as Record<string, unknown>).img_urls, ["https://example.com/character-26.png"]);
assert.deepEqual((kling26MotionPayload.input as Record<string, unknown>).video_urls, ["https://example.com/motion-26.mp4"]);
assert.equal((kling26MotionPayload.input as Record<string, unknown>).keep_original_sound, true);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "kling-2.6-motion",
      modeId: "motion_control",
      prompt: "bad motion",
      durationSeconds: 0,
      resolution: "720p",
      references: [{ role: "motion_source_video", url: "https://example.com/motion.mp4" }],
    }),
  /主体参考图/,
);

const allPurpose = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "multi_image_reference",
  prompt: "all purpose",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/1.png" },
    { role: "video_reference", url: "https://example.com/ref.mp4" },
    { role: "audio_reference", url: "https://example.com/ref.mp3" },
  ],
});
const allPurposePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", allPurpose));
assert.deepEqual(allPurposePayload.model, "bytedance/seedance2-0-r2v");
assert.deepEqual((allPurposePayload.input as Record<string, unknown>).reference_images, ["https://example.com/1.png"]);
assert.deepEqual((allPurposePayload.input as Record<string, unknown>).reference_videos, ["https://example.com/ref.mp4"]);
assert.deepEqual((allPurposePayload.input as Record<string, unknown>).reference_audios, ["https://example.com/ref.mp3"]);

const grokText = validateUnifiedVideoRequest({
  modelId: "grok-imagine",
  modeId: "text_to_video",
  prompt: "a robot paints a sunset",
  durationSeconds: 6,
  aspectRatio: "3:2",
  resolution: "480p",
  references: [],
  grokImagineMode: "fun",
});
const grokTextPayload = buildVideoCreatePayloadForTest(ctxFor("grok-imagine", grokText));
assert.equal(grokTextPayload.model, "grok-imagine/t2v");
assert.equal((grokTextPayload.input as Record<string, unknown>).duration, 6);
assert.equal((grokTextPayload.input as Record<string, unknown>).aspect_ratio, "3:2");
assert.equal((grokTextPayload.input as Record<string, unknown>).resolution, "480p");
assert.equal((grokTextPayload.input as Record<string, unknown>).mode, "fun");
assert.equal("generate_audio" in (grokTextPayload.input as Record<string, unknown>), false);
assert.equal("sound" in (grokTextPayload.input as Record<string, unknown>), false);
const customGrokTextPayload = buildVideoCreatePayloadForTest(ctxFor("grok-imagine", grokText, { text_to_video: "custom-grok-text" }));
assert.equal(customGrokTextPayload.model, "custom-grok-text");
assert.deepEqual(customGrokTextPayload, {
  model: "custom-grok-text",
  input: {
    prompt: "a robot paints a sunset",
    duration: 6,
    resolution: "480p",
    aspect_ratio: "3:2",
    mode: "fun",
  },
});

const grokStart = validateUnifiedVideoRequest({
  modelId: "grok-imagine",
  modeId: "start_frame",
  prompt: "the person starts dancing",
  durationSeconds: 8,
  aspectRatio: "auto",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/grok.png" }],
  grokImagineMode: "normal",
});
const grokStartPayload = buildVideoCreatePayloadForTest(ctxFor("grok-imagine", grokStart));
assert.equal(grokStartPayload.model, "grok-imagine-video-1.5-preview");
assert.deepEqual((grokStartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/grok.png"]);
assert.equal((grokStartPayload.input as Record<string, unknown>).aspect_ratio, "auto");
assert.equal("mode" in (grokStartPayload.input as Record<string, unknown>), false);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "multi_image_reference",
      prompt: "bad grok multi image reference",
      durationSeconds: 12,
      aspectRatio: "2:3",
      resolution: "720p",
      references: [
        { role: "image_reference", url: "https://example.com/grok-a.png" },
        { role: "image_reference", url: "https://example.com/grok-b.png" },
      ],
      grokImagineMode: "spicy",
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "start_end_frame",
      prompt: "bad grok start end",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "480p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "video_edit",
      prompt: "bad grok edit",
      durationSeconds: 0,
      resolution: "480p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

const veoText = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "text_to_video",
  prompt: "veo text",
  durationSeconds: 4,
  aspectRatio: "auto",
  resolution: "720p",
  references: [],
  soundEnabled: false,
});
const veoTextPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoText));
assert.deepEqual(veoTextPayload, {
  model: "google/veo3-1-t2v",
  input: {
    prompt: "veo text",
    duration: 4,
    aspect_ratio: "16:9",
    resolution: "720p",
    translate_prompt: true,
  },
});
const customVeoTextPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoText, { text_to_video: "custom-veo-text" }));
assert.equal(customVeoTextPayload.model, "custom-veo-text");

const veoFastText = validateUnifiedVideoRequest({
  modelId: "veo-3.1-fast",
  modeId: "text_to_video",
  prompt: "veo fast text",
  durationSeconds: 6,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
});
const veoFastTextPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1-fast", veoFastText));
assert.equal(veoFastTextPayload.model, "google/veo3-1-fast-t2v");
assert.equal((veoFastTextPayload.input as Record<string, unknown>).aspect_ratio, "16:9");

const veoStart = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "start_frame",
  prompt: "veo start",
  durationSeconds: 4,
  aspectRatio: "auto",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/veo-start.png" }],
});
const veoStartPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoStart));
assert.equal(veoStartPayload.model, "google/veo3-1-i2v");
assert.deepEqual((veoStartPayload.input as Record<string, unknown>).img_urls, ["https://example.com/veo-start.png"]);

const veoStartEnd = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "start_end_frame",
  prompt: "veo start end",
  durationSeconds: 8,
  aspectRatio: "9:16",
  resolution: "4k",
  references: [
    { role: "start_frame", url: "https://example.com/veo-start.png" },
    { role: "end_frame", url: "https://example.com/veo-end.png" },
  ],
});
const veoStartEndPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoStartEnd));
assert.equal(veoStartEndPayload.model, "google/veo3-1-i2v");
assert.deepEqual((veoStartEndPayload.input as Record<string, unknown>).img_urls, ["https://example.com/veo-start.png", "https://example.com/veo-end.png"]);

const veoReference = validateUnifiedVideoRequest({
  modelId: "veo-3.1-fast",
  modeId: "multi_image_reference",
  prompt: "veo reference",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/veo-1.png" },
    { role: "image_reference", url: "https://example.com/veo-2.png" },
  ],
  soundEnabled: true,
});
const veoReferencePayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1-fast", veoReference));
assert.equal(veoReferencePayload.model, "google/veo3-1-fast-r2v");
assert.deepEqual((veoReferencePayload.input as Record<string, unknown>).img_urls, ["https://example.com/veo-1.png", "https://example.com/veo-2.png"]);
assert.equal((veoReferencePayload.input as Record<string, unknown>).duration, 8);
assert.equal((veoReferencePayload.input as Record<string, unknown>).aspect_ratio, "16:9");

const veoLiteReference = validateUnifiedVideoRequest({
  modelId: "veo-3.1-lite",
  modeId: "multi_image_reference",
  prompt: "veo lite reference",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "image_reference", url: "https://example.com/lite.png" }],
});
const veoLiteReferencePayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1-lite", veoLiteReference));
assert.equal(veoLiteReferencePayload.model, "google/veo3-1-lite-r2v");
assert.deepEqual((veoLiteReferencePayload.input as Record<string, unknown>).img_urls, ["https://example.com/lite.png"]);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "veo-3.1-fast",
      modeId: "multi_image_reference",
      prompt: "bad veo video ref",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/ref.mp4" }],
    }),
  /Veo 3.1/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "veo-3.1",
      modeId: "multi_image_reference",
      prompt: "bad ordinary veo r2v",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "image_reference", url: "https://example.com/ref.png" }],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "veo-3.1",
      modeId: "video_edit",
      prompt: "bad veo edit",
      durationSeconds: 0,
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "seedance-2.0",
      modeId: "start_end_frame",
      prompt: "bad",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "1080p",
      references: [],
    }),
  /需要 1 张首帧图和 1 张尾帧图/,
);

assert.throws(
  () => buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedance, { start_frame: "" })),
  /网站内部视频 API 暂未配置完整/,
);

const omniPayload = buildVideoCreatePayloadForTest(
  ctxFor("gemini-omni", validateUnifiedVideoRequest({
    modelId: "gemini-omni",
    modeId: "multi_image_reference",
    prompt: "omni",
    durationSeconds: 6,
    aspectRatio: "16:9",
    resolution: "720p",
    references: [
      { role: "image_reference", url: "https://example.com/omni.png" },
      { role: "video_reference", url: "https://example.com/omni.mp4" },
    ],
  })),
);
assert.deepEqual(omniPayload, {
  model: "google/gemini-omni",
  input: {
    prompt: "omni",
    duration: 6,
    aspect_ratio: "16:9",
    resolution: "720p",
    img_urls: ["https://example.com/omni.png"],
    video_list: [{ url: "https://example.com/omni.mp4", start: 0, ends: 6 }],
  },
});

console.log("video generation service smoke: ok");
