import { describe, expect, it } from "vitest";
import {
  classifyLink,
  inlineText,
  linkAttributes,
  parseBody,
  unknownCalculators,
} from "@/domain/markup";
import { CALCULATOR_SLUGS } from "@/domain/calc/catalog";

const body = `Start small.
Keep going.

## Why it works

- **Discipline** beats timing
- Read the [scheme documents](https://www.example-amc.test/sid)

{{calc:sip}}

See the [glossary](/en/glossary/sip).`;

describe("body markup", () => {
  it("[U-ADS-10] recognises block types", () => {
    const blocks = parseBody(body);
    expect(blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "heading",
      "list",
      "calculator",
      "paragraph",
    ]);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "Start small. Keep going." }],
    });
    expect(blocks[3]).toEqual({ type: "calculator", slug: "sip" });
    const list = blocks[2];
    expect(list?.type === "list" && list.items[0]?.[0]).toEqual({
      type: "bold",
      children: [{ type: "text", text: "Discipline" }],
    });
  });

  it("parses links and bold inline, and leaves unmatched markers as text", () => {
    const [p] = parseBody("A [link](https://x.test) and **bold** and **open and [half");
    expect(p?.type).toBe("paragraph");
    if (p?.type !== "paragraph") return;
    expect(p.children.map((c) => c.type)).toEqual(["text", "link", "text", "bold", "text"]);
    expect(inlineText(p.children)).toBe("A link and bold and **open and [half");
  });

  it("only treats a calculator shortcode on its own line as a calculator", () => {
    expect(parseBody("Use {{calc:emi}} here")[0]?.type).toBe("paragraph");
    expect(
      unknownCalculators(parseBody("{{calc:emi}}\n\n{{calc:nope}}"), CALCULATOR_SLUGS),
    ).toEqual(["nope"]);
  });
});

describe("outbound links", () => {
  const hosts = ["tarunbharat.localhost"];

  it("[U-ADS-31] keeps site links plain", () => {
    expect(classifyLink("/en/glossary/sip", hosts)).toBe("internal");
    expect(classifyLink("http://tarunbharat.localhost/en/home-loan", hosts)).toBe("internal");
    expect(linkAttributes("internal", "institution")).toEqual({});
  });

  it("[U-ADS-32] marks every outbound link in an institution's article as sponsored", () => {
    expect(classifyLink("https://www.amfiindia.com/", hosts)).toBe("external");
    expect(linkAttributes("external", "institution")).toEqual({
      rel: "sponsored noopener noreferrer",
      target: "_blank",
    });
  });

  it("[U-ADS-33] outbound links in other articles are not sponsored", () => {
    expect(linkAttributes("external", "abcfinance")).toEqual({
      rel: "noopener noreferrer",
      target: "_blank",
    });
    expect(linkAttributes("external", "independent").rel).not.toContain("sponsored");
  });

  it("[U-ADS-34] refuses links that could run code or leave the site unexpectedly", () => {
    for (const href of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,<b>x</b>",
      "//evil.test/path",
      "/\\evil.test",
      "mailto:a@b.test",
      "ftp://files.test",
      "https://x.test/a b",
      "",
    ]) {
      expect(classifyLink(href, hosts), href).toBe("unsafe");
    }
  });
});
