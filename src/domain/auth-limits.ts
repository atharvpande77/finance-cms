/** Sign-in limits (04.12, 06.1, 06.5; per-address limit D17). */
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const SESSION_HOURS = 12;
/** Password and code posts from one address, per window (closes gap 06.7 #1). */
export const SIGNIN_ADDRESS_LIMIT = 20;
export const SIGNIN_ADDRESS_WINDOW_SECONDS = 15 * 60;
/** Wrong codes while setting up two-step verification, per person, per window. */
export const ENROL_CODE_LIMIT = 10;
export const ENROL_CODE_WINDOW_SECONDS = 15 * 60;
