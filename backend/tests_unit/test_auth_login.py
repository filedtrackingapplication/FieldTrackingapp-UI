import atexit
import os
import tempfile
from pathlib import Path
from sqlalchemy.exc import OperationalError

from fastapi.testclient import TestClient

# Use an isolated SQLite file for this test module to avoid external file locks.
db_fd, db_path = tempfile.mkstemp(suffix='.db')
os.close(db_fd)
db_path = Path(db_path).as_posix()
os.environ['DATABASE_URL'] = f'sqlite:///{db_path}'
atexit.register(lambda: Path(db_path).unlink(missing_ok=True))

from app.database import SessionLocal, get_db, create_tables
from app.main import app
from app.models.models import User, UserRole
from app.services.auth_service import hash_password

create_tables()


def test_login_succeeds_when_commit_fails():
    db = SessionLocal()
    user = User(
        employee_id='LOGIN-COMMIT-TEST',
        full_name='Login Commit Test',
        email='login-commit@example.com',
        phone='9990000001',
        hashed_password=hash_password('pass123'),
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    original_commit = db.commit

    def failing_commit():
        raise OperationalError('database is locked', None, None)

    db.commit = failing_commit  # type: ignore[assignment]

    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            resp = client.post(
                '/api/auth/login',
                data={'username': user.email, 'password': 'pass123'},
            )
    finally:
        app.dependency_overrides.clear()
        db.commit = original_commit  # type: ignore[assignment]
        db.close()

    assert resp.status_code == 200
    payload = resp.json()
    assert 'access_token' in payload
    assert payload['token_type'] == 'bearer'
