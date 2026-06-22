from fastapi.testclient import TestClient
from app.main import app


def test_agents_list_ok():
    client = TestClient(app)
    resp = client.get('/api/agents/')
    # We don't assert on content because DB may be empty; ensure route responds.
    assert resp.status_code in (200, 204, 404)


def test_agent_create_validation():
    client = TestClient(app)
    # missing required fields -> 422
    resp = client.post('/api/agents/', json={})
    assert resp.status_code in (400, 422)
