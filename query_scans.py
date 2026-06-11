import sqlite3
import os

db_path = 'c:/Users/suppo/Auto-Checker/scanner.db'
if not os.path.exists(db_path):
    print("Database file not found at " + db_path)
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== PROJECTS ===")
cur.execute("SELECT id, name FROM project")
for row in cur.fetchall():
    print(f"Project ID: {row[0]}, Name: {row[1]}")

print("\n=== SCANS ===")
cur.execute("SELECT id, project_id, name, url, status, total_issues, pages_scanned, started_at, ended_at FROM scan")
for row in cur.fetchall():
    print(f"Scan ID: {row[0]}, ProjID: {row[1]}, Name: {row[2]}, URL: {row[3]}, Status: {row[4]}, Issues: {row[5]}, Pages: {row[6]}, Start: {row[7]}, End: {row[8]}")

print("\n=== SCANNED PAGES ===")
cur.execute("SELECT id, scan_id, url, title, status_code FROM scanned_page")
for row in cur.fetchall():
    print(f"Page ID: {row[0]}, ScanID: {row[1]}, URL: {row[2]}, Title: {row[3]}, Status: {row[4]}")

print("\n=== ISSUES (First 10) ===")
cur.execute("SELECT id, scan_id, word, suggested_text, page_url FROM issue LIMIT 10")
for row in cur.fetchall():
    print(f"Issue ID: {row[0]}, ScanID: {row[1]}, Word: {row[2]}, Suggestions: {row[3]}, URL: {row[4]}")

conn.close()
