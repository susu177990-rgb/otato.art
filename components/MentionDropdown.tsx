import React from "react";
import type { MentionCandidate } from "@/hooks/useMention";

type MentionDropdownProps = {
  show: boolean;
  selectedIdx: number;
  candidates: MentionCandidate[];
  onSelect: (item: MentionCandidate) => void;
  onHoverIndex: (index: number) => void;
};

export const MentionDropdown: React.FC<MentionDropdownProps> = ({
  show,
  selectedIdx,
  candidates,
  onSelect,
  onHoverIndex,
}) => {
  if (!show || candidates.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 1000,
        width: "280px",
        maxHeight: "180px",
        overflowY: "auto",
        backgroundColor: "rgba(22, 22, 26, 0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "10px",
        boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.4)",
        padding: "4px",
        bottom: "100%", // 向上延伸
        marginBottom: "4px",
      }}
    >
      {candidates.map((item, index) => {
        const active = index === selectedIdx;
        return (
          <div
            key={item.id}
            onMouseEnter={() => onHoverIndex(index)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: active ? "rgba(255, 255, 255, 0.08)" : "transparent",
              color: active ? "#fff" : "rgba(255, 255, 255, 0.75)",
              fontSize: "12px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              transition: "all 0.15s ease",
            }}
          >
            {item.name}
          </div>
        );
      })}
    </div>
  );
};
export default MentionDropdown;
