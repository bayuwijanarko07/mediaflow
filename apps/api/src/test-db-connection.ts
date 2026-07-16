import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    await client.connect();
    const res = await client.query("SELECT NOW()");
    console.log("✅ Koneksi berhasil! Waktu server:", res.rows[0].now);
  } catch (err) {
    console.error("❌ Koneksi gagal:", err);
  } finally {
    await client.end();
  }
}

console.log("RAW:", JSON.stringify(process.env.DATABASE_URL));
main();