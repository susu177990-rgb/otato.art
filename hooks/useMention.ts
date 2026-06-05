import { useState, useRef, useCallback } from "react";

export type MentionCandidate = {
  id: string;
  name: string;
  type: "gallery" | "node";
  subType?: string; // e.g. "image" | "text" | "video"
  imageUrl?: string;
  text?: string;
};

export function useMention({
  value,
  onChange,
  candidates,
}: {
  value: string;
  onChange: (val: string) => void;
  candidates: MentionCandidate[];
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 检查当前光标位置是否处于输入 @ 的状态
  const checkMention = useCallback((textarea: HTMLTextAreaElement) => {
    const text = textarea.value;
    const selStart = textarea.selectionStart;
    const beforeCursor = text.slice(0, selStart);

    // 查找光标前最近的一个 '@'
    const lastAtIdx = beforeCursor.lastIndexOf("@");
    if (lastAtIdx === -1) {
      setShowDropdown(false);
      return;
    }

    // 确保 '@' 之前是空格、换行或开头，且从 '@' 到光标之间没有空格或换行
    const charBeforeAt = lastAtIdx > 0 ? beforeCursor[lastAtIdx - 1] : "";
    const isTriggerPrefix = lastAtIdx === 0 || /\s/.test(charBeforeAt);
    const textBetween = beforeCursor.slice(lastAtIdx + 1);

    if (isTriggerPrefix && !/\s/.test(textBetween)) {
      setShowDropdown(true);
      setSearchQuery(textBetween.toLowerCase());
      setTriggerIndex(lastAtIdx);
      setSelectedIdx(0);
    } else {
      setShowDropdown(false);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      checkMention(e.target);
    },
    [onChange, checkMention],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        checkMention(e.currentTarget);
      }
    },
    [checkMention],
  );

  const insertMention = useCallback(
    (item: MentionCandidate) => {
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      const text = textarea.value;
      const selStart = textarea.selectionStart;

      const before = text.slice(0, triggerIndex);
      const after = text.slice(selStart);
      const insertText = `@[${item.name}](${item.type}:${item.id}) `;
      const newValue = before + insertText + after;

      onChange(newValue);
      setShowDropdown(false);

      // 异步恢复焦点，并将光标移动到插入字符之后
      setTimeout(() => {
        textarea.focus();
        const cursorPosition = triggerIndex + insertText.length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      }, 0);
    },
    [triggerIndex, onChange],
  );

  // 过滤出匹配的选项
  const filteredCandidates = candidates.filter((c) =>
    c.name.toLowerCase().includes(searchQuery),
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown || filteredCandidates.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % filteredCandidates.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertMention(filteredCandidates[selectedIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
      }
    },
    [showDropdown, filteredCandidates, selectedIdx, insertMention],
  );

  const handleBlur = useCallback(() => {
    // 延迟关闭以允许点击下拉框项
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  }, []);

  return {
    textareaRef,
    showDropdown,
    selectedIdx,
    filteredCandidates,
    setSelectedIdx,
    handleChange,
    handleKeyDown,
    handleKeyUp,
    handleBlur,
    insertMention,
  };
}
