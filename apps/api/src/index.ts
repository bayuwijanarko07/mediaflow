import { Elysia } from "elysia";
import { corsPlugin } from "./plugins/cors.plugin";
import { errorHandlerPlugin } from "./plugins/error-handler.plugin";
import { healthController } from "./modules/health/health.controller";
import { authController } from "./modules/auth/auth.controller";
import { ensureStorageDirs } from "@mediaflow/storage";

const PORT = process.env.PORT ?? 4000;

await ensureStorageDirs();
console.log("✅ Folder storage siap");

const app = new Elysia()
  .use(errorHandlerPlugin)
  .use(corsPlugin)
  .use(healthController)
  .use(authController)
  .listen(PORT);

console.log(`🦊 Mediaflow API is running at ${app.server?.hostname}:${app.server?.port}`);
console.log("CORS Origin:", process.env.CORS_ORIGIN);
console.log("Port:", process.env.PORT);