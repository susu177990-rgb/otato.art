"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
  type MenuRenderFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { $createAssetMentionNode, $isAssetMentionNode, AssetMentionNode } from "./AssetMentionNode";
import {
  assetMentionKey,
  parseAssetMentions,
  serializeAssetMention,
  type AssetMentionCandidate,
} from "@/lib/asset-mentions";
import styles from "./AssetMentionEditor.module.css";

type AssetMentionEditorProps = {
  value: string;
  onValueChange: (value: string) => void;
  candidates: AssetMentionCandidate[];
  className?: string;
  placeholderClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  readOnly?: boolean;
};

function EditablePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
}

class AssetMentionOption extends MenuOption {
  candidate?: AssetMentionCandidate;
  emptyLabel?: string;

  constructor(candidate: AssetMentionCandidate | null, emptyLabel?: string) {
    super(candidate ? assetMentionKey(candidate) : "__asset-mention-empty__");
    this.candidate = candidate ?? undefined;
    this.emptyLabel = emptyLabel;
  }

  get disabled() {
    return !this.candidate;
  }
}

function matchCandidate(candidate: AssetMentionCandidate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [candidate.label, candidate.groupLabel, candidate.description]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(q));
}

function buildOptions(candidates: AssetMentionCandidate[], query: string | null): AssetMentionOption[] {
  const filtered = candidates.filter((candidate) => matchCandidate(candidate, query ?? ""));
  if (filtered.length === 0) {
    return [new AssetMentionOption(null, candidates.length === 0 ? "没有可引用素材，先上传或连线素材" : "没有匹配的素材")];
  }
  return filtered.map((candidate) => new AssetMentionOption(candidate));
}

function textForNode(node: LexicalNode): string {
  if ($isAssetMentionNode(node)) return serializeAssetMention(node.getAssetMention());
  if ($isLineBreakNode(node)) return "\n";
  if ($isElementNode(node)) {
    return node
      .getChildren()
      .map((child) => textForNode(child))
      .join("");
  }
  return node.getTextContent();
}

function serializeEditorState(editorState: EditorState): string {
  let value = "";
  editorState.read(() => {
    value = $getRoot()
      .getChildren()
      .map((child) => textForNode(child))
      .join("\n");
  });
  return value;
}

function appendValueToRoot(value: string) {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  let cursor = 0;
  for (const mention of parseAssetMentions(value)) {
    if (mention.index > cursor) {
      paragraph.append($createTextNode(value.slice(cursor, mention.index)));
    }
    paragraph.append($createAssetMentionNode(mention));
    cursor = mention.index + mention.raw.length;
  }
  if (cursor < value.length) {
    paragraph.append($createTextNode(value.slice(cursor)));
  }
  root.append(paragraph);
}

function SyncExternalValuePlugin({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();
  const lastAppliedRef = useRef(value);

  useEffect(() => {
    if (value === lastAppliedRef.current) return;
    const current = serializeEditorState(editor.getEditorState());
    if (current === value) {
      lastAppliedRef.current = value;
      return;
    }
    editor.update(() => {
      appendValueToRoot(value);
    });
    lastAppliedRef.current = value;
  }, [editor, value]);

  return null;
}

function AssetMentionTypeaheadPlugin({ candidates }: { candidates: AssetMentionCandidate[] }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const triggerMatch = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 48,
    allowWhitespace: false,
  });
  const options = useMemo(() => buildOptions(candidates, query), [candidates, query]);

  const onSelectOption = useCallback(
    (option: AssetMentionOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      if (option.disabled || !option.candidate) {
        closeMenu();
        return;
      }
      const candidate = option.candidate;
      editor.update(() => {
        const mentionNode = $createAssetMentionNode(candidate);
        if (nodeToReplace) {
          nodeToReplace.replace(mentionNode);
        } else {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([mentionNode]);
          }
        }
        mentionNode.insertAfter($createTextNode(" "));
        mentionNode.selectNext();
        closeMenu();
      });
    },
    [editor],
  );

  const renderMenu: MenuRenderFn<AssetMentionOption> = useCallback(
    (anchorRef, { options: visibleOptions, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
      if (!anchorRef.current || visibleOptions.length === 0) return null;
      return createPortal(
        <div className={styles.menu}>
          {visibleOptions.map((option, index) => {
            const candidate = option.candidate;
            const active = selectedIndex === index;
            if (!candidate) {
              return (
                <div key={option.key} className={[styles.option, styles.optionDisabled].join(" ")}>
                  <span className={styles.optionLabel}>{option.emptyLabel}</span>
                </div>
              );
            }
            return (
              <button
                key={option.key}
                ref={option.setRefElement}
                type="button"
                className={[styles.option, active ? styles.optionActive : ""].filter(Boolean).join(" ")}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => {
                  setHighlightedIndex(index);
                  selectOptionAndCleanUp(option);
                }}
              >
                <span className={styles.optionLabel}>@{candidate.label}</span>
              </button>
            );
          })}
        </div>,
        anchorRef.current,
      );
    },
    [],
  );

  return (
    <LexicalTypeaheadMenuPlugin<AssetMentionOption>
      triggerFn={triggerMatch}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      menuRenderFn={renderMenu}
      anchorClassName={styles.menuAnchor}
      ignoreEntityBoundary
    />
  );
}

function ValuePlugin({ onValueChange }: { onValueChange: (value: string) => void }) {
  const onChange = useCallback(
    (editorState: EditorState) => {
      onValueChange(serializeEditorState(editorState));
    },
    [onValueChange],
  );
  return <OnChangePlugin onChange={onChange} ignoreSelectionChange />;
}

function editorConfig(value: string) {
  return {
    namespace: "AssetMentionEditor",
    nodes: [AssetMentionNode],
    theme: {
      text: {
        assetMention: "assetMentionToken",
      },
    },
    onError(error: Error) {
      throw error;
    },
    editorState(editor: LexicalEditor) {
      editor.update(() => {
        appendValueToRoot(value);
      });
    },
  };
}

export function AssetMentionEditor({
  value,
  onValueChange,
  candidates,
  className,
  placeholderClassName,
  placeholder,
  onPointerDown,
  "aria-label": ariaLabel,
  readOnly = false,
}: AssetMentionEditorProps) {
  const [initialConfig] = useState(() => ({ ...editorConfig(value), editable: !readOnly }));
  return (
    <div className={styles.editorShell} onPointerDown={onPointerDown}>
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable className={[className, styles.editorInput].filter(Boolean).join(" ")} aria-label={ariaLabel} />}
          placeholder={placeholder ? <div className={[styles.placeholder, placeholderClassName].filter(Boolean).join(" ")}>{placeholder}</div> : null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ValuePlugin onValueChange={onValueChange} />
        <SyncExternalValuePlugin value={value} />
        <AssetMentionTypeaheadPlugin candidates={candidates} />
        <EditablePlugin editable={!readOnly} />
      </LexicalComposer>
    </div>
  );
}

export default AssetMentionEditor;
