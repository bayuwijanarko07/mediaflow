import { Elysia } from "elysia";
import { corsPlugin } from "./plugins/cors.plugin";
import { healthController } from "./modules/health/health.controller";

const PORT = process.env.PORT ?? 4000;

const app = new Elysia()
  .use(corsPlugin)
  .use(healthController)
  .listen(PORT);

console.log(`🦊 Mediaflow API is running at ${app.server?.hostname}:${app.server?.port}`);
console.log("CORS Origin:", process.env.CORS_ORIGIN);
console.log("Port:", process.env.PORT);