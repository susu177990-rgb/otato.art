import assert from "node:assert/strict";
import {
  canStartConnection,
  connectionExists,
  getTargetPorts,
  inferTargetPort,
  isConnectionAllowed,
  makeCanvasConnection,
  normalizeConnectionPorts,
} from "@/lib/canvas/connection-rules";
import type { CanvasConnection, CanvasNode } from "@/lib/canvas/types";

function node(id: string, type: CanvasNode["type"], metadata?: CanvasNode["metadata"]): CanvasNode {
  return { id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 80, metadata };
}

const text = node("text", "text");
const chatText = node("chatText", "text", { textMode: "chat", chatPreviewMarkdown: "# Prompt" });
const image = node("image", "image", { source: "upload" });
const image2 = node("image2", "image");
const video = node("video", "video", { source: "upload" });
const audio = node("audio", "audio", { source: "upload" });
const imageGen = node("imageGen", "image");
const videoGen = node("videoGen", "video", { videoModeId: "start_end_frame" });
const videoPromptOnly = node("videoPromptOnly", "video", { videoModeId: "text_to_video" });
const videoRefGen = node("videoRefGen", "video", { videoModeId: "multi_image_reference" });
const motionVideoGen = node("motionVideoGen", "video", { videoModeId: "motion_control" });
const group = node("group", "group");

assert.deepEqual(getTargetPorts(imageGen), ["prompt", "imageReference"]);
assert.deepEqual(getTargetPorts(videoGen), ["prompt", "firstFrame", "lastFrame"]);
assert.deepEqual(getTargetPorts(videoPromptOnly), ["prompt"]);
assert.deepEqual(getTargetPorts(videoRefGen), ["prompt", "imageReference", "videoReference"]);
assert.deepEqual(getTargetPorts(motionVideoGen), ["prompt", "firstFrame", "videoReference"]);
assert.deepEqual(getTargetPorts(text), []);
assert.deepEqual(getTargetPorts(chatText), ["prompt"]);
assert.deepEqual(getTargetPorts(image), []);
assert.deepEqual(getTargetPorts(video), []);
assert.deepEqual(getTargetPorts(audio), []);
assert.deepEqual(getTargetPorts(group), []);

assert.equal(inferTargetPort(text, imageGen).targetPort, "prompt");
assert.equal(inferTargetPort(chatText, imageGen).targetPort, "prompt");
assert.equal(inferTargetPort(image, imageGen).targetPort, "imageReference");
assert.equal(inferTargetPort(video, imageGen).targetPort, null);
assert.equal(inferTargetPort(audio, imageGen).targetPort, null);
assert.equal(inferTargetPort(video, videoGen).targetPort, null);
assert.equal(inferTargetPort(audio, videoGen).targetPort, null);
assert.equal(inferTargetPort(video, motionVideoGen).targetPort, "videoReference");
assert.equal(inferTargetPort(image, videoRefGen).targetPort, "imageReference");
assert.equal(inferTargetPort(video, videoRefGen).targetPort, "videoReference");
assert.equal(inferTargetPort(image, videoPromptOnly).targetPort, null);
assert.equal(inferTargetPort(image, image2).targetPort, "imageReference");
assert.equal(inferTargetPort(imageGen, image).targetPort, null);
assert.equal(inferTargetPort(image, group).targetPort, null);

const firstFrame = makeCanvasConnection("c1", image.id, videoGen.id, "firstFrame");
assert.equal(inferTargetPort(imageGen, videoGen, [firstFrame]).targetPort, "lastFrame");
const lastFrame = makeCanvasConnection("c2", imageGen.id, videoGen.id, "lastFrame");
assert.equal(inferTargetPort(node("image3", "image"), videoGen, [firstFrame, lastFrame]).targetPort, null);

assert.equal(isConnectionAllowed(text, imageGen, "prompt"), true);
assert.equal(isConnectionAllowed(text, chatText, "prompt"), true);
assert.equal(isConnectionAllowed(chatText, text, "prompt"), false);
assert.equal(isConnectionAllowed(text, imageGen, "imageReference"), false);
assert.equal(isConnectionAllowed(video, motionVideoGen, "videoReference"), true);
assert.equal(isConnectionAllowed(video, videoRefGen, "videoReference"), true);
assert.equal(isConnectionAllowed(video, videoGen, "videoReference"), false);
assert.equal(isConnectionAllowed(video, imageGen, "imageReference"), false);
assert.equal(isConnectionAllowed(audio, videoRefGen, "videoReference"), false);
assert.equal(normalizeConnectionPorts({ id: "legacy3", fromNodeId: video.id, toNodeId: imageGen.id }, video, imageGen)?.targetPort, "source");
assert.equal(normalizeConnectionPorts({ id: "legacy4", fromNodeId: image.id, toNodeId: image2.id }, image, image2)?.targetPort, "imageReference");
assert.equal(isConnectionAllowed(group, imageGen, "prompt"), false);
assert.equal(canStartConnection(audio), false);
assert.equal(isConnectionAllowed(text, text, "source"), false);

const duplicate: CanvasConnection[] = [makeCanvasConnection("c3", text.id, imageGen.id, "prompt")];
assert.equal(connectionExists(duplicate, text.id, imageGen.id, "prompt"), true);
assert.equal(inferTargetPort(text, imageGen, duplicate).targetPort, null);

const legacy = normalizeConnectionPorts({ id: "legacy", fromNodeId: text.id, toNodeId: imageGen.id }, text, imageGen);
assert.deepEqual(legacy, makeCanvasConnection("legacy", text.id, imageGen.id, "prompt"));

const badExplicit = normalizeConnectionPorts(
  { id: "legacy2", fromNodeId: image.id, toNodeId: imageGen.id, sourcePort: "output", targetPort: "prompt" },
  image,
  imageGen
);
assert.deepEqual(badExplicit, makeCanvasConnection("legacy2", image.id, imageGen.id, "imageReference"));

console.log("canvas connection rules smoke: ok");
