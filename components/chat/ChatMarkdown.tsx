import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import styles from "./chat-markdown.module.css";

const mdComponents: Components = {
  h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
  h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
  h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
  h4: ({ children }) => <h4 className={styles.h4}>{children}</h4>,
  h5: ({ children }) => <h5 className={styles.h5}>{children}</h5>,
  h6: ({ children }) => <h6 className={styles.h6}>{children}</h6>,
  p: ({ children }) => <p className={styles.p}>{children}</p>,
  ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
  ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
  li: ({ children }) => <li className={styles.li}>{children}</li>,
  blockquote: ({ children }) => <blockquote className={styles.blockquote}>{children}</blockquote>,
  hr: () => <hr className={styles.hr} />,
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className={styles.thead}>{children}</thead>,
  tbody: ({ children }) => <tbody className={styles.tbody}>{children}</tbody>,
  tr: ({ children }) => <tr className={styles.tr}>{children}</tr>,
  th: ({ children }) => <th className={styles.th}>{children}</th>,
  td: ({ children }) => <td className={styles.td}>{children}</td>,
  strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
  em: ({ children }) => <em className={styles.em}>{children}</em>,
  del: ({ children }) => <del className={styles.del}>{children}</del>,
  a: ({ children, href }) => (
    <a href={href} className={styles.link} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  input: ({ checked, disabled, type }) => {
    if (type === "checkbox") {
      return <input type="checkbox" className={styles.taskCheckbox} checked={checked} disabled={disabled} readOnly />;
    }
    return <input type={type} checked={checked} disabled={disabled} readOnly />;
  },
  pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
  code(props) {
    const { className, children, ...rest } = props;
    const match = /language-([\w-]+)/.exec(className ?? "");
    const block = Boolean(match) || String(children).includes("\n");
    if (block) {
      return (
        <code className={[styles.codeBlock, className].filter(Boolean).join(" ")} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={styles.codeInline} {...rest}>
        {children}
      </code>
    );
  },
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className={styles.img} loading="lazy" />,
};

export function ChatMarkdown({
  markdown,
  variant = "default",
}: {
  markdown: string;
  variant?: "default" | "guide";
}) {
  const trimmed = markdown.trim();
  if (!trimmed) return null;
  const rootClass =
    variant === "guide"
      ? [styles.markdownBody, styles.rootGuide].join(" ")
      : styles.markdownBody;
  const remarkPlugins = variant === "guide" ? [remarkGfm, remarkBreaks] : [remarkGfm];

  return (
    <div className={rootClass} data-markdown-variant={variant}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
