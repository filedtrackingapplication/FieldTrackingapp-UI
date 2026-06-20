import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import create_tables, SessionLocal
from app.models.models import User, PunchRecord


@pytest.fixture(scope="module")
def client():
    # ensure tables exist
    create_tables()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def make_admin(session):
    admin = session.query(User).filter(User.role == 'admin').first()
    if not admin:
        admin = User(
            employee_id='ADM001',
            full_name='Admin Tester',
            email='admin@example.com',
            phone='1111111111',
            hashed_password='x',
            role='admin',
            status='active',
            online_status='offline',
            is_active=True,
        )
        session.add(admin)
        session.commit()
        session.refresh(admin)
    return admin


def test_list_attendance_overrides_dependency(client, db_session, monkeypatch):
    admin = make_admin(db_session)

    # create a sample punch record
    rec = PunchRecord(
        agent_id=admin.id,
        punch_in_time=None,
        punch_out_time=None,
        work_date=None,
        total_hours=0.0,
    )
    db_session.add(rec)
    db_session.commit()

    # override auth dependency to return our admin
    def fake_get_current_user():
        return admin

    monkeypatch.setattr('app.routers.attendance.get_current_user', lambda: admin)

    resp = client.get('/api/admin/attendance/')
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_adjust_attendance_and_export(client, db_session, monkeypatch):
    admin = make_admin(db_session)

    # create a sample punch record with a valid date
    from datetime import date, datetime
    rec = PunchRecord(
        agent_id=admin.id,
        punch_in_time=datetime.utcnow(),
        punch_out_time=None,
        work_date=date.today(),
        total_hours=0.0,
    )
    db_session.add(rec)
    db_session.commit()
    db_session.refresh(rec)

    # monkeypatch auth to return admin
    monkeypatch.setattr('app.routers.attendance.get_current_user', lambda: admin)

    # adjust the record
    payload = {
        "punch_out_time": datetime.utcnow().isoformat(),
        "notes": "Adjusted by test",
        "total_hours": 8.5
    }
    resp = client.put(f"/api/admin/attendance/{rec.id}", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get('id') == rec.id
    assert data.get('notes') == "Adjusted by test"

    # test export (POST)
    resp2 = client.post('/api/admin/attendance/export', json={})
    assert resp2.status_code == 200
    # CSV should contain header and at least one line
    text = resp2.content.decode('utf-8')
    assert 'id,agent_id,work_date' in text
