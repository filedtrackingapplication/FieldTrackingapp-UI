"""One-off migration: add tax_percent, max_discount_percent, updated_at to products table.
Usage: python migrate_add_product_columns.py [path/to/db]
If no path is provided the script uses backend/field_tracking.db
"""
import os
import sys
import sqlite3

DB_DEFAULT = os.path.join(os.path.dirname(__file__), '..', 'field_tracking.db')

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else DB_DEFAULT
    db_path = os.path.normpath(db_path)
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        sys.exit(2)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        # Add columns if they don't exist
        cur.execute("PRAGMA table_info(products);")
        cols = [r[1] for r in cur.fetchall()]
        if 'tax_percent' not in cols:
            print('Adding tax_percent...')
            cur.execute('ALTER TABLE products ADD COLUMN tax_percent REAL DEFAULT 0;')
        else:
            print('tax_percent already exists')
        if 'max_discount_percent' not in cols:
            print('Adding max_discount_percent...')
            cur.execute('ALTER TABLE products ADD COLUMN max_discount_percent REAL DEFAULT 0;')
        else:
            print('max_discount_percent already exists')
        if 'updated_at' not in cols:
            print('Adding updated_at...')
            cur.execute("ALTER TABLE products ADD COLUMN updated_at TEXT;")
        else:
            print('updated_at already exists')
        conn.commit()
        print('Migration completed successfully.')
    except Exception as e:
        print('Migration failed:', e)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
