"""Bounded PostgreSQL read model of signed opt-in publications."""
import hashlib
import threading
import time
from pathlib import Path
import psycopg
from profile import verify_profile, canonical, contact_link
from search import parse, terms, index_text, rank


class Conflict(ValueError): pass


class Directory:
    def __init__(self, url, clock=time.time):
        self.clock = clock
        self.lock = threading.RLock()
        self.db = psycopg.connect(url, autocommit=True, connect_timeout=5,
                                 options='-c statement_timeout=5000 -c lock_timeout=3000')
        self.db.execute((Path(__file__).parent / 'migrations/001_discovery.sql').read_text())

    def close(self): self.db.close()

    def publish(self, controller, token, expected_revision=None):
        now = int(self.clock())
        d, s = verify_profile(token, controller, now, allow_removed=True)
        digest = hashlib.sha256(canonical(d)).hexdigest()
        with self.lock, self.db.transaction():
            # Cross-process serialization protects first-insert and monotonic revisions.
            self.db.execute('SELECT pg_advisory_xact_lock(901715463)')
            old = self.db.execute('SELECT revision,digest,created,state_revision,state_digest,policy_version,policy_digest,visibility FROM veil_discovery.profiles WHERE controller=%s FOR UPDATE', (controller,)).fetchone()
            if self.db.execute('SELECT 1 FROM veil_discovery.blocks WHERE controller=%s', (controller,)).fetchone():
                raise Conflict('hosting refused')
            # Optional compare-and-set for native publishers. Exact retries remain
            # idempotent after an ambiguous response, but changed content cannot win.
            if expected_revision is not None:
                if type(expected_revision) is not int or not 0 <= expected_revision <= 1000000:
                    raise ValueError('invalid expected revision')
                identical = old and d['revision'] == old[0] and digest == old[1]
                if not identical and expected_revision != (old[0] if old else 0):
                    raise Conflict('publication changed since review')
            sd = hashlib.sha256(canonical(s)).hexdigest() if s else None
            pd = hashlib.sha256(canonical(s['policy'])).hexdigest() if s else None
            if old:
                if d['revision'] < old[0] or (d['revision'] == old[0] and digest != old[1]): raise Conflict('stale revision')
                if old[7] == 'DELETED' and d['visibility'] != 'DELETED': raise Conflict('deleted listing is terminal')
                if d['created'] != old[2]: raise Conflict('creation changed')
                if s and (s['revision'] < old[3] or (s['revision'] == old[3] and sd != old[4]) or
                          s['policy']['policy_version'] < old[5] or (s['policy']['policy_version'] == old[5] and pd != old[6])):
                    raise Conflict('stale route or policy')
            elif self.db.execute('SELECT count(*) FROM veil_discovery.profiles').fetchone()[0] >= 5000:
                raise Conflict('directory capacity')
            # Only public content is hosted. Unlisted exports stay with their owner.
            public = d['visibility'] == 'PUBLIC'
            p = d['profile'] if public else {}
            self.db.execute('''INSERT INTO veil_discovery.profiles
                (controller,revision,digest,created,visibility,expires,token,category,search_text,state_revision,state_digest,policy_version,policy_digest)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(controller) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,
                visibility=excluded.visibility,expires=excluded.expires,token=excluded.token,category=excluded.category,
                search_text=excluded.search_text,state_revision=excluded.state_revision,state_digest=excluded.state_digest,
                policy_version=excluded.policy_version,policy_digest=excluded.policy_digest''',
                (controller,d['revision'],digest,d['created'],d['visibility'],d['expires'],token if public else None,
                 p.get('category'),index_text(p) if public else '',s['revision'] if s else old[3] if old else 0,
                 sd if s else old[4] if old else None, s['policy']['policy_version'] if s else old[5] if old else 0,
                 pd if s else old[6] if old else None))
        return {'revision':d['revision'], 'visibility':d['visibility'], 'hosted':public}

    def _clean(self):
        self.db.execute("UPDATE veil_discovery.profiles SET token=NULL,search_text='',category=NULL WHERE expires<=%s AND token IS NOT NULL", (int(self.clock()),))
        self.db.execute('DELETE FROM veil_discovery.reports WHERE day<%s', (int(self.clock())//86400-30,))

    def _valid(self, row):
        try:
            d, s = verify_profile(row[1], row[0], int(self.clock()))
            if d['visibility'] != 'PUBLIC': return None
            return d, s
        except Exception: return None

    def get(self, controller):
        with self.lock:
            self._clean()
            row = self.db.execute('''SELECT controller,token FROM veil_discovery.profiles p
                WHERE controller=%s AND visibility='PUBLIC' AND expires>%s AND token IS NOT NULL
                AND NOT EXISTS(SELECT 1 FROM veil_discovery.blocks b WHERE b.controller=p.controller)''',
                (controller, int(self.clock()))).fetchone()
            if not row or not self._valid(row): return None
            return {'publication':row[1]}

    def search(self, query, category=None):
        intent = parse(query, category)
        response = {'intent':intent, 'results':[], 'limited':False}
        if intent['blocked'] or not intent['category']: return response
        with self.lock:
            self._clean()
            sql = '''SELECT controller,token FROM veil_discovery.profiles p
                WHERE visibility='PUBLIC' AND expires>%s AND category=%s AND token IS NOT NULL
                AND NOT EXISTS(SELECT 1 FROM veil_discovery.blocks b WHERE b.controller=p.controller)'''
            args = [int(self.clock()), intent['category']]
            ts = terms(intent)
            if ts:
                sql += " AND document @@ to_tsquery('simple',%s)"
                args.append(ts)
            sql += ' ORDER BY controller LIMIT 201'
            rows = self.db.execute(sql, args).fetchall()
            response['limited'] = len(rows) > 200
            matches = []
            for row in rows[:200]:
                valid = self._valid(row)
                if not valid: continue
                d, s = valid
                match = rank(d['profile'], intent, s)
                if match:
                    score, why = match
                    matches.append((tuple(-x for x in score), row[0], {'publication':row[1], 'why':why}))
            response['results'] = [r[2] for r in sorted(matches, key=lambda r:(r[0],r[1]))[:5]]
        if not response['results']:
            response['message'] = 'No matching active, opted-in profiles. Adjust the stated constraints or try another supported task.'
        return response

    def report(self, controller, reason):
        if reason not in ('misleading', 'abuse', 'privacy'): raise ValueError('report reason')
        if not self.get(controller): return
        with self.lock:
            self.db.execute('''INSERT INTO veil_discovery.reports VALUES(%s,%s,%s,1)
                ON CONFLICT(controller,reason,day) DO UPDATE SET count=veil_discovery.reports.count+1''',
                (controller,reason,int(self.clock())//86400))

    def block(self, controller, reason):
        # Local operator command only: refuses hosting, never revokes the identity.
        if reason not in ('misleading', 'abuse', 'privacy'): raise ValueError('reason')
        with self.lock:
            self.db.execute('INSERT INTO veil_discovery.blocks VALUES(%s,%s) ON CONFLICT(controller) DO UPDATE SET reason=excluded.reason', (controller,reason))
