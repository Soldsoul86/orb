"""Fail closed. An environment variable, URL parameter or UI flag cannot authorize launch."""
import sys
BLOCKERS=['reviewed browser Signal implementation','browser/Android request and reply interoperability','independent integration and web-delivery security review']
if __name__=='__main__':
    print('BLOCKED: public guest release requires '+', '.join(BLOCKERS))
    sys.exit(2)
