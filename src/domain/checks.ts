import { parseBody, unknownCalculators } from "./markup";
import { CALCULATOR_SLUGS } from "./calc/catalog";

/**
 * Automated checks (04.2): shown live to the writer and editor, run again at release. A flag never
 * blocks release; it makes every paper approve the copy explicitly.
 */

export type CheckFlag = {
  code:
    "headline_short" | "body_short" | "promise" | "risk_free" | "trade_call" | "unknown_calculator";
  message: string;
};

export const MIN_HEADLINE = 8;
export const MIN_BODY = 80;

type Pattern = { code: CheckFlag["code"]; re: RegExp; message: string };

const PROMISES: Pattern[] = [
  {
    code: "promise",
    re: /\b(guaranteed|assured|fixed)\s+(returns?|income|profits?|gains?)\b/i,
    message: "Claims guaranteed, assured or fixed returns.",
  },
  {
    code: "promise",
    re: /\b100\s*%\s*(safe|secure|guaranteed)\b/i,
    message: "Claims to be 100% safe, secure or guaranteed.",
  },
  {
    code: "promise",
    re: /\bdoubles?\s+(your|the)\s+money\b/i,
    message: "Promises to double your money.",
  },
  { code: "risk_free", re: /\brisk[\s-]?free\b/i, message: "Calls an investment risk-free." },
  {
    code: "trade_call",
    re: /\b(buy|sell)\s+(this|these|the)\s+(stocks?|shares?|funds?)\b/i,
    message: "Tells readers to buy or sell a specific stock, share or fund.",
  },
  // Marathi equivalents. Devanagari has no \b, so matches are plain substrings.
  {
    code: "promise",
    re: /(हमखास|खात्रीशीर|निश्चित|हमी(?:चा|ने)?)\s*(परतावा|परतावे|नफा|उत्पन्न)/u,
    message: "Claims guaranteed, assured or fixed returns (Marathi).",
  },
  {
    code: "promise",
    re: /(पैसे|रक्कम)\s*(दुप्पट|दुपटीने)/u,
    message: "Promises to double your money (Marathi).",
  },
  {
    code: "promise",
    re: /१००\s*%\s*(सुरक्षित|खात्रीशीर)/u,
    message: "Claims to be 100% safe or guaranteed (Marathi).",
  },
  {
    code: "risk_free",
    re: /(जोखीम\s*मुक्त|जोखीममुक्त|धोका\s*मुक्त|धोकामुक्त|विनाजोखीम|बिनधोक)/u,
    message: "Calls an investment risk-free (Marathi).",
  },
  {
    code: "trade_call",
    re: /(हा|हे|ही)\s*(शेअर|स्टॉक|फंड)\s*(खरेदी|विकत\s*घ्या|विका|विक्री)/u,
    message: "Tells readers to buy or sell a specific stock, share or fund (Marathi).",
  },
];

export function runChecks(version: { headline: string; body: string }): {
  ok: boolean;
  flags: CheckFlag[];
} {
  const flags: CheckFlag[] = [];
  const headline = version.headline.trim();
  const body = version.body.trim();
  if ([...headline].length < MIN_HEADLINE) {
    flags.push({
      code: "headline_short",
      message: `Headline is shorter than ${MIN_HEADLINE} characters.`,
    });
  }
  if ([...body].length < MIN_BODY) {
    flags.push({ code: "body_short", message: `Body is shorter than ${MIN_BODY} characters.` });
  }
  const text = `${headline}\n${body}`;
  const seen = new Set<string>();
  for (const p of PROMISES) {
    if (p.re.test(text) && !seen.has(p.message)) {
      seen.add(p.message);
      flags.push({ code: p.code, message: p.message });
    }
  }
  for (const slug of unknownCalculators(parseBody(body), CALCULATOR_SLUGS)) {
    flags.push({ code: "unknown_calculator", message: `There is no calculator called "${slug}".` });
  }
  return { ok: flags.length === 0, flags };
}
