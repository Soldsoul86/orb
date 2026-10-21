"""Explicit disposable TEST setup. No production CLI, no scraped people."""
import argparse
from fixtures import seed,test_database_url
from directory import Directory
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--i-understand-test-fixtures',action='store_true');a=p.parse_args()
    if not a.i_understand_test_fixtures:p.error('Explicit TEST-only acknowledgement required')
    d=Directory(test_database_url());seed(d);d.close()
    print('TEST fixtures published to the disposable test database. Never present them as real professionals.')
