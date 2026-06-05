import React, { useRef, useEffect, useCallback } from "react";
import { useMention, type MentionCandidate } from "@/hooks/useMention";
import { MentionDropdown } from "./MentionDropdown";
import styles from "./MentionTextarea.module.css";

interface MentionTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onSelect"> {
  value: string;
  onValueChange: (val: string) => void;
  candidates: MentionCandidate[];
  containerStyle?: React.CSSProperties;
}

function renderHighlightedText(text: string) {
  const regex = /\u200B@([^\u200B]+)\u200B/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className={styles.overlayText}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }
    const name = match[1];
    parts.push(
      <span key={`pill-${match.index}`} className={styles.pill}>
        @{name}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className={styles.overlayText}>
        {text.slice(lastIndex)}
      </span>
    );
  }
  if (text.endsWith("\n")) {
    parts.push(
      <span key="br-fix" className={styles.overlayText}>
        {"\u200B"}
      </span>
    );
  }
  return parts;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onValueChange,
  candidates,
  containerStyle,
  className,
  placeholder,
  ...rest
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mentionMap = useRef<Record<string, string>>({});
  const adjustTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const regex = /@\[([^\]]+)\]\((slot|node|gallery):([^\)]+)\)/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      mentionMap.current[match[1]] = `${match[2]}:${match[3]}`;
    }
  }, [value]);

  const displayValue = value.replace(/@\[([^\]]+)\]\((slot|node|gallery):([^\)]+)\)/g, '\u200B@$1\u200B');

  const handleValueChange = useCallback((newDisplayValue: string) => {
    const newValue = newDisplayValue.replace(/\u200B@([^\u200B]+)\u200B/g, (match, name) => {
      const mapped = mentionMap.current[name];
      if (mapped) {
        const [type, id] = mapped.split(':');
        return `@[${name}](${type}:${id})`;
      }
      const candidate = candidates.find(c => c.name === name);
      if (candidate) {
        mentionMap.current[name] = `${candidate.type}:${candidate.id}`;
        return `@[${name}](${candidate.type}:${candidate.id})`;
      }
      return `@${name}`;
    });
    onValueChange(newValue);
  }, [onValueChange, candidates]);

  const {
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
  } = useMention({
    value: displayValue,
    onChange: handleValueChange,
    candidates,
  });

  const adjustSelection = useCallback((textarea: HTMLTextAreaElement) => {
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    let newStart = start;
    let newEnd = end;
    let changed = false;

    const regex = /\u200B@([^\u200B]+)\u200B/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const blockStart = match.index;
      const blockEnd = match.index + match[0].length;

      if (start === end) {
        // Cursor is strictly inside the block
        if (start > blockStart && start < blockEnd) {
          newStart = (start - blockStart < blockEnd - start) ? blockStart : blockEnd;
          newEnd = newStart;
          changed = true;
        }
      } else {
        // Selection overlaps with block
        if (start > blockStart && start < blockEnd) {
          newStart = blockStart;
          changed = true;
        }
        if (end > blockStart && end < blockEnd) {
          newEnd = blockEnd;
          changed = true;
        }
      }
    }

    if (changed) {
      textarea.setSelectionRange(newStart, newEnd);
    }
  }, []);

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    if (adjustTimeoutRef.current !== null) {
      window.clearTimeout(adjustTimeoutRef.current);
    }
    adjustTimeoutRef.current = window.setTimeout(() => {
      adjustTimeoutRef.current = null;
      adjustSelection(textarea);
    }, 0);
  }, [adjustSelection]);

  // Clean up selection adjustment timeout on unmount
  useEffect(() => {
    return () => {
      if (adjustTimeoutRef.current !== null) {
        window.clearTimeout(adjustTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.wrapper} style={containerStyle}>
      <div ref={overlayRef} className={`${className || ""} ${styles.overlay}`} aria-hidden="true">
        {renderHighlightedText(displayValue)}
      </div>
      <textarea
        ref={(el) => {
          textareaRef.current = el;
        }}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          handleKeyUp(e);
          handleSelect(e);
        }}
        onBlur={handleBlur}
        onSelect={handleSelect}
        onClick={handleSelect}
        placeholder={placeholder}
        className={`${className || ""} ${styles.textarea}`}
        onScroll={(e) => {
          if (overlayRef.current) {
            overlayRef.current.scrollTop = e.currentTarget.scrollTop;
            overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        {...rest}
      />
      {showDropdown && (
        <MentionDropdown
          show={showDropdown}
          selectedIdx={selectedIdx}
          candidates={filteredCandidates}
          onSelect={insertMention}
          onHoverIndex={setSelectedIdx}
        />
      )}
    </div>
  );
};

export default MentionTextarea;
