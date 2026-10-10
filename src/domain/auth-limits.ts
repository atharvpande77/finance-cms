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
/** Invitations last a week; reset links an hour (04.12, 09.3 #11). */
export const INVITE_DAYS = 7;
export const RESET_MINUTES = 60;
/** Reset emails an hour: per address asked for, and per source address (04.12, 06.5). */
export const RESET_PER_ADDRESS = 3;
export const RESET_PER_SOURCE = 10;
export const RESET_WINDOW_SECONDS = 60 * 60;
