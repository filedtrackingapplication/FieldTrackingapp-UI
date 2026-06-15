#!/usr/bin/env python3
"""
Cleanup script for Field Tracking App
=======================================
Removes all test data previously created by seed_test_data.py.

Two modes are available:

  Soft delete (default)
    Deactivates users via DELETE /api/agents/{id}  (sets is_active=False)
    Marks customers inactive via PUT  /api/customers/{id}  (is_active=False)
    Records remain in the DB but are excluded from normal queries.

  Hard delete (--hard-delete)
    Permanently removes records from the database using SQLAlchemy directly.
    Cascades remove dependent visits, orders, punch records, expenses, etc.
    Requires this script to be run from within the backend Python environment
    (i.e., with the same Python that has the app's dependencies installed).

Reads:
    scripts/test_manifest.json   — written by seed_test_data.py

Usage
-----
    # Soft deactivate (safe, reversible)
    python scripts/cleanup_test_data.py

    # Hard permanent delete (irreversible)
    python scripts/cleanup_test_data.py --hard-delete

    # Target a non-default backend
    python scripts/cleanup_test_data.py --base-url http://staging.example.com:8000
"""

import argparse
import json
import sys
from pathlib import Path

import requests

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_BASE_URL = "http://localhost:8000"
MANIFEST_FILE    = Path(__file__).parent / "test_manifest.json"


# ─── Helpers ──────────────────────────────────────────────────────────────────

class Colors:
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    RESET  = "\033[0m"


def log(msg: str, level: str = "INFO") -> None:
    color = {
        "INFO":    Colors.GREEN,
        "SECTION": Colors.CYAN,
        "WARN":    Colors.YELLOW,
        "ERROR":   Colors.RED,
    }.get(level, "")
    print(f"{color}[{level}]{Colors.RESET} {msg}")


def _login(base_url: str, email: str, password: str) -> str:
    r = requests.post(
        f"{base_url}/api/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _make_session(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    })
    return s


# ─── Soft-delete via API ──────────────────────────────────────────────────────

def _soft_delete(base_url: str, manifest: dict, session: requests.Session) -> None:
    """
    Deactivate users (DELETE /api/agents/{id}) and mark customers inactive.
    Admins are deactivated last to keep the current token valid throughout.
    """
    all_non_admin = (
        manifest.get("drivers",      [])
        + manifest.get("field_agents", [])
        + manifest.get("managers",     [])
    )

    log(f"── Deactivating {len(all_non_admin)} users (drivers / agents / managers) ──", "SECTION")
    for u in all_non_admin:
        r = session.delete(f"{base_url}/api/agents/{u['id']}")
        if r.status_code in (200, 404):
            log(f"  Deactivated user id={u['id']}  ({u.get('email', '')})")
        else:
            log(f"  WARNING  user id={u['id']}  {r.status_code} {r.text}", "WARN")

    customers = manifest.get("customers", [])
    log(f"── Marking {len(customers)} customers inactive ──────────────────────────", "SECTION")
    for c in customers:
        r = session.put(f"{base_url}/api/customers/{c['id']}", json={"is_active": False})
        if r.status_code in (200, 404):
            log(f"  Deactivated customer id={c['id']}  ({c.get('name', '')})")
        else:
            log(f"  WARNING  customer id={c['id']}  {r.status_code} {r.text}", "WARN")

    admins = manifest.get("admins", [])
    log(f"── Deactivating {len(admins)} admin accounts ────────────────────────────", "SECTION")
    # Deactivate in reverse order so the primary admin (used for auth) stays active longest
    for a in reversed(admins):
        r = session.delete(f"{base_url}/api/agents/{a['id']}")
        if r.status_code in (200, 404):
            log(f"  Deactivated admin id={a['id']}  ({a.get('email', '')})")
        else:
            log(f"  WARNING  admin id={a['id']}  {r.status_code} {r.text}", "WARN")


# ─── Hard-delete via SQLAlchemy ───────────────────────────────────────────────

def _hard_delete(manifest: dict) -> None:
    """
    Permanently purge test records from the database.

    Deletion order:
      1. Customers  (cascade → visits, orders referencing those customers)
      2. Users      (cascade → locations, punch_records, visits, orders,
                               expenses, odometer_logs, inventory_assignments)
    """
    try:
        backend_path = Path(__file__).parent.parent / "backend"
        sys.path.insert(0, str(backend_path))

        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.config import settings
        from app.models.models import Customer, User
    except ImportError as exc:
        log(
            f"Cannot import backend modules: {exc}\n"
            "  Run this script from within the backend Python environment\n"
            "  (the same virtualenv / container that runs the FastAPI app).",
            "ERROR",
        )
        sys.exit(1)

    engine    = create_engine(settings.DATABASE_URL)
    DBSession = sessionmaker(bind=engine)
    db        = DBSession()

    customer_ids = [c["id"] for c in manifest.get("customers", [])]
    user_ids = (
        [a["id"] for a in manifest.get("admins",       [])]
        + [m["id"] for m in manifest.get("managers",   [])]
        + [a["id"] for a in manifest.get("field_agents", [])]
        + [d["id"] for d in manifest.get("drivers",    [])]
    )

    try:
        # Step 1: customers (cascades their visits + orders)
        log(f"── Hard-deleting {len(customer_ids)} customers ─────────────────────────", "SECTION")
        deleted_c = (
            db.query(Customer)
            .filter(Customer.id.in_(customer_ids))
            .delete(synchronize_session=False)
        )
        log(f"  Removed {deleted_c} customer rows (+ cascaded visits/orders).")

        # Step 2: users (cascades all their child records)
        log(f"── Hard-deleting {len(user_ids)} users ─────────────────────────────────", "SECTION")
        deleted_u = (
            db.query(User)
            .filter(User.id.in_(user_ids))
            .delete(synchronize_session=False)
        )
        log(f"  Removed {deleted_u} user rows (+ cascaded records).")

        db.commit()
        log("Hard delete committed successfully.", "SECTION")

    except Exception as exc:
        db.rollback()
        log(f"Hard delete failed — rolled back: {exc}", "ERROR")
        sys.exit(1)
    finally:
        db.close()


# ─── Orchestrator ─────────────────────────────────────────────────────────────

def cleanup(base_url: str, hard_delete: bool) -> None:
    if not MANIFEST_FILE.exists():
        log(
            f"Manifest not found at {MANIFEST_FILE}.\n"
            "  Nothing to clean up — run seed_test_data.py first.",
            "WARN",
        )
        sys.exit(0)

    manifest         = json.loads(MANIFEST_FILE.read_text())
    effective_url    = manifest.get("base_url", base_url)
    admin_email      = manifest["admin_email"]
    admin_password   = manifest["admin_password"]

    log(f"Backend: {effective_url}", "SECTION")
    log(f"Mode   : {'HARD DELETE (permanent)' if hard_delete else 'Soft deactivate (reversible)'}")

    if hard_delete:
        _hard_delete(manifest)
    else:
        try:
            log(f"Authenticating as {admin_email}…")
            token   = _login(effective_url, admin_email, admin_password)
            session = _make_session(token)
            _soft_delete(effective_url, manifest, session)
        except requests.HTTPError as exc:
            log(f"Login failed: {exc.response.status_code} — {exc.response.text}", "ERROR")
            log(
                "If the admin account was already deactivated, use --hard-delete instead.",
                "WARN",
            )
            sys.exit(1)

    MANIFEST_FILE.unlink()
    log(f"Manifest removed: {MANIFEST_FILE}", "SECTION")
    log("Cleanup complete.", "SECTION")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove test data created by seed_test_data.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL}). Overridden by the value stored in the manifest.",
    )
    parser.add_argument(
        "--hard-delete",
        action="store_true",
        help=(
            "Permanently remove records from the DB via SQLAlchemy. "
            "Requires the backend Python environment to be active."
        ),
    )
    args = parser.parse_args()

    try:
        cleanup(args.base_url, args.hard_delete)
    except requests.ConnectionError:
        log(
            f"Cannot connect to {args.base_url}.\n"
            "  If the backend is down, use --hard-delete to clean up via direct DB access.",
            "ERROR",
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
