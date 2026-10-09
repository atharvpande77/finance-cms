import type { ReactNode } from "react";
import {
  classifyLink,
  linkAttributes,
  parseBody,
  type ArticleKind,
  type Inline,
} from "@/domain/markup";
import { calculatorBySlug } from "@/domain/calc/catalog";
import type { Site } from "@/app/sites/site";
import { CalculatorPlaceholder } from "./CalculatorPlaceholder";

/**
 * Renders article markup as React elements. Text is never injected as HTML (06.4a), and links
 * follow 04.11: site links stay plain, outbound links open in a new tab (sponsored in
 * institution articles), anything unsafe is shown as plain text.
 */
export function ArticleBody({
  body,
  articleType,
  site,
}: {
  body: string;
  articleType: ArticleKind;
  site: Site;
}) {
  return (
    <div className="article-body">
      {parseBody(body).map((block, i) => {
        switch (block.type) {
          case "heading":
            return <h2 key={i}>{renderInline(block.children, articleType, site)}</h2>;
          case "list":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, articleType, site)}</li>
                ))}
              </ul>
            );
          case "calculator": {
            const calc = calculatorBySlug(block.slug);
            return calc ? (
              <CalculatorPlaceholder key={i} calculator={calc} site={site} embedded />
            ) : null;
          }
          default:
            return <p key={i}>{renderInline(block.children, articleType, site)}</p>;
        }
      })}
    </div>
  );
}

function renderInline(nodes: Inline[], articleType: ArticleKind, site: Site): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === "text") return node.text;
    if (node.type === "bold")
      return <strong key={i}>{renderInline(node.children, articleType, site)}</strong>;
    const kind = classifyLink(node.href, site.tenant.hosts);
    const children = renderInline(node.children, articleType, site);
    if (kind === "unsafe") return <span key={i}>{children}</span>;
    return (
      <a key={i} href={node.href} {...linkAttributes(kind, articleType)}>
        {children}
      </a>
    );
  });
}
