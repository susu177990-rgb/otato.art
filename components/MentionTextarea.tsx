import React from "react";
import { useMention, type MentionCandidate } from "@/hooks/useMention";
import { MentionDropdown } from "./MentionDropdown";

interface MentionTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (val: string) => void;
  candidates: MentionCandidate[];
  containerStyle?: React.CSSProperties;
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
    value,
    onChange: onValueChange,
    candidates,
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...containerStyle }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
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
