import os
import sys
import json
import time
import uuid
import sqlite3
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory
import jinja2

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "licenses.db")

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, "templates"), static_folder=os.path.join(BASE_DIR, "static"))
app.secret_key = os.environ.get("ADMIN_SECRET_KEY", "hassan-autofarm-pro-secret-2026-key-auth")

# Support loading templates from both 'templates/' subfolder AND root directory '.'
template_dirs = [os.path.join(BASE_DIR, "templates"), BASE_DIR]
app.jinja_loader = jinja2.ChoiceLoader([
    jinja2.FileSystemLoader(d) for d in template_dirs if os.path.exists(d)
])

# Fallback route to serve static assets from root '.' if not in 'static/'
@app.route('/static/<path:filename>')
def custom_static(filename):
    static_folder = os.path.join(BASE_DIR, "static")
    if os.path.exists(os.path.join(static_folder, filename)):
        return send_from_directory(static_folder, filename)
    elif os.path.exists(os.path.join(BASE_DIR, filename)):
        return send_from_directory(BASE_DIR, filename)
    return "Not Found", 404

# Admin Credentials (can be overridden via environment variables)
ADMIN_USERNAME = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASS", "Hassan@AutoFarm2026!")

# --- DATABASE SETUP (PostgreSQL / SQLite Dual Engine with Persistent JSON Backup) ---
BACKUP_JSON_PATH = os.path.join(BASE_DIR, "licenses_backup.json")

class DBWrapper:
    def __init__(self, is_pg=False, conn=None):
        self.is_pg = is_pg
        self.conn = conn

    def cursor(self):
        return CursorWrapper(self.is_pg, self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

class CursorWrapper:
    def __init__(self, is_pg, cur):
        self.is_pg = is_pg
        self.cur = cur

    def execute(self, sql, params=()):
        if self.is_pg:
            # Convert SQLite DDL and parameter syntax to PostgreSQL
            pg_sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
            pg_sql = pg_sql.replace("?", "%s")
            self.cur.execute(pg_sql, params)
        else:
            self.cur.execute(sql, params)
        return self

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()

def get_db():
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if db_url:
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        try:
            import psycopg2
            import psycopg2.extras
            conn = psycopg2.connect(db_url)
            conn.cursor_factory = psycopg2.extras.RealDictCursor
            return DBWrapper(is_pg=True, conn=conn)
        except Exception as e:
            print(f"⚠️ PostgreSQL connection failed ({e}), falling back to SQLite.")

    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return DBWrapper(is_pg=False, conn=conn)

def sync_to_backup_file(conn):
    """Persist all current licenses to JSON backup so ephemeral cloud hosts never lose data."""
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM licenses ORDER BY id ASC")
        rows = cur.fetchall()
        data = []
        for r in rows:
            data.append({
                "license_key": r["license_key"],
                "client_name": r["client_name"],
                "client_phone": r["client_phone"] or "",
                "hwid": r["hwid"] or "",
                "is_active": int(r["is_active"]),
                "created_at": str(r["created_at"] or ""),
                "expires_at": str(r["expires_at"] or ""),
                "notes": r["notes"] or ""
            })
        if data:
            with open(BACKUP_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
    except Exception as e:
        print("Backup sync warning:", e)

def restore_from_backup_file(conn):
    """Auto-restore client licenses from persistent backup file on boot/spin-up."""
    if not os.path.exists(BACKUP_JSON_PATH):
        return
    try:
        with open(BACKUP_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list) or not data:
            return
        cur = conn.cursor()
        restored = 0
        for item in data:
            k = item.get("license_key")
            if not k:
                continue
            cur.execute("SELECT id FROM licenses WHERE license_key = ?", (k,))
            if not cur.fetchone():
                cur.execute("""
                INSERT INTO licenses (license_key, client_name, client_phone, hwid, is_active, created_at, expires_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    k,
                    item.get("client_name", "Client"),
                    item.get("client_phone", ""),
                    item.get("hwid") or None,
                    int(item.get("is_active", 1)),
                    item.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    item.get("expires_at") or "Lifetime",
                    item.get("notes", "")
                ))
                restored += 1
        if restored > 0:
            conn.commit()
            print(f"[OK] Auto-restored {restored} persistent license(s) from backup JSON.")
    except Exception as e:
        print("Restore warning:", e)

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        client_name TEXT NOT NULL,
        client_phone TEXT DEFAULT '',
        hwid TEXT DEFAULT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        notes TEXT DEFAULT '',
        last_seen TEXT DEFAULT '',
        last_ip TEXT DEFAULT '',
        app_version TEXT DEFAULT ''
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        hwid TEXT,
        ip_address TEXT,
        action TEXT,
        status TEXT,
        message TEXT,
        timestamp TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS client_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL,
        url TEXT NOT NULL,
        name TEXT DEFAULT '',
        platform TEXT DEFAULT 'tiktok',
        videos_count INTEGER DEFAULT 0,
        added_at TEXT,
        last_synced TEXT,
        UNIQUE(license_key, url)
    )
    """)
    conn.commit()

    # 1. Restore from persistent backup file if available
    restore_from_backup_file(conn)

    # 2. Create master license if table is completely empty
    cur.execute("SELECT COUNT(*) FROM licenses")
    row = cur.fetchone()
    if isinstance(row, dict):
        count = row.get("count", next(iter(row.values()), 0))
    else:
        count = row[0] if row else 0
    if count == 0:
        demo_key = "HAF-PRO-MASTER-7788"
        cur.execute("""
        INSERT INTO licenses (license_key, client_name, client_phone, is_active, created_at, expires_at, notes)
        VALUES (?, ?, ?, 1, ?, 'Lifetime', ?)
        """, (demo_key, "Hassan Master VIP", "03156535711", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "Pre-configured Master VIP License"))
        conn.commit()
        sync_to_backup_file(conn)

    conn.close()

init_db()

# --- AUTH DECORATOR ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function

def calculate_days_remaining(expires_at_str):
    if not expires_at_str or expires_at_str.lower() == "lifetime":
        return 9999
    try:
        exp_date = datetime.strptime(expires_at_str, "%Y-%m-%d")
        delta = (exp_date - datetime.now()).days
        return max(0, delta)
    except Exception:
        return 0

# --- ADMIN WEB ROUTES ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = request.form.get("username", "").strip()
        pwd = request.form.get("password", "").strip()
        if user == ADMIN_USERNAME and pwd == ADMIN_PASSWORD:
            session["logged_in"] = True
            session["username"] = user
            return redirect(url_for("dashboard"))
        else:
            return render_template("login.html", error="Invalid Username or Password!")
    return render_template("login.html")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('favicon.ico')

@app.route('/')
@login_required
def dashboard():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM licenses ORDER BY id DESC")
    rows = cur.fetchall()

    # Query all client links ordered by newest first
    cur.execute("SELECT * FROM client_links ORDER BY id DESC")
    all_links = cur.fetchall()
    links_by_key = {}
    total_links_count = 0
    total_videos_scraped_all = 0

    for lk in all_links:
        k = lk["license_key"]
        if k not in links_by_key:
            links_by_key[k] = []
        v_count = int(lk["videos_count"] or 0)
        total_links_count += 1
        total_videos_scraped_all += v_count
        links_by_key[k].append({
            "id": lk["id"],
            "license_key": k,
            "url": lk["url"],
            "name": lk["name"] or "N/A",
            "platform": lk["platform"] or "tiktok",
            "videos_count": v_count,
            "added_at": lk["added_at"] or "",
            "last_synced": lk["last_synced"] or ""
        })

    licenses_list = []
    total_count = len(rows)
    active_count = 0
    disabled_count = 0
    expired_count = 0

    now_date_str = datetime.now().strftime("%Y-%m-%d")

    for r in rows:
        d_rem = calculate_days_remaining(r["expires_at"])
        is_expired = False
        if r["expires_at"].lower() != "lifetime" and r["expires_at"] < now_date_str:
            is_expired = True
            expired_count += 1
        elif r["is_active"] == 1:
            active_count += 1
        else:
            disabled_count += 1

        k_links = links_by_key.get(r["license_key"], [])
        tot_client_vids = sum(x["videos_count"] for x in k_links)

        licenses_list.append({
            "id": r["id"],
            "license_key": r["license_key"],
            "client_name": r["client_name"],
            "client_phone": r["client_phone"],
            "hwid": r["hwid"],
            "is_active": bool(r["is_active"]),
            "is_expired": is_expired,
            "created_at": r["created_at"],
            "expires_at": r["expires_at"],
            "days_remaining": d_rem if not is_expired else 0,
            "created_at": str(r["created_at"] or "")[:10],
            "expires_at": str(r["expires_at"] or "Lifetime"),
            "days_remaining": d_rem if not is_expired else 0,
            "notes": str(r["notes"] or ""),
            "last_seen": str(r["last_seen"] or "Never"),
            "last_ip": str(r["last_ip"] or "N/A"),
            "links": k_links,
            "links_count": len(k_links),
            "total_videos_scraped": tot_client_vids
        })

    is_pg = conn.is_pg
    conn.close()
    return render_template(
        "dashboard.html",
        licenses=licenses_list,
        total=total_count,
        active=active_count,
        disabled=disabled_count,
        expired=expired_count,
        total_links=total_links_count,
        total_all_videos=total_videos_scraped_all,
        storage_mode="PostgreSQL (Cloud Persistent)" if is_pg else "SQLite Local Engine",
        admin_user=session.get("username", "Admin")
    )

# --- ADMIN ACTION APIS (AJAX) ---
@app.route('/admin/keys/create', methods=['POST'])
@login_required
def create_key():
    data = request.get_json(silent=True) or request.form
    client_name = data.get("client_name", "").strip()
    client_phone = data.get("client_phone", "").strip()
    duration = data.get("duration", "30")  # '7', '15', '30', '90', '365', 'lifetime'
    notes = data.get("notes", "").strip()
    custom_key = data.get("custom_key", "").strip()

    if not client_name:
        return jsonify({"success": False, "message": "Client name is required."}), 400

    if custom_key:
        license_key = custom_key.upper().strip()
    else:
        # Generate random unique key like HAF-8821-4921-2026
        rand_part = hashlib.sha256(f"{uuid.uuid4()}-{time.time()}".encode()).hexdigest()[:8].upper()
        license_key = f"HAF-{rand_part[:4]}-{rand_part[4:8]}-{datetime.now().strftime('%m%y')}"

    now = datetime.now()
    created_at = now.strftime("%Y-%m-%d %H:%M:%S")

    if duration.lower() == "lifetime":
        expires_at = "Lifetime"
    else:
        try:
            days = int(duration)
            expires_at = (now + timedelta(days=days)).strftime("%Y-%m-%d")
        except Exception:
            expires_at = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
        INSERT INTO licenses (license_key, client_name, client_phone, is_active, created_at, expires_at, notes)
        VALUES (?, ?, ?, 1, ?, ?, ?)
        """, (license_key, client_name, client_phone, created_at, expires_at, notes))
        conn.commit()
        sync_to_backup_file(conn)
        conn.close()
        return jsonify({
            "success": True,
            "message": f"License created successfully: {license_key}",
            "key": license_key
        })
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "message": "License Key already exists. Try another key."}), 400
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/admin/keys/toggle', methods=['POST'])
@login_required
def toggle_key():
    """Instant ON / OFF remote toggle switch!"""
    data = request.get_json(silent=True) or request.form
    key_id = data.get("id")
    if not key_id:
        return jsonify({"success": False, "message": "Key ID required."}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT is_active, license_key, client_name FROM licenses WHERE id = ?", (key_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "message": "License not found."}), 404

    new_status = 0 if row["is_active"] == 1 else 1
    cur.execute("UPDATE licenses SET is_active = ? WHERE id = ?", (new_status, key_id))
    conn.commit()
    sync_to_backup_file(conn)
    conn.close()

    status_label = "ENABLED (ACTIVE)" if new_status == 1 else "DISABLED (OFF)"
    return jsonify({
        "success": True,
        "is_active": bool(new_status),
        "status_label": status_label,
        "message": f"License for {row['client_name']} is now {status_label}!"
    })

@app.route('/admin/keys/reset_hwid', methods=['POST'])
@login_required
def reset_hwid():
    """Unlocks bound PC so the buyer can transfer their license to a new PC."""
    data = request.get_json(silent=True) or request.form
    key_id = data.get("id")
    if not key_id:
        return jsonify({"success": False, "message": "Key ID required."}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE licenses SET hwid = NULL WHERE id = ?", (key_id,))
    conn.commit()
    sync_to_backup_file(conn)
    conn.close()
    return jsonify({"success": True, "message": "Machine lock reset! Buyer can now activate on a new PC."})

@app.route('/admin/keys/extend', methods=['POST'])
@login_required
def extend_key():
    data = request.get_json(silent=True) or request.form
    key_id = data.get("id")
    days_to_add = int(data.get("days", 30))

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT expires_at FROM licenses WHERE id = ?", (key_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "message": "License not found."}), 404

    curr_exp = row["expires_at"]
    if curr_exp.lower() == "lifetime":
        conn.close()
        return jsonify({"success": True, "message": "Key is already Lifetime!"})

    try:
        curr_dt = datetime.strptime(curr_exp, "%Y-%m-%d")
        base_dt = max(curr_dt, datetime.now())
        new_exp = (base_dt + timedelta(days=days_to_add)).strftime("%Y-%m-%d")
    except Exception:
        new_exp = (datetime.now() + timedelta(days=days_to_add)).strftime("%Y-%m-%d")

    cur.execute("UPDATE licenses SET expires_at = ? WHERE id = ?", (new_exp, key_id))
    conn.commit()
    sync_to_backup_file(conn)
    conn.close()
    return jsonify({"success": True, "new_expires_at": new_exp, "message": f"Extended to {new_exp}!"})

@app.route('/admin/keys/delete', methods=['POST'])
@login_required
def delete_key():
    data = request.get_json(silent=True) or request.form
    key_id = data.get("id")
    conn = get_db()
    cur = conn.cursor()
    # Fetch license key for cascading link cleanup
    cur.execute("SELECT license_key FROM licenses WHERE id = ?", (key_id,))
    row = cur.fetchone()
    if row:
        cur.execute("DELETE FROM client_links WHERE license_key = ?", (row["license_key"],))
    cur.execute("DELETE FROM licenses WHERE id = ?", (key_id,))
    conn.commit()
    sync_to_backup_file(conn)
    conn.close()
    return jsonify({"success": True, "message": "License permanently deleted."})

@app.route('/admin/license/links/delete', methods=['POST'])
@login_required
def delete_client_link():
    data = request.get_json(silent=True) or request.form
    link_id = data.get("id")
    if not link_id:
        return jsonify({"success": False, "message": "Link ID is required."}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM client_links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Client link removed successfully."})

@app.route('/admin/license/links/clear', methods=['POST'])
@login_required
def clear_client_links():
    data = request.get_json(silent=True) or request.form
    license_key = (data.get("license_key") or "").strip()
    if not license_key:
        return jsonify({"success": False, "message": "License key is required."}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM client_links WHERE license_key = ?", (license_key,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"All links cleared for key {license_key}."})

# --- PUBLIC CLIENT VERIFICATION & ACTIVATION API ---
@app.route('/api/v1/license/verify', methods=['POST'])
def client_verify():
    data = request.get_json(silent=True) or {}
    key = data.get("key", "").strip()
    client_hwid = data.get("hwid", "").strip()
    client_ip = request.remote_addr

    if not key:
        return jsonify({"valid": False, "status": "UNLICENSED", "message": "No key provided."}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM licenses WHERE license_key = ?", (key,))
    lic = cur.fetchone()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not lic:
        cur.execute("""
        INSERT INTO access_logs (license_key, hwid, ip_address, action, status, message, timestamp)
        VALUES (?, ?, ?, 'verify', 'NOT_FOUND', 'Key does not exist in database', ?)
        """, (key, client_hwid, client_ip, now_str))
        conn.commit()
        conn.close()
        return jsonify({
            "valid": False,
            "status": "NOT_FOUND",
            "message": "License key not found. Please contact Hassan to purchase a valid key."
        }), 404

    # 1. Check if Admin turned OFF the switch
    if lic["is_active"] == 0:
        cur.execute("""
        INSERT INTO access_logs (license_key, hwid, ip_address, action, status, message, timestamp)
        VALUES (?, ?, ?, 'verify', 'DISABLED', 'Key is turned OFF by admin', ?)
        """, (key, client_hwid, client_ip, now_str))
        conn.commit()
        conn.close()
        return jsonify({
            "valid": False,
            "status": "DISABLED",
            "client_name": lic["client_name"],
            "message": "⚠️ This license has been DEACTIVATED by administrator. Contact Hassan (03077922895) to reactivate."
        })

    # 2. Check Expiration
    today_str = datetime.now().strftime("%Y-%m-%d")
    if lic["expires_at"].lower() != "lifetime" and lic["expires_at"] < today_str:
        cur.execute("""
        INSERT INTO access_logs (license_key, hwid, ip_address, action, status, message, timestamp)
        VALUES (?, ?, ?, 'verify', 'EXPIRED', 'Key has expired', ?)
        """, (key, client_hwid, client_ip, now_str))
        conn.commit()
        conn.close()
        return jsonify({
            "valid": False,
            "status": "EXPIRED",
            "client_name": lic["client_name"],
            "expires_at": lic["expires_at"],
            "message": f"⚠️ License expired on {lic['expires_at']}. Contact Hassan to renew."
        })

    # 3. Check HWID (Hardware Lock: 1 Key = 1 PC)
    bound_hwid = lic["hwid"]
    if bound_hwid and client_hwid and bound_hwid.strip().upper() != client_hwid.strip().upper():
        cur.execute("""
        INSERT INTO access_logs (license_key, hwid, ip_address, action, status, message, timestamp)
        VALUES (?, ?, ?, 'verify', 'DEVICE_MISMATCH', 'HWID mismatch attempt', ?)
        """, (key, client_hwid, client_ip, now_str))
        conn.commit()
        conn.close()
        return jsonify({
            "valid": False,
            "status": "DEVICE_MISMATCH",
            "client_name": lic["client_name"],
            "message": "⚠️ Hardware ID mismatch! This license key is bound to another computer. Contact Hassan to reset your PC binding."
        })

    # Auto-bind HWID if first time connecting
    if not bound_hwid and client_hwid:
        cur.execute("UPDATE licenses SET hwid = ?, last_seen = ?, last_ip = ? WHERE id = ?",
                    (client_hwid, now_str, client_ip, lic["id"]))
    else:
        cur.execute("UPDATE licenses SET last_seen = ?, last_ip = ? WHERE id = ?",
                    (now_str, client_ip, lic["id"]))

    # Optional: Sync links if sent along with verify payload
    if data.get("links"):
        _process_client_links_sync(cur, key, data.get("links"), now_str)

    conn.commit()
    conn.close()

    days_rem = calculate_days_remaining(lic["expires_at"])

    return jsonify({
        "valid": True,
        "status": "ACTIVE",
        "client_name": lic["client_name"],
        "expires_at": lic["expires_at"],
        "days_remaining": days_rem,
        "hwid_locked": True,
        "message": "License verified active and authorized."
    })

def _process_client_links_sync(cur, key, links, now_str):
    synced = 0
    if not isinstance(links, list):
        return 0
    for item in links:
        if not isinstance(item, dict):
            continue
        raw_url = (item.get("url") or item.get("raw_url") or item.get("input") or "").strip()
        if not raw_url:
            continue
        name = (item.get("name") or "").strip()
        platform = (item.get("platform") or "tiktok").strip().lower()
        videos_count = int(item.get("videos_count") or item.get("links") or item.get("queued") or item.get("farmed") or 0)
        added_at = item.get("added_at") or now_str

        cur.execute("""
        INSERT INTO client_links (license_key, url, name, platform, videos_count, added_at, last_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(license_key, url) DO UPDATE SET
            name = CASE WHEN excluded.name != '' THEN excluded.name ELSE client_links.name END,
            platform = excluded.platform,
            videos_count = MAX(client_links.videos_count, excluded.videos_count),
            last_synced = excluded.last_synced
        """, (key, raw_url, name, platform, videos_count, added_at, now_str))
        synced += 1
    return synced

@app.route('/api/v1/license/sync_links', methods=['POST'])
def client_sync_links():
    """Client AutoFarm Desktop App sends added creators & video links here."""
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    links = data.get("links", [])
    if not key:
        return jsonify({"success": False, "message": "License key required."}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, license_key FROM licenses WHERE license_key = ?", (key,))
    lic = cur.fetchone()
    if not lic:
        conn.close()
        return jsonify({"success": False, "message": "License key not recognized."}), 404

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    synced = _process_client_links_sync(cur, key, links, now_str)
    conn.commit()
    conn.close()
    return jsonify({
        "success": True,
        "synced_count": synced,
        "message": f"Successfully synced {synced} client link(s)."
    })

@app.route('/api/v1/license/activate', methods=['POST'])
def client_activate():
    """Same verification logic with explicit HWID registration."""
    return client_verify()

if __name__ == '__main__':
    print("=" * 60)
    print("   Hassan AutoFarm - Web License Authorization Server")
    print("=" * 60)
    print("Admin Portal URL: http://127.0.0.1:8000")
    print("Default Login: admin / Hassan@AutoFarm2026!")
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
