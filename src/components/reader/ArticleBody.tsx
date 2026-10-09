import { Fragment, type ReactNode } from "react";
import {
  classifyLink,
  linkAttributes,
  parseBody,
  type ArticleKind,
  type Inline,
} from "@/domain/markup";
import { calculatorBySlug, type CalculatorInfo } from "@/domain/calc/catalog";

/**
 * Renders article markup as React elements. Text is never injected as HTML (06.4a), and links
 * follow 04.11: site links stay plain, outbound links open in a new tab (sponsored in
 * institution articles), anything unsafe is shown as plain text.
 *
 * Shared by the reader site and the panel's live preview, so it takes only what it needs:
 * the hosts that count as "this site" for links, and how to draw an embedded calculator.
 */
export function ArticleBody({
  body,
  articleType,
  linkHosts,
  renderCalculator,
  className = "article-body",
}: {
  body: string;
  articleType: ArticleKind;
  linkHosts: readonly string[];
  renderCalculator: (calculator: CalculatorInfo) => ReactNode;
  className?: string;
}) {
  const inline = (nodes: Inline[]) => renderInline(nodes, articleType, linkHosts);
  return (
    <div className={className}>
      {parseBody(body).map((block, i) => {
        switch (block.type) {
          case "heading":
            return <h2 key={i}>{inline(block.children)}</h2>;
          case "list":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case "calculator": {
            const calc = calculatorBySlug(block.slug);
            return calc ? <Fragment key={i}>{renderCalculator(calc)}</Fragment> : null;
          }
          default:
            return <p key={i}>{inline(block.children)}</p>;
        }
      })}
    </div>
  );
}

function renderInline(
  nodes: Inline[],
  articleType: ArticleKind,
  linkHosts: readonly string[],
): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === "text") return node.text;
    if (node.type === "bold")
      return <strong key={i}>{renderInline(node.children, articleType, linkHosts)}</strong>;
    const kind = classifyLink(node.href, linkHosts);
    const children = renderInline(node.children, articleType, linkHosts);
    if (kind === "unsafe") return <span key={i}>{children}</span>;
    return (
      <a key={i} href={node.href} {...linkAttributes(kind, articleType)}>
        {children}
      </a>
    );
  });
}
