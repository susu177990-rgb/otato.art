import {
  $applyNodeReplacement,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
} from "lexical";
import type { AssetMentionCandidate, AssetMentionRole, AssetMentionType } from "@/lib/asset-mentions";

export type SerializedAssetMentionNode = SerializedTextNode & {
  type: "asset-mention";
  assetType: AssetMentionType;
  assetId: string;
  assetRole?: AssetMentionRole;
  label: string;
  version: 1;
};

export class AssetMentionNode extends TextNode {
  __assetType: AssetMentionType;
  __assetId: string;
  __assetRole?: AssetMentionRole;
  __label: string;

  static getType(): string {
    return "asset-mention";
  }

  static clone(node: AssetMentionNode): AssetMentionNode {
    return new AssetMentionNode(node.__label, node.__assetType, node.__assetId, node.__assetRole, node.__key);
  }

  static importJSON(serializedNode: SerializedAssetMentionNode): AssetMentionNode {
    return $createAssetMentionNode({
      label: serializedNode.label,
      type: serializedNode.assetType,
      id: serializedNode.assetId,
      role: serializedNode.assetRole,
    }).updateFromJSON(serializedNode);
  }

  constructor(label: string, assetType: AssetMentionType, assetId: string, assetRole?: AssetMentionRole, key?: NodeKey) {
    super(`@${label}`, key);
    this.__assetType = assetType;
    this.__assetId = assetId;
    this.__assetRole = assetRole;
    this.__label = label;
    this.__mode = 1;
    this.__detail = 2;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.classList.add("assetMentionToken");
    element.dataset.assetMentionType = this.__assetType;
    element.dataset.assetMentionId = this.__assetId;
    if (this.__assetRole) element.dataset.assetMentionRole = this.__assetRole;
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const needsTextUpdate = super.updateDOM(prevNode, dom, config);
    dom.dataset.assetMentionType = this.__assetType;
    dom.dataset.assetMentionId = this.__assetId;
    if (this.__assetRole) dom.dataset.assetMentionRole = this.__assetRole;
    else delete dom.dataset.assetMentionRole;
    return needsTextUpdate;
  }

  exportJSON(): SerializedAssetMentionNode {
    return {
      ...super.exportJSON(),
      type: "asset-mention",
      assetType: this.__assetType,
      assetId: this.__assetId,
      assetRole: this.__assetRole,
      label: this.__label,
      version: 1,
    };
  }

  getAssetMention(): AssetMentionCandidate {
    return {
      id: this.__assetId,
      label: this.__label,
      type: this.__assetType,
      role: this.__assetRole,
    };
  }

  getTextContent(): string {
    return `@${this.__label}`;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createAssetMentionNode(candidate: Pick<AssetMentionCandidate, "label" | "type" | "id" | "role">): AssetMentionNode {
  return $applyNodeReplacement(new AssetMentionNode(candidate.label, candidate.type, candidate.id, candidate.role));
}

export function $isAssetMentionNode(node: LexicalNode | null | undefined): node is AssetMentionNode {
  return node instanceof AssetMentionNode;
}
