"""CLI entry for backend scripts.

Usage:
    python -m backend.scripts seed_attendance

This module dispatches to scripts in this package.
"""
import sys


def _usage():
    print("Usage: python -m backend.scripts <command>")
    print("Available commands: seed_attendance")


def main():
    if len(sys.argv) < 2:
        _usage()
        return
    cmd = sys.argv[1]
    if cmd == "seed_attendance":
        from . import seed_attendance
        seed_attendance.main()
    else:
        print(f"Unknown command: {cmd}\n")
        _usage()


if __name__ == '__main__':
    main()
