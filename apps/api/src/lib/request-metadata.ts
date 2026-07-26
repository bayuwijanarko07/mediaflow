/**
 * Ekstrak IP address dari request. Prioritaskan header X-Forwarded-For
 * (dipakai kalau server ada di belakang reverse proxy/VPN gateway),
 * fallback ke IP koneksi langsung dari Bun server kalau tersedia.
 *
 * Catatan untuk konteks deployment PRD (server lokal + VPN, bukan
 * cloud dengan CDN/load balancer): header X-Forwarded-For biasanya
 * kosong kecuali ada reverse proxy eksplisit di depan Elysia — dalam
 * kasus itu IP dari koneksi TCP langsung sudah representatif.
 */
export function extractIpAddress(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Header bisa berisi beberapa IP dipisah koma (client, proxy1, proxy2, ...)
    // — IP pertama adalah client asli
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return null;
}

export function extractUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}