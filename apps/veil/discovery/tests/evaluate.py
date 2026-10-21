"""Runs the committed gold judgments against real PostgreSQL retrieval + ranking."""
import json
import os
import sys
from pathlib import Path
from fixtures import make,seed
from directory import Directory


def evaluate(directory,now=None):
    seed(directory,now)
    ids={make(name,now)[0]:name for name in __import__('fixtures').PEOPLE}
    cases=json.loads((Path(__file__).parent/'gold.json').read_text())
    rows=[];p3=[];returned_precision=[];recall=[];zero_correct=zero_returned=hard_violations=relevance_violations=0
    for case in cases:
        response=directory.search(case['query']);got=[]
        for r in response['results']:
            from profile import verify_profile
            from open_verifier import strict_json,decode,public_id
            identifier=public_id(strict_json(decode(r['publication'].split('.')[0]))['jwk']);got.append(ids[identifier])
        relevant=set(case['relevant']);hits=len(set(got[:3])&relevant)
        if relevant:
            p3.append(hits/3);returned_precision.append(hits/min(3,len(got)) if got else 0);recall.append(len(set(got[:5])&relevant)/len(relevant))
        if not got:zero_returned+=1;zero_correct+=not relevant
        # Gold no-fit and wrongly included profiles count; parser tests separately validate constraints.
        relevance_violations+=len(set(got)-relevant)
        # Independent, authored constraint labels; do not reuse parser/ranker for this metric.
        for name in got:
            p=make(name,now)[2]['profile'];c=case.get('hard_constraints',{})
            bad=any(k in c and p.get(k)!=c[k] for k in ('remote','accepting'))
            bad |= any(k in c and not set(c[k])<=set(p.get(k,[])) for k in ('languages','locations'))
            bad |= 'lead_days' in c and p.get('lead_days',100000)>c['lead_days']
            if 'max_budget_exclusive' in c:
                b=p.get('budget',{});bad |= b.get('max',100000000)>=c['max_budget_exclusive'] or b.get('currency')!=c['currency'] or b.get('unit')!=c['unit']
            hard_violations+=int(bad)
        rows.append({'id':case['id'],'query':case['query'],'expected':case['relevant'],'actual':got,'pass':set(got)==relevant})
    mean=lambda a:round(sum(a)/len(a),4)
    report={'cases':len(cases),'per_category':20,'ambiguous':sum(c['ambiguous'] for c in cases),
        'hard_negatives':sum(c['hard_negative'] for c in cases),'precision_at_3_fixed_denominator':mean(p3),
        'precision_at_3_returned_results':mean(returned_precision),'recall_at_5':mean(recall),
        'zero_result_precision':round(zero_correct/zero_returned,4) if zero_returned else None,
        'hard_constraint_violation_count':hard_violations,'relevance_violation_count':relevance_violations,'exact_set_passes':sum(r['pass'] for r in rows),'details':rows}
    return report


if __name__=='__main__':
    d=Directory(__import__('fixtures').test_database_url())
    # Dedicated disposable test DB required; caller creates schema or clears only this schema.
    d.db.execute('TRUNCATE veil_discovery.profiles,veil_discovery.blocks,veil_discovery.reports')
    report=evaluate(d)
    output=Path(__file__).parents[1]/'evidence/search-evaluation.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='details'},indent=2));d.close()
