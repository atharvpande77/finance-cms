/** Email addresses are stored trimmed and lower-cased (the users table enforces lower case). */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** A pragmatic check: one @, a dotted domain, no spaces, at most 254 characters. */
export function isEmail(input: string): boolean {
  const email = normaliseEmail(input);
  return (
    email.length <= 254 &&
    /^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    )
  );
}
