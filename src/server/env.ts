import { z } from "zod";

const intWithDefault = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().min(0));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    APP_SECRET: z
      .string()
      .min(1, "APP_SECRET is required")
      .refine((v) => Buffer.from(v, "base64").length === 32, "APP_SECRET must be 32 bytes, base64"),
    APP_URL: z
      .string()
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    CRON_SECRET: z.string().optional(),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default("abcfinance <no-reply@abcfinance.test>"),
    ENGAGED_MIN_SECONDS: intWithDefault(15),
    TENANT_CACHE_SECONDS: intWithDefault(30),
    WIDGET_CACHE_SECONDS: intWithDefault(30),
    /** "1" when behind the nginx proxy: the client address is read from X-Real-IP. */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => v === "1"),
    /**
     * Development only: "1" lets the fixed code 111111 pass two-step set-up and sign-in for quick
     * local testing. The server refuses to start with it in production (D41).
     */
    DEV_TOTP_BYPASS: z
      .string()
      .optional()
      .transform((v) => v === "1"),
    /** "1" also emails invitations; otherwise the admin copies the link and sends it (D58). */
    INVITE_EMAILS: z
      .string()
      .optional()
      .transform((v) => v === "1"),
    /** "1" turns on forgot-password and admin reset links, which need email (D58; M6). */
    PASSWORD_RESET: z
      .string()
      .optional()
      .transform((v) => v === "1"),
    ADS_PREVIEW: z
      .string()
      .optional()
      .transform((v) => v === "1"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_TOTP_BYPASS) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_TOTP_BYPASS"],
        message: "DEV_TOTP_BYPASS must not be set in production",
      });
    }
    if (env.NODE_ENV === "production" && !env.APP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL is required in production",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Throws with every problem listed if the configuration is invalid. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment:\n${problems}`);
    }
    cached = parsed.data;
    if (cached.NODE_ENV === "production" && !cached.TRUST_PROXY) {
      // Without it every reader shares one address for the per-address limits (D38).
      console.warn(
        "TRUST_PROXY is not set: all requests share one client address for rate limits.",
      );
    }
  }
  return cached;
}

/** For tests that change process.env between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
