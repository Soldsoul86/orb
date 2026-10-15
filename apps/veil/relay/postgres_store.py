"""Small DB adapter; relay SQL remains parameterized. No encryption keys live here."""
import psycopg

SCHEMA = (
    "CREATE TABLE IF NOT EXISTS boxes(id TEXT PRIMARY KEY, reader BYTEA, writer BYTEA, expires BIGINT)",
    "CREATE TABLE IF NOT EXISTS messages(box TEXT, id TEXT, body TEXT, expires BIGINT, seq BIGSERIAL, PRIMARY KEY(box,id))",
    "CREATE TABLE IF NOT EXISTS receipts(box TEXT, id TEXT, expires BIGINT, PRIMARY KEY(box,id))",
    "CREATE INDEX IF NOT EXISTS messages_expiry ON messages(expires)",
    "CREATE INDEX IF NOT EXISTS boxes_expiry ON boxes(expires)",
    "CREATE INDEX IF NOT EXISTS receipts_expiry ON receipts(expires)",
)

class PostgresStore:
    """One serialized connection, reconnecting on the request after a disconnect.

    A transaction-level advisory lock also covers overlapping instances during deploys,
    so quota checks and idempotency receipts stay atomic across the whole relay.
    Never retry a possibly committed operation here; the caller's message ID handles it.
    """
    def __init__(self, url):
        self.url = url
        self.connection = self.connect()
        with self:
            for statement in SCHEMA:
                self.connection.execute(statement)

    def connect(self):
        return psycopg.connect(self.url, autocommit=True, connect_timeout=10,
                               options="-c statement_timeout=10000 -c lock_timeout=5000")

    def __enter__(self):
        if self.connection.closed:
            self.connection = self.connect()
        self.transaction = self.connection.transaction()
        self.transaction.__enter__()
        try:
            self.connection.execute("SELECT pg_advisory_xact_lock(901715461)")
        except BaseException:
            import sys
            self.transaction.__exit__(*sys.exc_info())
            raise
        return self

    def __exit__(self, *args):
        return self.transaction.__exit__(*args)

    def execute(self, sql, parameters=()):
        # Only fixed SQL authored by this relay reaches this adapter.
        return self.connection.execute(sql.replace('?', '%s'), parameters)

    def close(self):
        self.connection.close()
