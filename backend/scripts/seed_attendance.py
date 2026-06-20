"""Seed script to insert sample attendance (PunchRecord) rows.

Run from repository root:

    python -m backend.scripts.seed_attendance

It uses the application's SQLAlchemy session configuration.
"""
from datetime import datetime, date, timedelta
from backend.app.database import SessionLocal
from backend.app.models.models import PunchRecord, User

def create_sample_records(session, agent_user, count=5):
    base_date = date.today() - timedelta(days=7)
    for i in range(count):
        work_date = base_date + timedelta(days=i)
        punch_in = datetime.combine(work_date, datetime.min.time()).replace(hour=9, minute=0)
        punch_out = punch_in.replace(hour=17, minute=15)
        rec = PunchRecord(
            agent_id=agent_user.id,
            punch_in_time=punch_in,
            punch_out_time=punch_out,
            punch_in_lat=0.0,
            punch_in_lng=0.0,
            punch_out_lat=0.0,
            punch_out_lng=0.0,
            work_date=work_date,
            total_hours=8.25,
            distance_covered=0.0,
            notes=f"Seeded record {i+1}",
        )
        session.add(rec)

def main():
    session = SessionLocal()
    try:
        # Attempt to find any user to assign as agent; fall back to creating a dummy user
        agent_user = session.query(User).filter(User.role == 'agent').first()
        if not agent_user:
            # Create a minimal agent user; adapt fields to match User model
            agent_user = User(
                employee_id='SEED001',
                full_name='Seed Agent',
                email='seed.agent@example.com',
                phone='0000000000',
                hashed_password='seeded-password',
                role='field_agent',
                status='active',
                online_status='offline',
                is_active=True,
            )
            session.add(agent_user)
            session.commit()
            session.refresh(agent_user)

        create_sample_records(session, agent_user, count=7)
        session.commit()
        print(f"Seeded attendance records for agent id={agent_user.id}")
    finally:
        session.close()

if __name__ == '__main__':
    main()
