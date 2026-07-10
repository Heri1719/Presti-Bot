import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

export const config = {
  databaseUrl: process.env.DATABASE_URL || "postgres://localhost:5432/prestibot",
  jwtSecret: process.env.JWT_SECRET || "dev-prestibot-secret",
  port: Number(process.env.PORT || 4000),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
};
