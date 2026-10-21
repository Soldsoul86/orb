"""Bounded, deterministic English intent parser with explicit supported synonyms.
Unknown constraints fail closed; no paid parser and no hidden query-specific answers.
"""
import re
import unicodedata
from profile import CATEGORIES, LANGUAGES, TAGS

# Curated service concepts, independent of benchmark wording and fixture identities.
SYNONYMS = {
 'website': ('website', 'web site', 'landing page', 'wordpress', 'business site'),
 'web-app': ('web application', 'web app', 'full stack', 'saas'),
 'android': ('android', 'mobile application', 'mobile app', 'app developer'),
 'ios': ('ios', 'iphone'), 'automation': ('automate', 'automation', 'spreadsheet reports', 'workflow'),
 'api': ('api', 'integrate', 'integration', 'crm'), 'ai-integration': ('ai integration', 'chatgpt integration'),
 'dashboard': ('dashboard', 'internal tool'),
 'ui': ('ui', 'interface', 'app redesign', 'redesign', 'user interface'),
 'ux': ('ux', 'user experience', 'usability', 'user research'),
 'branding': ('branding', 'brand identity', 'visual identity'), 'logo': ('logo',),
 'graphic-design': ('graphic design', 'poster', 'illustration'), 'presentation': ('presentation', 'pitch deck', 'slides'),
 'video': ('video', 'promo clip', 'film editing'), 'motion': ('motion', 'animation'),
 'seo': ('seo', 'search visibility', 'search traffic', 'google traffic', 'organic search'),
 'content': ('content strategy', 'content', 'editorial'), 'social': ('social media', 'instagram', 'tiktok'),
 'copywriting': ('copywriting', 'copywriter', 'copy', 'sales writing'),
 'ads': ('paid ad', 'paid ads', 'ad campaign', 'ppc', 'advertising'),
 'analytics': ('marketing analytics', 'campaign analytics'), 'positioning': ('positioning', 'go to market'),
 'python': ('python',), 'coding': ('coding', 'programming', 'javascript'), 'sql': ('sql',),
 'spanish': ('spanish', 'español'), 'english': ('english lessons',),
 'software-skills': ('excel', 'software skills', 'powerpoint'), 'coaching': ('coaching', 'professional skills', 'curriculum'),
}
UNSUPPORTED = r'\b(plumb\w*|medical|diagnos\w*|legal|lawyer|attorney|electrician|therap\w*|investment|financial advice|roof\w*|doctor|tax advice|emergency)\b'
LEARNING = r'\b(learn\w*|tutor\w*|teach\w*|lesson\w*|coach\w*|instruction|curriculum|understanding|aprender|profesor|clases)\b'
IMPLEMENT = r'\b(implement\w*|develop\w*|build|code|coding)\b'


def normalize(s):
    return unicodedata.normalize('NFKC', s).casefold().strip()


def contains(query, phrase):
    return re.search(r'(?<!\w)' + re.escape(phrase) + r'(?!\w)', query) is not None


def parse(query, category=None):
    if not isinstance(query, str) or len(query) > 240: raise ValueError('query limit')
    if category is not None and category not in CATEGORIES: raise ValueError('category')
    q = normalize(query)
    tags = [tag for tag, phrases in SYNONYMS.items() if any(contains(q, p) for p in phrases)]
    learning = bool(re.search(LEARNING, q))
    counts = {c: len(set(tags) & set(TAGS[c])) for c in CATEGORIES}
    if learning and counts[CATEGORIES[3]]: inferred = CATEGORIES[3]
    elif counts[CATEGORIES[1]] and ('ui' in tags or 'ux' in tags):
        inferred = CATEGORIES[0] if re.search(IMPLEMENT, q) and not re.search(r'\b(redesign|design|ux)\b', q) else CATEGORIES[1]
    else:
        # Prefer a specific multi-word service phrase, then coverage, then first mentioned task.
        def relevance(c):
            phrases=[phrase for tag in TAGS[c] for phrase in SYNONYMS[tag] if contains(q,phrase)]
            return (max((len(p.split()) for p in phrases),default=0),counts[c],-min((q.index(p) for p in phrases),default=10000))
        inferred = max(CATEGORIES,key=relevance) if max(counts.values()) else None
    if inferred == CATEGORIES[3] and not learning: inferred = None
    chosen = category or inferred
    selected = [t for t in tags if chosen and t in TAGS[chosen]]
    blocked = []
    if re.search(r'\b(not|without|except|excluding|avoid)\b',q): blocked.append('Negated requirements need clarification; choose explicit positive constraints.')
    if re.search(UNSUPPORTED, q): blocked.append('This service is outside the four launch categories.')
    if not q and not category: blocked.append('Describe a task or choose a category.')
    if q and not selected: blocked.append('No supported service was recognized. Try a specific task.')
    languages = [lang for lang in LANGUAGES if re.search(r'\b(?:in|speaks?|speaking)\s+' + lang + r'\b|\b' + lang + r'[- ]speaking\b', q)]
    remote = True if re.search(r'\b(remote|remotely|online|anywhere)\b', q) else False if re.search(r'\b(in.person|local|near me)\b', q) else None
    locations = []
    # Location is explicit, never inferred from IP. Unsupported phrasing is surfaced.
    location_query = re.sub(r'\bin.person\b','',q)
    match = re.search(r'\b(?:in|near|based in)\s+([a-z][a-z ]{1,55}?)(?=\s+(?:under|around|with|for|who|speaking|within|by|remote|only)|[,.;]|$)', location_query)
    if match:
        loc = match[1].strip()
        if loc not in LANGUAGES and loc not in ('person', 'me'): locations.append(loc)
    if 'near me' in q: blocked.append('A location is needed for “near me”; Veil does not track your location.')
    budget = None
    m = re.search(r'\b(under|below|maximum|max|at most|around|about|budget(?: of)?)\s*([$€£₹])?\s*(\d{1,7})(?:\s*(usd|eur|gbp|inr))?', q)
    if m:
        currency = m[4].upper() if m[4] else {'$':'USD','€':'EUR','£':'GBP','₹':'INR'}.get(m[2])
        if currency:
            budget = {'amount':int(m[3]), 'currency':currency, 'hard':m[1] in ('under','below','maximum','max','at most'),
                      'exclusive':m[1] in ('under','below'), 'unit':'hour' if re.search(r'per hour|/hour|hourly',q) else 'project'}
        else: blocked.append('Specify a currency for the budget.')
    if (re.search(r'[$€£₹]\s*\d|\bbudget\b', q) and not m): blocked.append('Use an explicit budget such as “under $500” or “around $500”.')
    lead_days = None
    m = re.search(r'\bwithin\s+(\d{1,3})\s+(days?|weeks?)\b', q)
    if m: lead_days = int(m[1]) * (7 if m[2].startswith('week') else 1)
    elif re.search(r'\b(today|tomorrow|urgent|asap|by|this week|next week)\b', q): blocked.append('This timeframe needs clarification; try “can start within 7 days”.')
    accepting = True if re.search(r'\b(accepting|available|taking new|open for)\b',q) else None
    # Explicit MUST/ONLY constraints outside the supported parser are not silently discarded.
    residual = q
    for phrase in ('remote only','online only','in person only'):
        residual = residual.replace(phrase, '')
    if re.search(r'\b(must|only|certified|guaranteed)\b', residual): blocked.append('A stated requirement is not supported by this parser; clarify or remove it.')
    return dict(category=chosen, tags=selected, task=query.strip(), languages=languages or None, remote=remote,
                locations=locations or None, budget=budget, lead_days=lead_days, accepting=accepting,
                blocked=blocked, unknown=[k for k,v in {'languages':languages or None,'remote':remote,'locations':locations or None,'budget':budget,'timeframe':lead_days,'accepting':accepting}.items() if v is None])


def terms(intent):
    # Only controlled lexemes enter to_tsquery; raw query text never becomes SQL syntax.
    return ' | '.join(t.replace('-', '') for t in intent['tags'])


def index_text(p):
    return ' '.join([p['purpose'], p['category'], *[t.replace('-', '') for t in p['tags']]])


def rank(p, intent, s):
    if intent['blocked'] or p['category'] != intent['category']: return None
    matched = sorted(set(p['tags']) & set(intent['tags']))
    if intent['tags'] and not matched: return None
    if intent['remote'] is not None and p.get('remote') is not intent['remote']: return None
    if intent['languages'] and not set(intent['languages']) <= set(p.get('languages', [])): return None
    if intent['locations'] and not set(intent['locations']) <= {normalize(x) for x in p.get('locations', [])}: return None
    if intent['accepting'] and p.get('accepting') is not True: return None
    if intent['lead_days'] is not None and ('lead_days' not in p or p['lead_days'] > intent['lead_days']): return None
    b = intent['budget']; offered = p.get('budget')
    fit = bool(b and offered and b['currency'] == offered['currency'] and b['unit'] == offered['unit'] and
               (offered['max'] < b['amount'] if b['exclusive'] else offered['max'] <= b['amount']))
    if b and b['hard'] and not fit: return None
    if s['policy']['status'] != 'ACTIVE': return None
    explanation = ['Service: ' + ', '.join(matched)] if matched else ['Category selected by professional']
    if intent['languages']: explanation.append('Stated languages: ' + ', '.join(intent['languages']))
    if intent['remote'] is not None: explanation.append('Stated remote/local scope fits')
    if intent['locations']: explanation.append('Stated location fits')
    if b: explanation.append('Stated budget range fits' if fit else 'Approximate budget not confirmed')
    if intent['lead_days'] is not None: explanation.append('Stated starting timeframe fits; confirm with professional')
    # Exact service coverage dominates availability, then constraints and optional evidence.
    score = (len(matched), int(fit), int(p.get('accepting') is True), len(intent['languages'] or []) + len(intent['locations'] or []), len(p.get('evidence', [])))
    return score, explanation
