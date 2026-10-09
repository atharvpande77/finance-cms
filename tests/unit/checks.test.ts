import { describe, expect, it } from "vitest";
import { runChecks } from "@/domain/checks";

const BODY =
  "A systematic investment plan puts a fixed amount into a mutual fund every month, which spreads purchases over time.";
const codes = (headline: string, body: string) =>
  runChecks({ headline, body }).flags.map((f) => f.code);

describe("automated checks", () => {
  it("[U-WF-20] passes clean content", () => {
    expect(runChecks({ headline: "SIP basics explained", body: BODY })).toEqual({
      ok: true,
      flags: [],
    });
    expect(runChecks({ headline: "SIP basics", body: `${BODY}\n\n{{calc:sip}}` }).ok).toBe(true);
    const marathi =
      "सिस्टिमॅटिक इन्व्हेस्टमेंट प्लॅन, म्हणजेच एसआयपी, दरमहा एकाच तारखेला ठरावीक रक्कम म्युच्युअल फंड योजनेत गुंतवते. फक्त ₹५०० पासून सुरुवात करता येते.";
    expect(runChecks({ headline: "एसआयपीची ओळख: दरमहा गुंतवणूक", body: marathi }).ok).toBe(true);
  });

  it("[U-WF-21] flags guaranteed-return claims in English and Marathi", () => {
    expect(codes("Fixed deposit or mutual fund", `${BODY} It offers assured returns.`)).toContain(
      "promise",
    );
    expect(codes("Guaranteed returns for all", BODY)).toContain("promise");
    expect(codes("Your money, 100% safe", BODY)).toContain("promise");
    expect(codes("Double your money in five years", BODY)).toContain("promise");
    expect(codes("एफडी की म्युच्युअल फंड", `${BODY} यात हमखास परतावा मिळतो.`)).toContain("promise");
    expect(codes("एफडी की म्युच्युअल फंड", `${BODY} पाच वर्षांत पैसे दुप्पट होतात.`)).toContain(
      "promise",
    );
  });

  it("[U-WF-22] flags buy/sell calls and risk-free claims", () => {
    expect(codes("A risk-free plan for everyone", BODY)).toContain("risk_free");
    expect(codes("Why we like it", `${BODY} Buy this stock today.`)).toContain("trade_call");
    expect(codes("Why we like it", `${BODY} Sell these shares now.`)).toContain("trade_call");
    expect(codes("सुरक्षित पर्याय", `${BODY} ही योजना जोखीममुक्त आहे.`)).toContain("risk_free");
    expect(codes("आमचे मत", `${BODY} हा शेअर खरेदी करा.`)).toContain("trade_call");
  });

  it("[U-WF-23] flags empty headlines, short bodies and unknown calculators", () => {
    expect(codes("", BODY)).toContain("headline_short");
    expect(codes("Short", BODY)).toContain("headline_short");
    expect(codes("A good headline", "Too short.")).toContain("body_short");
    const flags = runChecks({
      headline: "A good headline",
      body: `${BODY}\n\n{{calc:lottery}}`,
    }).flags;
    expect(flags).toEqual([
      { code: "unknown_calculator", message: 'There is no calculator called "lottery".' },
    ]);
  });
});
