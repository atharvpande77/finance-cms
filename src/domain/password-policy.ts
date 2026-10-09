/** The password rules in 04.12. Hashing lives in `server/auth/password.ts`. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordProblem =
  | "too_short"
  | "too_long"
  | "needs_letter"
  | "needs_digit"
  | "too_few_distinct"
  | "too_common"
  | "contains_email"
  | "contains_name";

export const PASSWORD_PROBLEM_TEXT: Record<PasswordProblem, string> = {
  too_short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  too_long: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  needs_letter: "Include at least one letter.",
  needs_digit: "Include at least one number.",
  too_few_distinct: "Use at least 4 different characters.",
  too_common: "This password is too common. Choose something less predictable.",
  contains_email: "Don't include your email name.",
  contains_name: "Don't include your name.",
};

/**
 * Very common passwords that otherwise meet the length rule, compared case-insensitively. Short
 * on purpose (04.12 asks for "a small list"); the length and variety rules do most of the work.
 */
const COMMON = new Set([
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "p@ssword123",
  "p@ssw0rd123",
  "qwerty1234",
  "qwerty12345",
  "qwerty123456",
  "qwertyuiop1",
  "1qaz2wsx3edc",
  "1q2w3e4r5t",
  "1q2w3e4r5t6y",
  "zaq12wsxcde3",
  "abc1234567",
  "abcd123456",
  "abcdef1234",
  "a1b2c3d4e5",
  "iloveyou12",
  "iloveyou123",
  "welcome123",
  "welcome1234",
  "letmein123",
  "admin12345",
  "admin123456",
  "administrator1",
  "changeme123",
  "football123",
  "baseball123",
  "monkey12345",
  "dragon12345",
  "sunshine123",
  "princess123",
  "trustno1234",
  "superman123",
  "starwars123",
  "computer123",
  "internet123",
  "india12345",
  "india123456",
  "bharat1234",
  "mumbai1234",
  "pune123456",
  "cricket123",
  "sachin12345",
  "jaimaharashtra1",
  "shivaji1234",
  "ganesh12345",
  "krishna1234",
  "123456789a",
  "1234567890a",
  "a123456789",
  "qwerty123a",
  "test123456",
  "testing123",
  "demo123456",
]);

/**
 * Problems with a proposed password, or an empty list when it is acceptable.
 * Names and email local parts block only when they are 4+ characters (so "Raj" doesn't).
 */
export function checkPassword(
  password: string,
  person: { email?: string | null; name?: string | null } = {},
): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push("too_short");
  if (password.length > MAX_PASSWORD_LENGTH) problems.push("too_long");
  if (!/\p{L}/u.test(password)) problems.push("needs_letter");
  if (!/\p{Nd}/u.test(password)) problems.push("needs_digit");
  if (new Set(password).size < 4) problems.push("too_few_distinct");
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push("too_common");

  const emailName = person.email?.split("@", 1)[0]?.trim().toLowerCase() ?? "";
  if (emailName.length >= 4 && lower.includes(emailName)) problems.push("contains_email");
  const firstName = person.name?.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  if (firstName.length >= 4 && lower.includes(firstName)) problems.push("contains_name");
  return problems;
}
