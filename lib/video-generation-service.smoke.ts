import assert from "node:assert/strict";
import {
  buildVideoCreatePayloadForTest,
  validateUnifiedVideoRequest,
} from "@/lib/video-generation-service";
import { getVideoModelDefinition, type UnifiedVideoGenerateRequest, type VideoModelId } from "@/lib/video-workspace";

function ctxFor(modelId: VideoModelId, request: UnifiedVideoGenerateRequest) {
  return {
    modelId,
    modelDefinition: getVideoModelDefinition(modelId),
    modelSettings: {
      id: modelId,
      label: modelId,
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      apiModelName: getVideoModelDefinition(modelId).defaultApiModelName,
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
});
const seedancePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedance));
assert.deepEqual(seedancePayload, {
  prompt: "test",
  aspect_ratio: "16:9",
  duration: 5,
  model: "seedance-2.0",
  images: ["https://example.com/a.png"],
});

const seedance15 = validateUnifiedVideoRequest({
  modelId: "seedance-1.5",
  modeId: "start_frame",
  prompt: "test15",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const seedance15Payload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5", seedance15));
assert.equal(seedance15Payload.duration, "8");
assert.deepEqual(seedance15Payload.image_urls, ["https://example.com/start.png"]);

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
assert.equal(klingPayload.model_name, "kling-v3");
assert.equal(klingPayload.start_frame_url, "https://example.com/start.png");
assert.equal(klingPayload.end_frame_url, "https://example.com/end.png");

const klingMotion = validateUnifiedVideoRequest({
  modelId: "kling-2.6-motion",
  modeId: "motion_control",
  prompt: "motion",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "motion_source_video", url: "https://example.com/motion.mp4" }],
});
const klingMotionPayload = buildVideoCreatePayloadForTest(ctxFor("kling-2.6-motion", klingMotion));
assert.equal(klingMotionPayload.motion_video_url, "https://example.com/motion.mp4");

const veo = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "multi_image_reference",
  prompt: "veo",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/1.png" },
    { role: "image_reference", url: "https://example.com/2.png" },
  ],
});
const veoPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veo));
assert.equal(veoPayload.model, "veo-3.1-generate-001");
assert.deepEqual(veoPayload.referenceImages, [
  { imageUri: "https://example.com/1.png" },
  { imageUri: "https://example.com/2.png" },
]);

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
  /不支持/,
);

const omniPayload = buildVideoCreatePayloadForTest(
  ctxFor("gemini-omni", {
    modelId: "gemini-omni",
    modeId: "text_to_video",
    prompt: "omni",
    durationSeconds: 4,
    aspectRatio: "16:9",
    resolution: "720p",
    references: [],
  }),
);
assert.equal(omniPayload.contractState, "pending");

console.log("video generation service smoke: ok");
