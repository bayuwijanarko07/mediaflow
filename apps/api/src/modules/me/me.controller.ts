import { Elysia } from "elysia";
import { requireAuth } from "../../middleware/auth.middleware";
import { getUserWatchHistory } from "../video/video.service";

export const meController = new Elysia({ prefix: "/me" })
  .use(requireAuth)
  .get("/watch-history", async ({ userId }) => {
    const history = await getUserWatchHistory(userId);
    return { history };
  });