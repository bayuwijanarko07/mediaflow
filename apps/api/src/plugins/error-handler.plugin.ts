import { Elysia } from "elysia";

export const errorHandlerPlugin = new Elysia().onError(
  ({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { message: "Validasi gagal", details: error.message };
    }

    if (set.status === 401) {
      return { message: error.message || "Unauthorized" };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Endpoint tidak ditemukan" };
    }

    console.error(error);
    set.status = set.status && set.status !== 200 ? set.status : 500;
    return { message: "Terjadi kesalahan pada server" };
  }
);