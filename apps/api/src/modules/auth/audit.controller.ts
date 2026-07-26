import { Elysia, t } from "elysia";
import { requireAdmin } from "./admin.middleware";
import { getAllLoginAuditLogs, getLoginAuditLogsForUser } from "./audit-log.service";

const listQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50 })),
  email: t.Optional(t.String()),
  success: t.Optional(t.Boolean()),
});

const userIdParamsSchema = t.Object({
  userId: t.String(),
});

/**
 * Endpoint admin untuk melihat audit log login — dipisah dari
 * authController karena scope-nya khusus monitoring/investigasi,
 * bukan bagian dari alur autentikasi pengguna itu sendiri.
 */
export const auditController = new Elysia({ prefix: "/admin/audit" })
  .use(requireAdmin)
  .get(
    "/login-logs",
    async ({ query }) => {
      const result = await getAllLoginAuditLogs({
        page: query.page ?? 1,
        limit: query.limit ?? 50,
        email: query.email,
        success: query.success,
      });

      return result;
    },
    { query: listQuerySchema }
  )
  .get(
    "/login-logs/:userId",
    async ({ params }) => {
      const logs = await getLoginAuditLogsForUser(params.userId);
      return { logs };
    },
    { params: userIdParamsSchema }
  );