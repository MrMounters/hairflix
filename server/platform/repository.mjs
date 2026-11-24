// Atomic, versioned document records. SQLite for persistent Node hosts; Redis REST for serverless.
export class SqlitePlatformRepository {
  static async open(filename) {
    const { DatabaseSync } = await import("node:sqlite");
    return new this(new DatabaseSync(filename));
  }
  constructor(db) {
    this.db = db;
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS hf_records (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS hf_revision (id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL); INSERT OR IGNORE INTO hf_revision VALUES(1,0);",
    );
  }
  async read() {
    return {
      revision: this.db
        .prepare("SELECT value FROM hf_revision WHERE id=1")
        .get().value,
      records: Object.fromEntries(
        this.db
          .prepare("SELECT key,value FROM hf_records")
          .all()
          .map((x) => [x.key, JSON.parse(x.value)]),
      ),
    };
  }
  async commit(revision, changes) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (
        this.db.prepare("SELECT value FROM hf_revision WHERE id=1").get()
          .value !== revision
      ) {
        this.db.exec("ROLLBACK");
        return false;
      }
      for (const [key, value] of Object.entries(changes)) {
        if (value === null)
          this.db.prepare("DELETE FROM hf_records WHERE key=?").run(key);
        else
          this.db
            .prepare(
              "INSERT INTO hf_records VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            )
            .run(key, JSON.stringify(value));
      }
      this.db.prepare("UPDATE hf_revision SET value=value+1 WHERE id=1").run();
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
const SNAPSHOT =
  "local v=redis.call('GET',KEYS[1]) or '0'; return {v,redis.call('HGETALL',KEYS[2])}";
const COMMIT =
  "local v=tonumber(redis.call('GET',KEYS[1]) or '0'); if v~=tonumber(ARGV[1]) then return 0 end; local n=tonumber(ARGV[2]); local i=3; for j=1,n do if ARGV[i+1]=='__delete__' then redis.call('HDEL',KEYS[2],ARGV[i]) else redis.call('HSET',KEYS[2],ARGV[i],ARGV[i+1]) end; i=i+2 end; redis.call('SET',KEYS[1],v+1); return 1";
export class RedisPlatformRepository {
  constructor(url, token, fetcher = fetch) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.fetcher = fetcher;
    this.keys = [
      "hairflix:platform:v1:revision",
      "hairflix:platform:v1:records",
    ];
  }
  async command(parts) {
    const r = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw Error("Persistent storage unavailable");
    const j = await r.json();
    if (j.error) throw Error("Persistent storage unavailable");
    return j.result;
  }
  async read() {
    const [revision, flat] = await this.command([
      "EVAL",
      SNAPSHOT,
      2,
      ...this.keys,
    ]);
    const records = {};
    for (let i = 0; i < flat.length; i += 2)
      records[flat[i]] = JSON.parse(flat[i + 1]);
    return { revision: Number(revision), records };
  }
  async commit(revision, changes) {
    return (
      1 ===
      (await this.command([
        "EVAL",
        COMMIT,
        2,
        ...this.keys,
        revision,
        Object.keys(changes).length,
        ...Object.entries(changes).flatMap(([k, v]) => [
          k,
          v === null ? "__delete__" : JSON.stringify(v),
        ]),
      ]))
    );
  }
}
export async function platformRepository(env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
    return new RedisPlatformRepository(
      env.UPSTASH_REDIS_REST_URL,
      env.UPSTASH_REDIS_REST_TOKEN,
    );
  if (env.APP_DATABASE_FILE)
    return SqlitePlatformRepository.open(env.APP_DATABASE_FILE);
  return null;
}
