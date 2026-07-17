import { Elysia } from "elysia";

export const healthController = new Elysia().get("/health", () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));