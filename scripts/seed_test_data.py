#!/usr/bin/env python3
"""
Seed script for Field Tracking App
===================================
Creates a complete set of test users and customers for automated testing:
  - 2  Admins
  - 10 Managers
  - 10 Field Agents  (distributed evenly across managers)
  - 10–20 Drivers    (default 15, configurable via --drivers)
  - 40 Customers     (distributed evenly across field agents)

All test entities use the prefix [TEST] in their names and @testenv.example.com emails
so they are easily identifiable and filterable.

A manifest file (test_manifest.json) is written next to this script.
The cleanup script reads that file to know what to remove.

Usage
-----
    # Basic (targets http://localhost:8000, password Test@1234)
    python scripts/seed_test_data.py

    # Custom backend + password + 20 drivers
    python scripts/seed_test_data.py --base-url http://localhost:8000 \\
                                      --password MySecret99 \\
                                      --drivers 20

    # Dry-run: print what would be created without hitting the API
    python scripts/seed_test_data.py --dry-run
"""

import argparse
import json
import sys
from pathlib import Path

import requests

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_PASSWORD = "Test@1234"
TEST_MARKER = "[TEST]"

MANIFEST_FILE = Path(__file__).parent / "test_manifest.json"

ZONES = [
    "North Delhi", "South Delhi", "East Delhi", "West Delhi", "Central Delhi",
    "Gurgaon",     "Noida",       "Faridabad",  "Ghaziabad",  "Meerut",
]
CITIES = ["Delhi", "Gurgaon", "Noida", "Faridabad", "Ghaziabad"]
STATES = ["Delhi", "Haryana", "Uttar Pradesh"]
VEHICLE_STATES = ["DL", "HR", "UP", "GJ", "MH"]
CUSTOMER_TYPES = ["retail", "wholesale", "distributor"]


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


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _set_auth(session: requests.Session, token: str) -> None:
    session.headers.update({"Authorization": f"Bearer {token}"})


def _register(session: requests.Session, base_url: str, payload: dict) -> dict:
    """POST /api/auth/register — open endpoint, no auth required."""
    r = session.post(f"{base_url}/api/auth/register", json=payload)
    r.raise_for_status()
    return r.json()


def _login(session: requests.Session, base_url: str, email: str, password: str) -> str:
    """POST /api/auth/login — returns JWT access token."""
    r = session.post(
        f"{base_url}/api/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _create_agent(session: requests.Session, base_url: str, payload: dict) -> dict:
    """POST /api/agents/ — requires admin or manager role."""
    r = session.post(f"{base_url}/api/agents/", json=payload)
    r.raise_for_status()
    return r.json()


def _create_customer(session: requests.Session, base_url: str, payload: dict) -> dict:
    """POST /api/customers/ — requires any authenticated user."""
    r = session.post(f"{base_url}/api/customers/", json=payload)
    r.raise_for_status()
    return r.json()


# ─── Seed builders ────────────────────────────────────────────────────────────

def _build_admin(n: int, password: str) -> dict:
    return {
        "employee_id":   f"TEST-ADM-{n:03d}",
        "full_name":     f"{TEST_MARKER} Admin {n:02d}",
        "email":         f"admin{n:02d}@testenv.example.com",
        "phone":         f"980000{n:04d}",
        "password":      password,
        "role":          "admin",
        "assigned_zone": "All Zones",
    }


def _build_manager(n: int, password: str) -> dict:
    return {
        "employee_id":   f"TEST-MGR-{n:03d}",
        "full_name":     f"{TEST_MARKER} Manager {n:02d}",
        "email":         f"manager{n:02d}@testenv.example.com",
        "phone":         f"980100{n:04d}",
        "password":      password,
        "role":          "manager",
        "assigned_zone": ZONES[(n - 1) % len(ZONES)],
    }


def _build_field_agent(n: int, password: str, manager_id: int) -> dict:
    return {
        "employee_id":   f"TEST-AGT-{n:03d}",
        "full_name":     f"{TEST_MARKER} Field Agent {n:02d}",
        "email":         f"agent{n:02d}@testenv.example.com",
        "phone":         f"980200{n:04d}",
        "password":      password,
        "role":          "field_agent",
        "assigned_zone": ZONES[(n - 1) % len(ZONES)],
        "manager_id":    manager_id,
    }


def _build_driver(n: int, password: str, manager_id: int) -> dict:
    state = VEHICLE_STATES[(n - 1) % len(VEHICLE_STATES)]
    return {
        "employee_id":    f"TEST-DRV-{n:03d}",
        "full_name":      f"{TEST_MARKER} Driver {n:02d}",
        "email":          f"driver{n:02d}@testenv.example.com",
        "phone":          f"980300{n:04d}",
        "password":       password,
        "role":           "driver",
        "vehicle_number": f"{state}{10 + n:02d}AA{1000 + n}",
        "assigned_zone":  ZONES[(n - 1) % len(ZONES)],
        "manager_id":     manager_id,
    }


def _build_customer(n: int, agent_id: int) -> dict:
    city  = CITIES[(n - 1) % len(CITIES)]
    state = STATES[(n - 1) % len(STATES)]
    return {
        "name":             f"{TEST_MARKER} Customer {n:02d}",
        "contact_person":   f"Contact Person {n}",
        "phone":            f"980400{n:04d}",
        "email":            f"customer{n:02d}@testenv.example.com",
        "address":          f"{100 + n}, Test Nagar, {city}",
        "city":             city,
        "state":            state,
        "pincode":          f"{110000 + n}",
        "customer_type":    CUSTOMER_TYPES[(n - 1) % len(CUSTOMER_TYPES)],
        "credit_limit":     round(10000 + (n * 500), 2),
        "assigned_agent_id": agent_id,
    }


# ─── Main seed logic ──────────────────────────────────────────────────────────

def seed(base_url: str, password: str, num_drivers: int, dry_run: bool) -> None:
    if MANIFEST_FILE.exists():
        log(
            f"Manifest already exists at {MANIFEST_FILE}.\n"
            "  Run cleanup_test_data.py first, or delete the manifest manually.",
            "ERROR",
        )
        sys.exit(1)

    if dry_run:
        log("DRY-RUN mode — no API calls will be made.", "WARN")

    manifest = {
        "base_url":       base_url,
        "admin_email":    "admin01@testenv.example.com",
        "admin_password": password,
        "admins":         [],
        "managers":       [],
        "field_agents":   [],
        "drivers":        [],
        "customers":      [],
    }

    session = _make_session()

    # ── Admins ────────────────────────────────────────────────────────────────
    log("── Creating 2 Admins ──────────────────────────────────────────", "SECTION")

    admin1_payload = _build_admin(1, password)
    if not dry_run:
        admin1 = _register(session, base_url, admin1_payload)
        manifest["admins"].append({"id": admin1["id"], "email": admin1_payload["email"]})
        log(f"  Admin 01 created — id={admin1['id']}  ({admin1_payload['email']})")

        # Authenticate so subsequent agent creates work
        token = _login(session, base_url, admin1_payload["email"], password)
        _set_auth(session, token)
    else:
        log(f"  [DRY] Would register: {admin1_payload['email']}")

    admin2_payload = _build_admin(2, password)
    if not dry_run:
        admin2 = _register(session, base_url, admin2_payload)
        manifest["admins"].append({"id": admin2["id"], "email": admin2_payload["email"]})
        log(f"  Admin 02 created — id={admin2['id']}  ({admin2_payload['email']})")
    else:
        log(f"  [DRY] Would register: {admin2_payload['email']}")

    # ── Managers ──────────────────────────────────────────────────────────────
    log("── Creating 10 Managers ───────────────────────────────────────", "SECTION")
    manager_ids: list[int] = []

    for i in range(1, 11):
        payload = _build_manager(i, password)
        if not dry_run:
            m = _create_agent(session, base_url, payload)
            manager_ids.append(m["id"])
            manifest["managers"].append({"id": m["id"], "email": payload["email"]})
            log(f"  Manager {i:02d} — id={m['id']}  zone={m['assigned_zone']}")
        else:
            log(f"  [DRY] Would create manager: {payload['email']}")

    # ── Field Agents ──────────────────────────────────────────────────────────
    log("── Creating 10 Field Agents ───────────────────────────────────", "SECTION")
    agent_ids: list[int] = []

    for i in range(1, 11):
        mgr_id = manager_ids[(i - 1) % len(manager_ids)] if manager_ids else 0
        payload = _build_field_agent(i, password, mgr_id)
        if not dry_run:
            a = _create_agent(session, base_url, payload)
            agent_ids.append(a["id"])
            manifest["field_agents"].append({
                "id": a["id"], "email": payload["email"], "manager_id": mgr_id
            })
            log(f"  Field Agent {i:02d} — id={a['id']}  manager_id={mgr_id}")
        else:
            log(f"  [DRY] Would create field agent: {payload['email']}  manager_id={mgr_id}")

    # ── Drivers ───────────────────────────────────────────────────────────────
    log(f"── Creating {num_drivers} Drivers ─────────────────────────────────────", "SECTION")

    for i in range(1, num_drivers + 1):
        mgr_id = manager_ids[(i - 1) % len(manager_ids)] if manager_ids else 0
        payload = _build_driver(i, password, mgr_id)
        if not dry_run:
            d = _create_agent(session, base_url, payload)
            manifest["drivers"].append({"id": d["id"], "email": payload["email"]})
            log(f"  Driver {i:02d} — id={d['id']}  vehicle={d.get('vehicle_number', 'N/A')}")
        else:
            log(f"  [DRY] Would create driver: {payload['email']}  vehicle={payload['vehicle_number']}")

    # ── Customers ─────────────────────────────────────────────────────────────
    log("── Creating 40 Customers ──────────────────────────────────────", "SECTION")

    for i in range(1, 41):
        assigned = agent_ids[(i - 1) % len(agent_ids)] if agent_ids else 0
        payload = _build_customer(i, assigned)
        if not dry_run:
            c = _create_customer(session, base_url, payload)
            manifest["customers"].append({"id": c["id"], "name": c["name"]})
            log(f"  Customer {i:02d} — id={c['id']}  assigned_agent={assigned}")
        else:
            log(f"  [DRY] Would create customer: {payload['name']}  assigned_agent={assigned}")

    # ── Manifest ──────────────────────────────────────────────────────────────
    if not dry_run:
        MANIFEST_FILE.write_text(json.dumps(manifest, indent=2))
        log(f"\nManifest written → {MANIFEST_FILE}", "SECTION")

    # ── Summary ───────────────────────────────────────────────────────────────
    log("", "SECTION")
    log("Seed complete!", "SECTION")
    log(f"  Admins       : 2", "INFO")
    log(f"  Managers     : 10", "INFO")
    log(f"  Field Agents : 10", "INFO")
    log(f"  Drivers      : {num_drivers}", "INFO")
    log(f"  Customers    : 40", "INFO")
    log("", "SECTION")
    log(f"  Login URL    : {base_url}/api/auth/login", "INFO")
    log(f"  Admin email  : admin01@testenv.example.com", "INFO")
    log(f"  All passwords: {password}", "INFO")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed test users & customers for Field Tracking App",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--password",
        default=DEFAULT_PASSWORD,
        help=f"Password used for all test accounts (default: {DEFAULT_PASSWORD})",
    )
    parser.add_argument(
        "--drivers",
        type=int,
        default=15,
        choices=range(10, 21),
        metavar="N (10–20)",
        help="Number of driver accounts to create (default: 15)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be created without making any API calls",
    )
    args = parser.parse_args()

    try:
        seed(args.base_url, args.password, args.drivers, args.dry_run)
    except requests.HTTPError as exc:
        log(f"HTTP {exc.response.status_code} — {exc.response.text}", "ERROR")
        sys.exit(1)
    except requests.ConnectionError:
        log(
            f"Cannot connect to {args.base_url}.\n"
            "  Make sure the backend is running (docker-compose up) and the URL is correct.",
            "ERROR",
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
