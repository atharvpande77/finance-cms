/**
 * Numbers every acceptance check in docs/handover/08-acceptance-checks.md, assigns each to a
 * milestone, finds the tests that cover it, and writes tests/acceptance/INDEX.md.
 *
 * A test covers a check by putting the check's ID in square brackets in its title, e.g.
 *   it("[U-AUTH-07] secret box detects tampering", ...)
 *
 * Doc 08 is client material and is not committed, so neither is INDEX.md (it quotes every check).
 * `checks.json` (IDs and milestones only) is committed; `--check` uses it when doc 08 is absent.
 *
 * Usage:
 *   tsx scripts/gen-acceptance-index.ts            regenerate INDEX.md
 *   tsx scripts/gen-acceptance-index.ts --check M2 exit 1 if a check due by M2 has no test
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE = join(ROOT, "docs/handover/08-acceptance-checks.md");
const OUT = join(ROOT, "tests/acceptance/INDEX.md");
/** IDs and milestones only (no check text), committed so CI can verify coverage without doc 08. */
const CHECKS_JSON = join(ROOT, "tests/acceptance/checks.json");
const TEST_DIR = join(ROOT, "tests");

type Group = { match: string; code: string; milestone: string; sub?: Record<string, string> };

/** Heading prefix → ID prefix and milestone. `sub` overrides the milestone per bold sub-heading. */
const E2E_GROUPS: Group[] = [
  { match: "Sign-in, two-step", code: "E2E-AUTH", milestone: "M2" },
  // M3 is split (M3a authoring and approvals, M3b release onwards); M3a IDs are in ID_OVERRIDES.
  { match: "Article workflow (rules", code: "E2E-WF", milestone: "M3b" },
  { match: "Article workflow through the real pages", code: "E2E-UI", milestone: "M3b" },
  // M4 is split (M4a calculators and rates, M4b leads).
  { match: "Lead capture", code: "E2E-LEAD", milestone: "M4b" },
  { match: "The seven calculators", code: "E2E-CALC", milestone: "M4a" },
  // M5 is split (M5a analytics and reports, M5b user management; D47). Finance checks are M7.
  { match: "First-party analytics", code: "E2E-AN", milestone: "M5a" },
  { match: "Newspaper widgets", code: "E2E-WID", milestone: "M8" },
  { match: "Ad layout", code: "E2E-ADS", milestone: "M9" },
  { match: "Invitations, password reset", code: "E2E-USR", milestone: "M5b" },
];

const UNIT_GROUPS: Group[] = [
  { match: "Passwords, TOTP", code: "U-AUTH", milestone: "M2", sub: { "secret box": "M0" } },
  {
    match: "Workflow permissions",
    code: "U-WF",
    milestone: "M3b",
    sub: { "institution side": "M3a", "abcfinance side": "M3a", "automated checks": "M3a" },
  },
  { match: "Phone numbers, consent", code: "U-LEAD", milestone: "M4b" },
  { match: "Calculator formulas", code: "U-CALC", milestone: "M4a" },
  { match: "Revenue sharing", code: "U-FIN", milestone: "M7" },
  { match: "Bot filter, India-time", code: "U-AN", milestone: "M5a", sub: { dates: "M0" } },
  { match: "Widget settings", code: "U-WID", milestone: "M8" },
  { match: "Ad rules", code: "U-ADS", milestone: "M9", sub: { "outbound links": "M1" } },
  {
    match: "Emails, role rules",
    code: "U-USR",
    milestone: "M5b",
    // Sign-in and change password (moved into M2, D20) need these two.
    sub: { "email addresses": "M2", passwords: "M2" },
  },
];

/**
 * Checks done earlier than their group's milestone, because the feature they test arrives
 * sooner (e.g. reader-side checks satisfiable with seeded live articles in M1).
 */
const ID_OVERRIDES: Record<string, string> = {
  // A sponsored calculator's lead call-to-action needs the lead form (M4b).
  "E2E-CALC-15": "M4b",
  // M3a: writing and approving up to Editing.
  "E2E-WF-01": "M3a",
  "E2E-WF-02": "M3a",
  "E2E-WF-03": "M3a",
  "E2E-WF-04": "M3a",
  "E2E-WF-05": "M3a",
  "E2E-WF-06": "M3a",
  "E2E-WF-07": "M3a",
  "E2E-WF-08": "M3a",
  "E2E-WF-09": "M3a",
  "E2E-WF-10": "M3a",
  "E2E-WF-11": "M3a",
  "E2E-WF-12": "M3a",
  "E2E-WF-25": "M3a",
  "E2E-WF-35": "M3a",
  "E2E-WF-36": "M3a",
  "E2E-WF-37": "M3a",
  "E2E-WF-38": "M3a",
  "E2E-WF-40": "M3a",
  "E2E-UI-01": "M3a",
  "E2E-UI-02": "M3a",
  "E2E-UI-03": "M3a",
  "E2E-UI-04": "M3a",
  "E2E-UI-05": "M3a",
  "E2E-UI-06": "M3a",
  "E2E-UI-07": "M3a",
  "E2E-UI-08": "M3a",
  "E2E-UI-09": "M3a",
  "E2E-UI-10": "M3a",
  "E2E-UI-11": "M3a",
  "E2E-UI-12": "M3a",
  "E2E-UI-13": "M3a",
  "E2E-UI-18": "M3a",
  "E2E-UI-27": "M3a",
  "E2E-UI-20": "M1",
  "E2E-UI-21": "M1",
  "E2E-UI-22": "M1",
  "E2E-UI-23": "M1",
  "E2E-UI-25": "M1",
  "E2E-ADS-34": "M1",
  "E2E-ADS-35": "M1",
  "E2E-ADS-36": "M1",
  "E2E-ADS-37": "M1",
  "E2E-AN-02": "M1",
  // The pool, payouts and finance page come with revenue sharing (M7, D47).
  "E2E-AN-40": "M7",
  "E2E-AN-41": "M7",
  "E2E-AN-42": "M7",
  "E2E-AN-44": "M7",
  "E2E-AN-48": "M7",
  "E2E-AN-49": "M7",
  "E2E-AN-50": "M7",
  "E2E-AN-51": "M7",
  "E2E-AN-52": "M7",
  "E2E-AN-53": "M7",
  "E2E-AN-54": "M7",
  "E2E-AN-55": "M7",
  "E2E-AN-56": "M7",
  "E2E-AN-57": "M7",
  "E2E-AN-58": "M7",
  "E2E-AN-59": "M7",
  "U-ADS-10": "M1",
  // Need email, or self-service password reset, which is off until email exists (D58): due
  // with M6. Admins' copied reset links exist already (D59).
  "E2E-USR-08": "M6",
  "E2E-USR-58": "M6",
  "E2E-USR-66": "M6",
  "E2E-USR-67": "M6",
  "E2E-USR-68": "M6",
  "E2E-USR-69": "M6",
  "E2E-USR-70": "M6",
  "E2E-USR-71": "M6",
  "E2E-USR-72": "M6",
  "E2E-USR-73": "M6",
  "E2E-USR-74": "M6",
  "E2E-USR-75": "M6",
  "E2E-USR-76": "M6",
  "E2E-USR-77": "M6",
  "E2E-USR-78": "M6",
  "E2E-USR-79": "M6",
  "E2E-USR-80": "M6",
  "E2E-USR-81": "M6",
  "E2E-USR-82": "M6",
  "E2E-USR-83": "M6",
  "E2E-USR-84": "M6",
  "E2E-USR-85": "M6",
  "E2E-USR-86": "M6",
  "E2E-USR-87": "M6",
  "E2E-USR-98": "M6",
  // Change password moved into M2 (D20).
  "E2E-USR-89": "M2",
  "E2E-USR-90": "M2",
  "E2E-USR-91": "M2",
  "E2E-USR-92": "M2",
  "E2E-USR-93": "M2",
  "E2E-USR-94": "M2",
  "E2E-USR-95": "M2",
  "E2E-USR-96": "M2",
  "E2E-USR-97": "M2",
};

type Check = {
  id: string;
  group: string;
  sub: string;
  text: string;
  milestone: string;
  line: number;
};

function parse(): Check[] {
  const lines = readFileSync(SOURCE, "utf8").split("\n");
  const checks: Check[] = [];
  let unitPart = false;
  let group: Group | undefined;
  let groupTitle = "";
  let sub = "";
  let n = 0;
  lines.forEach((line, i) => {
    if (line.startsWith("# Unit-level")) unitPart = true;
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      groupTitle = heading[1]!;
      group = (unitPart ? UNIT_GROUPS : E2E_GROUPS).find((g) => groupTitle.startsWith(g.match));
      if (!group) throw new Error(`No ID mapping for heading: ${groupTitle}`);
      sub = "";
      n = 0;
      return;
    }
    const bold = line.match(/^\*\*(.+)\*\*$/);
    if (bold) sub = bold[1]!;
    const bullet = line.match(/^- (.+)$/);
    if (bullet && group) {
      n++;
      const id = `${group.code}-${String(n).padStart(2, "0")}`;
      checks.push({
        id,
        group: groupTitle,
        sub,
        text: bullet[1]!,
        milestone: ID_OVERRIDES[id] ?? group.sub?.[sub] ?? group.milestone,
        line: i + 1,
      });
    }
  });
  return checks;
}

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.tsx?$/.test(name) || name.endsWith(".spec.ts") ? [path] : [];
  });
}

function coverage(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of testFiles(TEST_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/\[((?:E2E|U)-[A-Z]+-\d{2,3})\]/g)) {
      const list = found.get(m[1]!) ?? [];
      const rel = relative(ROOT, file);
      if (!list.includes(rel)) list.push(rel);
      found.set(m[1]!, list);
    }
  }
  return found;
}

/** "M3" → 3; sub-milestones sort inside it: "M3a" → 3.1, "M3b" → 3.2. */
const milestoneNumber = (m: string) => {
  const [, n, part] = /^M(\d+)([a-z])?$/.exec(m) ?? [];
  if (n === undefined) throw new Error(`Bad milestone "${m}"`);
  return Number(n) + (part ? (part.charCodeAt(0) - 96) / 10 : 0);
};
const escape = (s: string) => s.replace(/\|/g, "\\|");

type CheckRef = Pick<Check, "id" | "milestone"> & Partial<Pick<Check, "text">>;

const haveSource = existsSync(SOURCE);
const checks: CheckRef[] = haveSource
  ? parse()
  : (JSON.parse(readFileSync(CHECKS_JSON, "utf8")) as CheckRef[]);
const covered = coverage();
const args = process.argv.slice(2);
const checkIdx = args.indexOf("--check");

if (checkIdx >= 0) {
  const target = args[checkIdx + 1] ?? "M0";
  const upTo = milestoneNumber(target);
  const missing = checks.filter((c) => milestoneNumber(c.milestone) <= upTo && !covered.has(c.id));
  if (missing.length) {
    console.error(`${missing.length} acceptance checks due by ${target} have no test:`);
    for (const c of missing) console.error(`  ${c.id} (${c.milestone}) ${c.text ?? ""}`);
    process.exit(1);
  }
  console.log(
    `All ${checks.filter((c) => milestoneNumber(c.milestone) <= upTo).length} checks due by ${target} have tests.`,
  );
} else {
  if (!haveSource)
    throw new Error(`Regenerating needs ${relative(ROOT, SOURCE)} (kept locally, not in git)`);
  const full = checks as Check[];
  writeFileSync(
    CHECKS_JSON,
    JSON.stringify(
      full.map(({ id, milestone }) => ({ id, milestone })),
      null,
      0,
    ).replace(/},{/g, "},\n{") + "\n",
  );
  const total = full.length;
  const done = full.filter((c) => covered.has(c.id)).length;
  const out: string[] = [
    "# Acceptance checks index",
    "",
    "Generated by `pnpm acceptance:index` from `docs/handover/08-acceptance-checks.md`. Do not edit by hand.",
    "",
    'A test covers a check by putting its ID in square brackets in the test title, e.g. `it("[U-AUTH-07] detects tampering", ...)`.',
    "",
    `**${done} of ${total} checks have tests.**`,
    "",
    "| Group | Checks | Milestone | Covered |",
    "| --- | --- | --- | --- |",
  ];
  const groups = [...new Set(full.map((c) => c.group))];
  for (const g of groups) {
    const cs = full.filter((c) => c.group === g);
    const ms = [...new Set(cs.map((c) => c.milestone))].join(", ");
    out.push(
      `| ${escape(g)} | ${cs.length} | ${ms} | ${cs.filter((c) => covered.has(c.id)).length} |`,
    );
  }
  for (const g of groups) {
    out.push("", `## ${g}`, "", "| ID | Check | Milestone | Tests |", "| --- | --- | --- | --- |");
    for (const c of full.filter((x) => x.group === g)) {
      const text = c.sub ? `*${escape(c.sub)}:* ${escape(c.text)}` : escape(c.text);
      out.push(
        `| ${c.id} | ${text} | ${c.milestone} | ${(covered.get(c.id) ?? []).map((f) => `\`${f}\``).join(", ")} |`,
      );
    }
  }
  writeFileSync(OUT, out.join("\n") + "\n");
  console.log(`Wrote ${relative(ROOT, OUT)}: ${total} checks, ${done} covered.`);
}
