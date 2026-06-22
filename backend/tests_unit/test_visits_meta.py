from fastapi.testclient import TestClient
from app.main import app


def test_visit_statuses_endpoint():
    client = TestClient(app)
    resp = client.get('/api/visits/meta/statuses')
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item.get('value') == 'planned' for item in data)


def test_visit_types_endpoint():
    client = TestClient(app)
    resp = client.get('/api/visits/meta/types')
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item.get('value') == 'order_taking' for item in data)
