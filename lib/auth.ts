import { betterAuth } from "better-auth";
import { getDb } from "./db";

export function createAuth(provisioning = false) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error(
      "Configure BETTER_AUTH_SECRET (32+ characters) and BETTER_AUTH_URL. See README.md.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    !baseURL.startsWith("https://")
  ) {
    throw new Error("Production authentication requires HTTPS.");
  }
  return betterAuth({
    database: getDb(),
    secret,
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !provisioning,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            getDb()
              .prepare(
                "UPDATE app_accounts SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?",
              )
              .run(session.userId);
          },
        },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
