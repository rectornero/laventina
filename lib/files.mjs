import { getStore } from "@netlify/blobs";
import { HttpError } from "./db.mjs";
import { newId } from "./auth.mjs";

const MAX = 5 * 1024 * 1024; // function request bodies are capped near 6 MB
const TYPES = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf)$/;

let store = null;
export function setFileStore(s) { store = s; }
// Photos and scans live in Netlify Blobs, never at public URLs. Every read goes through the session check.
// A fresh store each call: a cached one carries an expired token in a warm function ("Token expired").
const files = () => store || getStore({ name: "files", consistency: "strong" });
const key = (hid, id) => `households/${hid}/files/${id}`;

export async function saveFile(hid, uid, req) {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!TYPES.test(type)) throw new HttpError(415, "bad_type", "Upload a photo or a PDF.");
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw new HttpError(400, "empty", "The file was empty.");
  if (buf.byteLength > MAX) throw new HttpError(413, "too_large", "That file is over 5 MB. Use a smaller photo or PDF.");
  const id = newId("f");
  await files().set(key(hid, id), buf, { metadata: { type, by: uid, at: new Date().toISOString() } });
  return { id, type, size: buf.byteLength };
}

export async function readFile(hid, id) {
  if (!/^f_[A-Za-z0-9_-]{6,40}$/.test(id)) throw new HttpError(404, "not_found", "No such file.");
  const r = await files().getWithMetadata(key(hid, id), { type: "arrayBuffer" });
  if (!r) throw new HttpError(404, "not_found", "No such file.");
  return new Response(r.data, { headers: { "content-type": r.metadata?.type || "application/octet-stream", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}

export async function readFileBase64(hid, id) {
  const r = await files().getWithMetadata(key(hid, id), { type: "arrayBuffer" });
  if (!r) return null;
  return { media_type: r.metadata?.type || "image/jpeg", data: Buffer.from(r.data).toString("base64") };
}

export async function deleteFile(hid, id) {
  if (!/^f_[A-Za-z0-9_-]{6,40}$/.test(id)) return;
  await files().delete(key(hid, id));
}

// Every stored file of a household, for the export: [{ id, type, size, at }].
export async function listFiles(hid) {
  const out = [];
  const { blobs } = await files().list({ prefix: `households/${hid}/files/` });
  for (const b of blobs) {
    const id = b.key.split("/").pop();
    const m = await files().getMetadata(b.key).catch(() => null);
    out.push({ id, type: m?.metadata?.type || null, at: m?.metadata?.at || null });
  }
  return out;
}
