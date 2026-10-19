"""Dedicated schema and connection; never touches existing v1/v2 tables or credentials."""
import re
import psycopg

class PortablePostgres:
    def __init__(self,url):
        self.url=url;self.connection=self.connect()
        self.connection.execute('CREATE SCHEMA IF NOT EXISTS veil_portable')
    def connect(self):
        return psycopg.connect(self.url,autocommit=True,connect_timeout=10,
            options='-c statement_timeout=10000 -c lock_timeout=5000 -c search_path=veil_portable')
    def __enter__(self):
        if self.connection.closed:self.connection=self.connect()
        self.transaction=self.connection.transaction();self.transaction.__enter__()
        try:self.connection.execute('SELECT pg_advisory_xact_lock(901715462)')
        except BaseException:
            import sys
            self.transaction.__exit__(*sys.exc_info());raise
        return self
    def __exit__(self,*args):return self.transaction.__exit__(*args)
    def executescript(self,script):
        with self:
            for statement in script.split(';'):
                s=statement.strip()
                if not s or s.startswith('PRAGMA'):continue
                s=s.replace('INTEGER','BIGINT')
                if s.startswith('CREATE TABLE IF NOT EXISTS messages('):s=s.replace('PRIMARY KEY(grant_id,id)','seq BIGSERIAL,PRIMARY KEY(grant_id,id)')
                if s.startswith('INSERT OR IGNORE'):
                    s=s.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING'
                self.connection.execute(s)
    def execute(self,sql,parameters=()):
        return self.connection.execute(sql.replace('INSERT INTO messages VALUES','INSERT INTO messages(grant_id,id,sender,body,expires) VALUES').replace('?','%s').replace('ORDER BY rowid','ORDER BY seq'),parameters)
    def close(self):self.connection.close()
