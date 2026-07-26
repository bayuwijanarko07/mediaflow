import { prisma } from "@mediaflow/database";

/**
 * Catat 1 percobaan login (sukses/gagal). Dipanggil dari endpoint
 * /auth/login untuk KEDUA kasus — sukses maupun gagal — supaya admin
 * bisa melihat pola percobaan mencurigakan (mis. banyak gagal beruntun
 * dari IP yang sama sebelum akhirnya sukses).
 *
 * Sengaja "fire and forget" secara logic (tidak throw ke pemanggil) —
 * kegagalan mencatat log TIDAK BOLEH menggagalkan proses login itu
 * sendiri, karena audit log adalah fitur pendukung, bukan critical path.
 */
export async function recordLoginAttempt(params: {
  email: string;
  success: boolean;
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.loginAuditLog.create({
      data: {
        email: params.email,
        success: params.success,
        userId: params.userId,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    });
  } catch (error) {
    // Jangan lempar ulang — logging gagal tidak boleh menggagalkan login
    console.error("Gagal mencatat login audit log:", error);
  }
}

/**
 * Ambil riwayat login untuk 1 user tertentu (dipakai admin untuk
 * investigasi 1 akun spesifik), urut dari yang terbaru.
 */
export async function getLoginAuditLogsForUser(userId: string, limit = 50) {
  return prisma.loginAuditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Ambil semua log login (lintas user) — dipakai dashboard admin
 * untuk monitoring umum, dengan filter opsional email dan success.
 */
export async function getAllLoginAuditLogs(params: {
  page: number;
  limit: number;
  email?: string;
  success?: boolean;
}) {
  const skip = (params.page - 1) * params.limit;

  const where: { email?: { contains: string; mode: "insensitive" }; success?: boolean } = {};
  if (params.email) {
    where.email = { contains: params.email, mode: "insensitive" };
  }
  if (params.success !== undefined) {
    where.success = params.success;
  }

  const [logs, totalItems] = await Promise.all([
    prisma.loginAuditLog.findMany({
      where,
      skip,
      take: params.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.loginAuditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}