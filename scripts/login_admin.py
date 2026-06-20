import requests
r = requests.post('http://127.0.0.1:8000/api/auth/login', data={'username':'admin@example.com','password':'Admin@123'})
print('status', r.status_code)
try:
    j = r.json()
    token = j.get('access_token')
    print('got token', bool(token))
    if token:
        open('token.txt','w').write(token)
        print('saved token.txt')
    else:
        print(j)
except Exception as e:
    print('resp', r.text)
