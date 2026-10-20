import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { q, HttpError } from "./db.mjs";

const COOKIE = "lv_session";
const SESSION_DAYS = 60;
const MEMBER_COLORS = ["#B8A9E8", "#F4B9C8", "#A8DCC9", "#F6D3A8", "#A9CBEF", "#E4C1F0"];

export const newId = (p) => p + "_" + randomBytes(9).toString("base64url");
const sha = (s) => createHash("sha256").update(s).digest("hex");

export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export function inviteCode() {
  // Easy to read aloud: no 0/O or 1/I.
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = ""; for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s.slice(0, 4) + "-" + s.slice(4);
}

function cookieHeader(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(req) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (part.slice(0, i) === COOKIE) return part.slice(i + 1); }
  return null;
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  await q("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)", [sha(token), userId, String(SESSION_DAYS)]);
  return cookieHeader(token, SESSION_DAYS * 86400);
}
export async function endSession(req) {
  const t = readCookie(req);
  if (t) await q("delete from sessions where token_hash = $1", [sha(t)]);
  return cookieHeader("", 0);
}

// Returns { user, householdId } or throws 401.
export async function requireUser(req) {
  const t = readCookie(req);
  if (!t) throw new HttpError(401, "signed_out", "Sign in to continue.");
  const rows = await q(`select u.id, u.email, u.name, u.color, m.household_id
    from sessions s join users u on u.id = s.user_id left join members m on m.user_id = u.id
    where s.token_hash = $1 and s.expires_at > now()`, [sha(t)]);
  if (!rows.length) throw new HttpError(401, "signed_out", "Your session ended. Sign in again.");
  const r = rows[0];
  return { user: { id: r.id, email: r.email, name: r.name, color: r.color }, householdId: r.household_id };
}

export async function throttle(key) {
  const rows = await q(`insert into login_attempts (key, count, window_start) values ($1, 1, now())
    on conflict (key) do update set
      count = case when login_attempts.window_start < now() - interval '15 minutes' then 1 else login_attempts.count + 1 end,
      window_start = case when login_attempts.window_start < now() - interval '15 minutes' then now() else login_attempts.window_start end
    returning count`, [key]);
  if (rows[0].count > 10) throw new HttpError(429, "too_many_attempts", "Too many attempts. Wait 15 minutes and try again.");
}

export async function signup({ email, password, name, inviteCode: code, householdName }) {
  email = String(email || "").trim().toLowerCase();
  name = String(name || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "bad_email", "Enter a valid email address.");
  if (!name) throw new HttpError(400, "bad_name", "Enter your name.");
  if (String(password || "").length < 8) throw new HttpError(400, "weak_password", "Use a password of at least 8 characters.");
  if ((await q("select 1 from users where email = $1", [email])).length) throw new HttpError(409, "email_taken", "That email already has an account. Sign in instead.");
  let hid;
  if (code) {
    const h = await q("select id from households where invite_code = $1", [String(code).trim().toUpperCase()]);
    if (!h.length) throw new HttpError(404, "bad_invite", "That invite code does not match any household. Check it with the person who sent it.");
    hid = h[0].id;
  }
  const uid = newId("u");
  const count = hid ? (await q("select count(*)::int as n from members where household_id = $1", [hid]))[0].n : 0;
  await q("insert into users (id, email, name, pass_hash, color) values ($1, $2, $3, $4, $5)", [uid, email, name, hashPassword(password), MEMBER_COLORS[count % MEMBER_COLORS.length]]);
  if (!hid) {
    hid = newId("h");
    await q("insert into households (id, name, invite_code) values ($1, $2, $3)", [hid, String(householdName || "").trim() || "Our home", inviteCode()]);
  }
  await q("insert into members (household_id, user_id, role) values ($1, $2, $3)", [hid, uid, code ? "member" : "owner"]);
  return uid;
}

export async function login({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  await throttle("login:" + email);
  const rows = await q("select id, pass_hash from users where email = $1", [email]);
  if (!rows.length || !verifyPassword(String(password || ""), rows[0].pass_hash)) throw new HttpError(401, "bad_login", "That email and password do not match.");
  await q("delete from login_attempts where key = $1", ["login:" + email]);
  return rows[0].id;
}
