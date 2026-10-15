"""Deterministic policy validation and server-time evaluation. No language model."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

class PolicyError(ValueError): pass

def validate(p):
    keys = {'display_name','description','discovery_mode','contact_request_mode','allowed_content_types',
            'schedule','outside_hours_behavior','first_contact_message_limit','inactivity_days',
            'expires_at','notification_behavior','status','policy_version'}
    if not isinstance(p, dict) or set(p) != keys: raise PolicyError('unknown or missing policy field')
    if not isinstance(p['display_name'],str) or not 1 <= len(p['display_name'].strip()) <= 60: raise PolicyError('name')
    if not isinstance(p['description'],str) or len(p['description']) > 240: raise PolicyError('description')
    enums = {'discovery_mode': {'UNLISTED','LINK_ONLY','PUBLIC_SEARCHABLE'},
             'contact_request_mode': {'DISABLED','REQUEST_APPROVAL','AUTO_ACCEPT_WITH_LIMITS'},
             'outside_hours_behavior': {'REJECT','ACCEPT_AND_QUEUE'},
             'notification_behavior': {'SILENT_IN_APP'}, 'status': {'ACTIVE','PAUSED','REVOKED'}}
    for k, allowed in enums.items():
        if not isinstance(p[k],str) or p[k] not in allowed: raise PolicyError(k)
    types = p['allowed_content_types']
    # This milestone supports text only in purpose conversations. No fake file support.
    if types != ['text']: raise PolicyError('purpose conversations currently support text only')
    if type(p['first_contact_message_limit']) is not int or p['first_contact_message_limit'] != 1: raise PolicyError('one introduction only')
    for k, low, high in [('inactivity_days',1,90),('policy_version',1,1000000),('expires_at',0,4102444800)]:
        if type(p[k]) is not int or not low <= p[k] <= high: raise PolicyError(k)
    s = p['schedule']
    if not isinstance(s,dict) or set(s) != {'timezone','weekdays','start','end'}: raise PolicyError('schedule fields')
    try:
        if not isinstance(s['timezone'],str) or len(s['timezone'])>80: raise ValueError()
        ZoneInfo(s['timezone'])
    except (ZoneInfoNotFoundError, ValueError): raise PolicyError('IANA timezone required')
    days=s['weekdays']
    if not isinstance(days,list) or not days or any(type(d) is not int or d not in range(1,8) for d in days) or len(days)!=len(set(days)): raise PolicyError('weekdays')
    for k in ('start','end'):
        if type(s[k]) is not int or not 0 <= s[k] <= 1440: raise PolicyError('minutes')
    if not s['start'] < s['end']: raise PolicyError('overnight/empty windows unsupported; split not silently inferred')
    return p

def is_open(p, at):
    local=datetime.fromtimestamp(at,timezone.utc).astimezone(ZoneInfo(p['schedule']['timezone']))
    s=p['schedule']; minute=local.hour*60+local.minute
    return local.isoweekday() in s['weekdays'] and s['start'] <= minute < s['end']

def active(p, at):
    return p['status']=='ACTIVE' and (not p['expires_at'] or at < p['expires_at'])
