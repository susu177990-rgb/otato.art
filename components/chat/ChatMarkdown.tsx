import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import styles from "./chat-markdown.module.css";

const mdComponents: Components = {
  h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
  h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
  ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
  ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
  li: ({ children }) => <li className={styles.li}>{children}</li>,
  p: ({ children }) => <p className={styles.p}>{children}</p>,
  a: ({ children, href }) => (
    <a href={href} className={styles.link} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
  code(props) {
    const { className, children, ...rest } = props;
    const inline = !/\blanguage-[\w-]+\b/.test(className ?? "");
    if (inline) {
      return (
        <code className={styles.codeInline} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className={styles.img} />,
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
  const rootClass = variant === "guide" ? [styles.root, styles.rootGuide].join(" ") : styles.root;
  const remarkPlugins = variant === "guide" ? [remarkGfm, remarkBreaks] : [remarkGfm];
  return (
    <div className={rootClass}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
