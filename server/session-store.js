const session = require("express-session");
const db = require("./db");

const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

const SESSION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS app_sessions_expire_idx
  ON app_sessions (expire)
`;

function normalizeExpiration(sess) {
  const cookieExpiresAt = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
  if (cookieExpiresAt && !Number.isNaN(cookieExpiresAt.getTime())) {
    return cookieExpiresAt;
  }

  const maxAge = Number(sess?.cookie?.maxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) {
    return new Date(Date.now() + maxAge);
  }

  return new Date(Date.now() + 1000 * 60 * 60 * 8);
}

class PrismaSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.cleanupIntervalMs = Number(options.cleanupIntervalMs || 1000 * 60 * 15);
    this.cleanupTimer = null;
  }

  async get(sid, callback) {
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT sess, expire FROM app_sessions WHERE sid = $1 LIMIT 1`,
        sid
      );
      const row = Array.isArray(rows) ? rows[0] : null;

      if (!row) return callback(null, null);

      const expireAt = new Date(row.expire);
      if (Number.isNaN(expireAt.getTime()) || expireAt.getTime() <= Date.now()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      return callback(null, row.sess);
    } catch (error) {
      return callback(error);
    }
  }

  async set(sid, sess, callback) {
    try {
      const expireAt = normalizeExpiration(sess);
      await db.$executeRawUnsafe(
        `
        INSERT INTO app_sessions (sid, sess, expire, created_at, updated_at)
        VALUES ($1, $2::jsonb, $3, NOW(), NOW())
        ON CONFLICT (sid)
        DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire, updated_at = NOW()
        `,
        sid,
        JSON.stringify(sess),
        expireAt
      );
      return callback?.(null);
    } catch (error) {
      return callback?.(error);
    }
  }

  async destroy(sid, callback) {
    try {
      await db.$executeRawUnsafe(`DELETE FROM app_sessions WHERE sid = $1`, sid);
      return callback?.(null);
    } catch (error) {
      return callback?.(error);
    }
  }

  async touch(sid, sess, callback) {
    try {
      const expireAt = normalizeExpiration(sess);
      await db.$executeRawUnsafe(
        `UPDATE app_sessions SET expire = $2, updated_at = NOW() WHERE sid = $1`,
        sid,
        expireAt
      );
      return callback?.(null);
    } catch (error) {
      return callback?.(error);
    }
  }

  async pruneExpiredSessions() {
    await db.$executeRawUnsafe(`DELETE FROM app_sessions WHERE expire <= NOW()`);
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.pruneExpiredSessions().catch((error) => {
        console.error("Erro ao limpar sessões expiradas:", error);
      });
    }, this.cleanupIntervalMs);

    this.cleanupTimer.unref?.();
  }

  stopCleanupTimer() {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

async function ensureSessionTable() {
  await db.$executeRawUnsafe(SESSION_TABLE_SQL);
  await db.$executeRawUnsafe(SESSION_INDEX_SQL);
}

module.exports = {
  PrismaSessionStore,
  ensureSessionTable,
};
