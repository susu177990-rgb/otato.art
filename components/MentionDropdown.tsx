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
        maxHeight: "220px",
        overflowY: "auto",
        backgroundColor: "rgba(22, 22, 26, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
        padding: "6px",
        marginTop: "4px",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: "10px",
          color: "rgba(255, 255, 255, 0.4)",
          fontWeight: 600,
          letterSpacing: "0.05em",
          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          marginBottom: "4px",
        }}
      >
        键入并搜索素材
      </div>
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
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 8px",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: active ? "rgba(255, 255, 255, 0.08)" : "transparent",
              transition: "background-color 0.15s ease",
            }}
          >
            {/* 预览图或图标 */}
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                style={{
                  width: "28px",
                  height: "28px",
                  objectFit: "cover",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            ) : (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  color: "rgba(255, 255, 255, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                {item.type === "node" && item.subType === "text" ? "T" : "📝"}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "#fff",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.name}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "rgba(255, 255, 255, 0.4)",
                  marginTop: "1px",
                }}
              >
                {item.type === "gallery"
                  ? "画廊生图"
                  : item.subType === "text"
                    ? "画布文本节点"
                    : item.subType === "image"
                      ? "画布图片节点"
                      : "画布视频节点"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
