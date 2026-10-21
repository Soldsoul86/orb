"""Fail closed. An environment variable, URL parameter or UI flag cannot authorize launch."""
import sys
BLOCKERS=['reviewed Matrix-native guest adapters with verified purpose/device binding','browser/Android encrypted request and reply proof plus provider permission enforcement','independent integration and web-delivery security review plus physical-device verification']
if __name__=='__main__':
    print('BLOCKED: public guest release requires '+', '.join(BLOCKERS))
    sys.exit(2)
