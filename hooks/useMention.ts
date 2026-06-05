import { useState, useRef, useCallback } from "react";

export type MentionCandidate = {
  id: string;
  name: string;
  type: "slot" | "node" | "gallery";
  subType?: string;
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

  // Check cursor position for "@" mention trigger
  const checkMention = useCallback((textarea: HTMLTextAreaElement) => {
    const text = textarea.value;
    const selStart = textarea.selectionStart;
    const beforeCursor = text.slice(0, selStart);

    // Find the last '@'
    const lastAtIdx = beforeCursor.lastIndexOf("@");
    if (lastAtIdx === -1) {
      setShowDropdown(false);
      return;
    }

    const charBeforeAt = lastAtIdx > 0 ? beforeCursor[lastAtIdx - 1] : "";
    const isTriggerPrefix = lastAtIdx === 0 || /\s/.test(charBeforeAt) || charBeforeAt === '\u00A0';
    const textBetween = beforeCursor.slice(lastAtIdx + 1);

    if (isTriggerPrefix && !/\s/.test(textBetween) && !/\u200B/.test(textBetween)) {
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
      const insertText = `\u200B@${item.name}\u200B`;
      const newValue = before + insertText + after;

      onChange(newValue);
      setShowDropdown(false);

      // Async restore focus and place caret right after the mention
      setTimeout(() => {
        textarea.focus();
        const cursorPosition = triggerIndex + insertText.length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
        
        // Dispatch select event to trigger selection sync
        const selectEvent = new Event('select', { bubbles: true });
        textarea.dispatchEvent(selectEvent);
      }, 0);
    },
    [triggerIndex, onChange],
  );

  const filteredCandidates = candidates.filter((c) =>
    c.name.toLowerCase().includes(searchQuery)
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const text = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (showDropdown && filteredCandidates.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((prev) => (prev + 1) % filteredCandidates.length);
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIdx((prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          insertMention(filteredCandidates[selectedIdx]);
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      // 1. Backspace key interception (when cursor is immediately after \u200B)
      if (e.key === "Backspace" && start === end) {
        const regex = /\u200B@([^\u200B]+)\u200B/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const blockStart = match.index;
          const blockEnd = match.index + match[0].length;
          if (start === blockEnd) {
            e.preventDefault();
            const newValue = text.slice(0, blockStart) + text.slice(blockEnd);
            onChange(newValue);
            setTimeout(() => {
              textarea.setSelectionRange(blockStart, blockStart);
              // Trigger select event to sync overlay/caret
              const selectEvent = new Event('select', { bubbles: true });
              textarea.dispatchEvent(selectEvent);
            }, 0);
            return;
          }
        }
      }

      // 2. Delete key interception (when cursor is immediately before \u200B@)
      if (e.key === "Delete" && start === end) {
        const regex = /\u200B@([^\u200B]+)\u200B/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const blockStart = match.index;
          const blockEnd = match.index + match[0].length;
          if (start === blockStart) {
            e.preventDefault();
            const newValue = text.slice(0, blockStart) + text.slice(blockEnd);
            onChange(newValue);
            setTimeout(() => {
              textarea.setSelectionRange(blockStart, blockStart);
              const selectEvent = new Event('select', { bubbles: true });
              textarea.dispatchEvent(selectEvent);
            }, 0);
            return;
          }
        }
      }

      // 3. Arrow keys custom jumping to prevent entering the block
      if (start === end) {
        const regex = /\u200B@([^\u200B]+)\u200B/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const blockStart = match.index;
          const blockEnd = match.index + match[0].length;
          if (e.key === "ArrowRight" && start === blockStart) {
            e.preventDefault();
            textarea.setSelectionRange(blockEnd, blockEnd);
            return;
          }
          if (e.key === "ArrowLeft" && start === blockEnd) {
            e.preventDefault();
            textarea.setSelectionRange(blockStart, blockStart);
            return;
          }
        }
      }
    },
    [showDropdown, filteredCandidates, selectedIdx, insertMention, onChange]
  );

  const handleBlur = useCallback(() => {
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
