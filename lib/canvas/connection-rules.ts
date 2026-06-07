import type { CanvasConnection, CanvasNode, CanvasTargetPort } from "@/lib/canvas/types";

export const CANVAS_SOURCE_PORT = "output" as const;

export const TARGET_PORT_LABELS: Record<CanvasTargetPort, string> = {
  source: "来源",
  prompt: "提示词",
  imageReference: "参考图",
  firstFrame: "首帧",
  lastFrame: "尾帧",
  videoReference: "视频参考",
  audioReference: "音频参考",
};

export function getTargetPorts(node: CanvasNode): CanvasTargetPort[] {
  switch (node.type) {
    case "text":
      return node.metadata?.textMode === "chat" ? ["prompt"] : [];
    case "audio":
      return [];
    case "image":
      return node.metadata?.source === "upload" ? [] : ["prompt", "imageReference"];
    case "video": {
      if (node.metadata?.source === "upload") return [];
      const mode = node.metadata?.videoModeId ?? "start_end_frame";
      const normalizedMode =
        mode === "multi_image_reference" || mode === "motion_control" || mode === "text_to_video"
          ? mode
          : "start_end_frame";
      switch (normalizedMode) {
        case "text_to_video":
          return ["prompt"];
        case "start_end_frame":
          return ["prompt", "firstFrame", "lastFrame"];
        case "multi_image_reference":
          return ["prompt", "imageReference", "videoReference", "audioReference"];
        case "motion_control":
          return ["prompt", "firstFrame", "videoReference"];
        default:
          return ["prompt"];
      }
    }
    default:
      return [];
  }
}

export function canStartConnection(node: CanvasNode): boolean {
  return node.type !== "group";
}

export function isConnectionAllowed(from: CanvasNode, to: CanvasNode, targetPort: CanvasTargetPort): boolean {
  if (from.id === to.id || from.type === "group" || to.type === "group") return false;
  if (targetPort === "source") return true;
  if (!getTargetPorts(to).includes(targetPort)) return false;
  if (targetPort === "prompt") return from.type === "text";
  if (targetPort === "imageReference") return from.type === "image";
  if (targetPort === "firstFrame" || targetPort === "lastFrame") return from.type === "image";
  if (targetPort === "videoReference") return from.type === "video";
  if (targetPort === "audioReference") return from.type === "audio";
  return false;
}

export function connectionExists(
  connections: CanvasConnection[],
  fromNodeId: string,
  toNodeId: string,
  targetPort: CanvasTargetPort
): boolean {
  return connections.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId && conn.targetPort === targetPort);
}

export function inferTargetPort(
  from: CanvasNode,
  to: CanvasNode,
  connections: CanvasConnection[] = []
): { targetPort: CanvasTargetPort | null; reason?: string } {
  if (from.id === to.id) return { targetPort: null, reason: "不能连接到自身" };
  if (from.type === "group" || to.type === "group") return { targetPort: null, reason: "素材组暂不参与连线" };

  if (to.type === "text") {
    if (to.metadata?.textMode !== "chat") return { targetPort: null, reason: "手写文本节点不接收输入" };
    if (from.type !== "text") return { targetPort: null, reason: "对话文本节点只接收文本上下文" };
    return connectionExists(connections, from.id, to.id, "prompt")
      ? { targetPort: null, reason: "该文本上下文已连接" }
      : { targetPort: "prompt" };
  }

  if (to.type === "image" && to.metadata?.source !== "upload") {
    const targetPort = from.type === "text" ? "prompt" : from.type === "image" ? "imageReference" : null;
    if (!targetPort) return { targetPort: null, reason: "图片节点只接受文本提示词或图片参考" };
    return connectionExists(connections, from.id, to.id, targetPort)
      ? { targetPort: null, reason: `${TARGET_PORT_LABELS[targetPort]}已连接` }
      : { targetPort };
  }

  if (to.type === "video" && to.metadata?.source !== "upload") {
    const videoModeId = to.metadata?.videoModeId ?? "text_to_video";
    const normalizedMode =
      videoModeId === "multi_image_reference" || videoModeId === "motion_control" || videoModeId === "text_to_video"
        ? videoModeId
        : "start_end_frame";
    if (from.type === "text") {
      return connectionExists(connections, from.id, to.id, "prompt")
        ? { targetPort: null, reason: "提示词已连接" }
        : { targetPort: "prompt" };
    }
    if (from.type === "image") {
      if (normalizedMode === "start_end_frame") {
        if (!connections.some((conn) => conn.toNodeId === to.id && conn.targetPort === "firstFrame")) return { targetPort: "firstFrame" };
        if (!connections.some((conn) => conn.toNodeId === to.id && conn.targetPort === "lastFrame")) return { targetPort: "lastFrame" };
        return { targetPort: null, reason: "首帧和尾帧已占用" };
      }
      if (normalizedMode === "multi_image_reference") {
        return connectionExists(connections, from.id, to.id, "imageReference")
          ? { targetPort: null, reason: "该参考图已连接" }
          : { targetPort: "imageReference" };
      }
      if (normalizedMode === "motion_control") {
        return connectionExists(connections, from.id, to.id, "firstFrame")
          ? { targetPort: null, reason: "主体首帧已连接" }
          : { targetPort: "firstFrame" };
      }
      return { targetPort: null, reason: "当前视频模式不接收图片输入" };
    }
    if (from.type === "video") {
      if (normalizedMode !== "motion_control" && normalizedMode !== "multi_image_reference") {
        return { targetPort: null, reason: "当前视频模式不接收视频参考" };
      }
      return connectionExists(connections, from.id, to.id, "videoReference")
        ? { targetPort: null, reason: "视频参考已连接" }
        : { targetPort: "videoReference" };
    }
    if (from.type === "audio") {
      if (normalizedMode !== "multi_image_reference") {
        return { targetPort: null, reason: "当前视频模式不接收音频参考" };
      }
      return connectionExists(connections, from.id, to.id, "audioReference")
        ? { targetPort: null, reason: "音频参考已连接" }
        : { targetPort: "audioReference" };
    }
    return { targetPort: null, reason: "视频节点只接受文本、图片、视频或音频输入" };
  }

  return { targetPort: null, reason: "目标节点不能接收输入" };
}

export function normalizeConnectionPorts(
  conn: Pick<CanvasConnection, "id" | "fromNodeId" | "toNodeId"> & Partial<CanvasConnection>,
  from: CanvasNode,
  to: CanvasNode,
  existing: CanvasConnection[] = []
): CanvasConnection | null {
  const explicitPort = conn.targetPort && isConnectionAllowed(from, to, conn.targetPort) ? conn.targetPort : null;
  const targetPort = explicitPort ?? inferTargetPort(from, to, existing).targetPort ?? "source";
  if (!isConnectionAllowed(from, to, targetPort)) return null;
  return {
    id: conn.id,
    fromNodeId: conn.fromNodeId,
    toNodeId: conn.toNodeId,
    sourcePort: CANVAS_SOURCE_PORT,
    targetPort,
  };
}

export function makeCanvasConnection(id: string, fromNodeId: string, toNodeId: string, targetPort: CanvasTargetPort): CanvasConnection {
  return { id, fromNodeId, toNodeId, sourcePort: CANVAS_SOURCE_PORT, targetPort };
}
