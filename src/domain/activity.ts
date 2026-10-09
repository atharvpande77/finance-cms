/** Plain-language names for audit actions shown to the person they concern. */
const LABELS: Record<string, string> = {
  "auth.signin": "Signed in",
  "auth.signin_failed": "Wrong password entered",
  "auth.signin_blocked": "Sign-in blocked after too many attempts",
  "auth.signin_disabled": "Sign-in refused: account deactivated",
  "auth.2fa_ok": "Two-step code accepted",
  "auth.2fa_failed": "Wrong two-step code entered",
  "auth.2fa_enrolled": "Two-step verification turned on",
  "auth.signout": "Signed out",
  "auth.password_changed": "Password changed",
  "auth.password_change_refused": "Password change refused: wrong current password",
};

export function activityLabel(action: string): string {
  return LABELS[action] ?? action;
}

export function isWarning(action: string): boolean {
  return /failed|blocked|refused|disabled/.test(action);
}
