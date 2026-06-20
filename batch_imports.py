import requests
import os

BASE = "http://127.0.0.1:8000/api"

def load_token():
    try:
        with open('token.txt') as f:
            return f.read().strip()
    except:
        return None

headers = {}
token = load_token()
if token:
    headers['Authorization'] = f'Bearer {token}'

endpoints = [
    ('customers', 'test_data/customers.csv'),
    ('agents', 'test_data/agents.csv'),
    ('expenses', 'test_data/expenses.csv'),
    ('products', 'test_data/products.csv'),
    ('orders', 'test_data/orders.csv'),
    ('visits', 'test_data/visits.csv'),
]

for name, path in endpoints:
    url = f"{BASE}/{name}/import" if name != 'products' else f"{BASE}/inventory/products/import"
    print('\nUploading', path, '->', url)
    if not os.path.exists(path):
        print('  file missing, skipping')
        continue
    with open(path, 'rb') as f:
        files = {'file': (os.path.basename(path), f, 'text/csv')}
        try:
            r = requests.post(url, files=files, headers=headers)
            print('  status', r.status_code)
            try:
                print('  json:', r.json())
            except Exception as e:
                print('  resp text:', r.text)
        except Exception as e:
            print('  error', e)
