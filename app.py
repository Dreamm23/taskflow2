from flask import Flask, render_template, request, jsonify, session
import threading
import time
from datetime import datetime, timedelta
import uuid, os, json, random, smtplib, hashlib, hmac
import psycopg2
import psycopg2.extras
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = Flask(__name__,
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"))
app.secret_key = os.environ.get("SECRET_KEY", "taskflow_v8_secret_k3y_2026_xR9#mP2$qN7@wL4")
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("FLASK_ENV") == "production"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 30  # 30 dias
app.config["SESSION_COOKIE_NAME"] = "taskflow_session"

# ── SEGURANÇA — Rate Limiting ────────────────────
_rate_limit = {}  # ip -> {count, reset_time}
_login_attempts = {}  # email -> {count, blocked_until}

def check_rate_limit(key, max_req=60, window=60):
    """Limite geral: 60 req/min por IP"""
    now = time.time()
    if key not in _rate_limit or now > _rate_limit[key]["reset"]:
        _rate_limit[key] = {"count":1, "reset":now+window}
        return True
    _rate_limit[key]["count"] += 1
    return _rate_limit[key]["count"] <= max_req

def check_login_limit(email):
    """Máx 5 tentativas de login por email — bloqueia 15 min"""
    now = time.time()
    e = email.lower()
    if e not in _login_attempts:
        _login_attempts[e] = {"count":0, "blocked_until":0}
    entry = _login_attempts[e]
    if now < entry["blocked_until"]:
        remaining = int(entry["blocked_until"] - now)
        return False, f"Demasiadas tentativas. Tenta novamente em {remaining}s."
    entry["count"] += 1
    if entry["count"] >= 5:
        entry["blocked_until"] = now + 900  # 15 minutos
        entry["count"] = 0
        return False, "Conta bloqueada por 15 minutos por excesso de tentativas."
    return True, ""

def reset_login_limit(email):
    if email.lower() in _login_attempts:
        _login_attempts[email.lower()] = {"count":0, "blocked_until":0}

# ── SEGURANÇA — Bcrypt (hash de passwords) ───────
def hash_password(pw):
    """Hash SHA-256 com salt — compatível sem dependências externas"""
    salt = os.environ.get("PW_SALT", "taskflow_salt_2026_xK9#")
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260000).hex()

def check_password(pw, stored):
    """Verificar password — suporta plain text (migração) e hash"""
    # Se já está em hash (hex de 64 chars) — comparar com hash
    if len(stored) == 64 and all(c in "0123456789abcdef" for c in stored):
        return hmac.compare_digest(hash_password(pw), stored)
    # Plain text (passwords antigas) — comparar direto + migrar
    return pw == stored

# ── SEGURANÇA — Headers HTTP ─────────────────────
@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(self), camera=()"
    # Cache control para dados sensíveis
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

# ── SEGURANÇA — Rate limit em todas as rotas ─────
@app.before_request
def global_rate_limit():
    ip = request.remote_addr or "unknown"
    if not check_rate_limit(ip, max_req=120, window=60):
        return jsonify({"error":"Demasiados pedidos. Aguarda um momento."}), 429


# ═══════════════ CONFIG ═══════════════
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "196981053682-28hre629rjctqs5v977j68u4h9l2aitb.apps.googleusercontent.com")
GEMINI_KEY       = os.environ.get("GEMINI_API_KEY", "")
SMTP_EMAIL       = os.environ.get("SMTP_EMAIL", "sweetdeus@gmail.com")
SMTP_PASSWORD    = os.environ.get("SMTP_PASSWORD", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

VERIFY_CODES = {}
BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5000")

# ═══════════════ DATABASE ═══════════════
class PgConn:
    """Wrapper psycopg2 compatível com a API sqlite3 usada no resto do código."""
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        c = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        c.execute(sql.replace('?', '%s'), params or ())
        return c

    def executemany(self, sql, params_list):
        c = self._conn.cursor()
        c.executemany(sql.replace('?', '%s'), params_list)
        return c

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurado. Define a variável de ambiente no Railway.")
    conn = psycopg2.connect(DATABASE_URL)
    return PgConn(conn)

def init_db():
    conn = get_db()

    # ── Criar tabelas ────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT,
            role TEXT DEFAULT 'member', avatar TEXT, color TEXT DEFAULT '#6366f1',
            picture TEXT DEFAULT NULL, bio TEXT DEFAULT '', department TEXT DEFAULT '',
            phone TEXT DEFAULT '', location TEXT DEFAULT '', online INTEGER DEFAULT 0,
            joined TEXT, skills TEXT DEFAULT '[]', google_id TEXT, verified INTEGER DEFAULT 1
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT, color TEXT DEFAULT '#6366f1',
            icon TEXT DEFAULT '📁', description TEXT DEFAULT '',
            members TEXT DEFAULT '[]', status TEXT DEFAULT 'active',
            deadline TEXT, created TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY, title TEXT, description TEXT DEFAULT '',
            status TEXT DEFAULT 'A Fazer', priority TEXT DEFAULT 'medium',
            assignee TEXT, tags TEXT DEFAULT '[]', deadline TEXT, project TEXT,
            subtasks TEXT DEFAULT '[]', comments TEXT DEFAULT '[]',
            created TEXT, pinned INTEGER DEFAULT 0,
            dependencies TEXT DEFAULT '[]',
            recurrence TEXT DEFAULT NULL,
            recurrence_end TEXT DEFAULT NULL
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, title TEXT, start_time TEXT, end_time TEXT,
            color TEXT DEFAULT '#6366f1', project TEXT, type TEXT DEFAULT 'meeting',
            description TEXT DEFAULT '', attendees TEXT DEFAULT '[]', all_day INTEGER DEFAULT 0
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY, user_id TEXT, title TEXT DEFAULT 'Nova Nota',
            content TEXT DEFAULT '', created TEXT, updated TEXT,
            color TEXT DEFAULT '#6366f1', pinned INTEGER DEFAULT 0
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY, user_id TEXT, type TEXT, title TEXT,
            message TEXT, read INTEGER DEFAULT 0, created TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS activity (
            id TEXT PRIMARY KEY, user_id TEXT, action TEXT, target TEXT,
            type TEXT, time TEXT, icon TEXT, created TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY, user_id TEXT, text TEXT,
            created TEXT, edited INTEGER DEFAULT 0
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_timers (
            id TEXT PRIMARY KEY, task_id TEXT, user_id TEXT,
            start_time TEXT, end_time TEXT, duration INTEGER DEFAULT 0, note TEXT DEFAULT ''
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_history (
            id TEXT PRIMARY KEY, task_id TEXT, user_id TEXT,
            field TEXT, old_value TEXT, new_value TEXT, created TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_attachments (
            id TEXT PRIMARY KEY, task_id TEXT, user_id TEXT,
            filename TEXT, mimetype TEXT, data TEXT, size INTEGER DEFAULT 0, created TEXT
        )""")
    conn.commit()

    # ── Migrações (ADD COLUMN IF NOT EXISTS — sintaxe PostgreSQL) ────────────
    migrations = [
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies TEXT DEFAULT '[]'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified INTEGER DEFAULT 1",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TEXT",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pinned INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT NULL",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end TEXT DEFAULT NULL",
    ]
    for migration in migrations:
        conn.execute(migration)
    conn.commit()

    # ── Índices para melhorar performance ────────────────────────────────────
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created)",
        "CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created)",
        "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    ]
    for idx in indexes:
        conn.execute(idx)
    conn.commit()

    # ── Inserir dados demo se a DB estiver vazia ──────────────────────────────
    def d(n=0): return (datetime.now()+timedelta(days=n)).strftime("%Y-%m-%d")

    if not conn.execute("SELECT id FROM users LIMIT 1").fetchone():
        users = [
            ("u1","Davi Avelino","davi.asafe385@gmail.com","admin123","admin","DA","#6366f1","Admin do TaskFlow","Gestão","","Brasil",0,d(-90),'["Liderança","Tecnologia","Gestão"]',None,1),
            ("u2","Bruno Costa","bruno@taskflow.io","manager123","manager","BC","#8b5cf6","Engineering Manager","Tecnologia","","Porto",0,d(-60),'["Python","React","DevOps"]',None,1),
            ("u3","Carla Mendes","carla@taskflow.io","membro123","member","CM","#ec4899","UX/UI Designer","Design","","Braga",0,d(-45),'["Figma","UI Design"]',None,1),
            ("u4","David Lopes","david@taskflow.io","membro123","member","DL","#10b981","Full Stack Developer","Tecnologia","","Coimbra",0,d(-30),'["JavaScript","Python"]',None,1),
            ("u5","Eva Rodrigues","eva@taskflow.io","viewer123","viewer","ER","#f59e0b","Stakeholder","Parceiros","","Faro",0,d(-20),'["Marketing"]',None,1),
        ]
        conn.executemany("INSERT INTO users (id,name,email,password,role,avatar,color,bio,department,phone,location,online,joined,skills,google_id,verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", users)

        projects = [
            ("p1","TaskFlow App","#6366f1","⚡","Plataforma principal",'["u1","u2","u3","u4"]',"active",d(60),d(-30)),
            ("p2","Website Corporativo","#ec4899","🌐","Redesign do site",'["u1","u3","u4"]',"active",d(45),d(-20)),
            ("p3","Infra & DevOps","#10b981","🔧","Modernização da infra",'["u2","u4"]',"active",d(90),d(-45)),
            ("p4","App Mobile","#f59e0b","📱","Versão mobile",'["u1","u2","u3"]',"planning",d(120),d(-5)),
        ]
        conn.executemany("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)", projects)

        tasks = [
            ("t1","Redesign da Landing Page","Atualizar visual com novo branding.","Em Progresso","high","u3",'["design","feature"]',d(3),"p1",'[{"id":"s1","title":"Wireframes","done":true},{"id":"s2","title":"Mockup final","done":false}]','[]',d(-5),1,'[]',None,None),
            ("t2","API de Autenticação JWT","Refresh tokens e 2FA.","A Fazer","high","u4",'["dev","feature"]',d(7),"p1",'[{"id":"s3","title":"Endpoint login","done":false}]','[]',d(-2),0,'[]',None,None),
            ("t3","Corrigir bug no formulário","Validação falha em Safari.","Revisão","medium","u4",'["bug"]',d(1),"p2",'[{"id":"s4","title":"Reproduzir","done":true}]','[]',d(-8),0,'[]',None,None),
            ("t4","Documentação da API","Swagger completo.","A Fazer","low","u2",'["docs"]',d(14),"p1",'[]','[]',d(-1),0,'[]',None,None),
            ("t5","Dashboard Analytics","Métricas em tempo real.","Em Progresso","medium","u4",'["dev"]',d(10),"p1",'[{"id":"s5","title":"Chart.js","done":true}]','[]',d(-3),0,'[]',None,None),
            ("t6","Setup CI/CD","GitHub Actions automático.","Concluído","high","u2",'["devops"]',d(-2),"p3",'[{"id":"s6","title":"Workflow","done":true}]','[]',d(-15),0,'[]',None,None),
            ("t7","Design System","Componentes com Storybook.","Em Progresso","high","u3",'["design"]',d(20),"p2",'[{"id":"s7","title":"Tokens","done":true}]','[]',d(-10),0,'[]',None,None),
            ("t8","Testes de Performance","Lighthouse audit completo.","A Fazer","medium","u4",'["dev"]',d(15),"p3",'[]','[]',d(-1),0,'[]',None,None),
        ]
        conn.executemany("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", tasks)

        events = [
            ("e1","Sprint Planning",d(1)+"T10:00",d(1)+"T11:00","#6366f1","p1","meeting","Planeamento da sprint",'["u1","u2","u3","u4"]',0),
            ("e2","Design Review",d(2)+"T14:00",d(2)+"T15:00","#ec4899","p2","review","Revisão dos mockups",'["u1","u3"]',0),
            ("e3","Deploy v2.1",d(4)+"T18:00",d(4)+"T19:00","#10b981","p3","deploy","Deploy para produção",'["u2","u4"]',0),
            ("e4","Reunião com Cliente",d(6)+"T10:00",d(6)+"T11:00","#f59e0b","p2","meeting","Apresentação do progresso",'["u1","u2"]',0),
            ("e5","Retrospetiva",d(8)+"T15:00",d(8)+"T16:00","#6366f1","p1","meeting","Sprint retrospetiva",'["u1","u2","u3","u4"]',0),
        ]
        conn.executemany("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)", events)

        activity = [
            ("a1","u4","moveu para Revisão","Corrigir bug no formulário","task","5 min","🔄",datetime.now().isoformat()),
            ("a2","u2","concluiu","Setup CI/CD","task","1h","✅",datetime.now().isoformat()),
            ("a3","u1","criou","Dashboard Analytics","task","2h","✨",datetime.now().isoformat()),
            ("a4","u3","comentou em","Redesign da Landing Page","comment","3h","💬",datetime.now().isoformat()),
        ]
        conn.executemany("INSERT INTO activity VALUES (?,?,?,?,?,?,?,?)", activity)

        notifications = [
            ("nf1","u1","deadline","Prazo a aproximar","Landing Page termina em 3 dias",0,datetime.now().isoformat()),
            ("nf2","u1","comment","Novo comentário","Carla comentou numa tarefa",0,datetime.now().isoformat()),
        ]
        conn.executemany("INSERT INTO notifications VALUES (?,?,?,?,?,?,?)", notifications)

        conn.commit()
        print("✅ Base de dados Supabase criada com dados demo!")
    else:
        print("✅ Supabase carregado!")

    conn.close()

# Inicializar DB no arranque
init_db()

# ═══════════════ HELPERS ═══════════════
def uid():  return str(uuid.uuid4())[:8]
def now():  return datetime.now().isoformat()
def safe(u): return {k:v for k,v in u.items() if k != "password"}

def pj(v):
    if isinstance(v,(list,dict)): return v
    try: return json.loads(v) if v else []
    except: return []

def row2dict(row):
    if not row: return None
    return dict(row)

def map_user(r):
    if not r: return None
    u = row2dict(r) if not isinstance(r, dict) else r
    u["skills"]   = pj(u.get("skills","[]"))
    u["online"]   = bool(u.get("online",0))
    u["verified"] = bool(u.get("verified",1))
    u["picture"]  = u.get("picture") or None
    return u

def map_task(r):
    if not r: return None
    t = row2dict(r) if not isinstance(r, dict) else r
    t["tags"]         = pj(t.get("tags","[]"))
    t["subtasks"]     = pj(t.get("subtasks","[]"))
    t["comments"]     = pj(t.get("comments","[]"))
    t["dependencies"] = pj(t.get("dependencies","[]"))
    t["pinned"]       = bool(t.get("pinned",0))
    t["deadline"]     = str(t.get("deadline") or "")
    t["recurrence"]   = t.get("recurrence") or None
    t["recurrenceEnd"]= t.get("recurrence_end") or None
    return t

def map_project(r):
    if not r: return None
    p = row2dict(r) if not isinstance(r, dict) else r
    p["members"]  = pj(p.get("members","[]"))
    p["deadline"] = p.get("deadline") or ""
    return p

def map_event(r):
    if not r: return None
    e = row2dict(r) if not isinstance(r, dict) else r
    e["attendees"] = pj(e.get("attendees","[]"))
    e["allDay"]    = bool(e.get("all_day",0))
    e["start"]     = e.get("start_time","")
    e["end"]       = e.get("end_time","")
    return e

def map_note(r):
    if not r: return None
    n = row2dict(r) if not isinstance(r, dict) else r
    n["user"]   = n.get("user_id","")
    n["pinned"] = bool(n.get("pinned",0))
    return n

def cur():
    uid_v = session.get("uid")
    if not uid_v: return None
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id=?", (uid_v,)).fetchone()
    conn.close()
    return map_user(row)

# ═══════════════ EMAIL ═══════════════
def send_code_email(email, name, code):
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔐 TaskFlow — Código: {code}"
        msg["From"] = f"TaskFlow <{SMTP_EMAIL}>"
        msg["To"] = email
        html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#11111f;border-radius:14px;padding:32px;color:#eeeef5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a78bfa);display:inline-flex;align-items:center;justify-content:center;font-size:18px">⚡</div>
            <span style="font-size:20px;font-weight:800;color:#eeeef5">TaskFlow</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;color:#eeeef5">Olá, {name}! 👋</h2>
          <p style="color:#8888aa;margin-bottom:24px;line-height:1.6">Usa o código abaixo para verificar o teu email e aceder ao TaskFlow.</p>
          <div style="background:#1d1d30;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
            <div style="font-size:44px;font-weight:800;letter-spacing:12px;color:#a5b4fc;font-family:monospace">{code}</div>
            <div style="font-size:12px;color:#50507a;margin-top:10px">Válido por 10 minutos</div>
          </div>
          <p style="font-size:12px;color:#50507a">Se não criaste uma conta no TaskFlow, ignora este email.</p>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, email, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL] Erro: {e}")
        return False

def send_task_email(user, task_title, assigned_by, deadline, priority):
    """Envia email quando uma tarefa é atribuída"""
    try:
        prio_colors = {"high":"#ef4444","medium":"#f59e0b","low":"#22c55e"}
        prio_labels = {"high":"Alta","medium":"Média","low":"Baixa"}
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[TaskFlow] Nova tarefa atribuída: {task_title}"
        msg["From"] = f"TaskFlow <{SMTP_EMAIL}>"
        msg["To"] = user["email"]
        html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#11111f;border-radius:14px;padding:32px;color:#eeeef5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a78bfa);display:inline-flex;align-items:center;justify-content:center;font-size:18px">⚡</div>
            <span style="font-size:20px;font-weight:800">TaskFlow</span>
          </div>
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Olá, {user["name"]}! 👋</h2>
          <p style="color:#8888aa;margin-bottom:20px">{assigned_by} atribuiu-te uma nova tarefa.</p>
          <div style="background:#1d1d30;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="font-size:16px;font-weight:700;margin-bottom:10px">{task_title}</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <span style="font-size:12px;padding:3px 10px;border-radius:6px;background:{prio_colors.get(priority,'#6366f1')}22;color:{prio_colors.get(priority,'#6366f1')}">
                🔴 Prioridade {prio_labels.get(priority,'Média')}
              </span>
              {f'<span style="font-size:12px;padding:3px 10px;border-radius:6px;background:#6366f122;color:#a5b4fc">📅 Prazo: {deadline}</span>' if deadline else ''}
            </div>
          </div>
          <a href="{BASE_URL}" style="display:inline-block;padding:11px 22px;background:#6366f1;color:#fff;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px">Ver no TaskFlow →</a>
          <p style="font-size:12px;color:#50507a;margin-top:20px">Entraste nesta notificação porque és membro do TaskFlow.</p>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, user["email"], msg.as_string())
    except Exception as e:
        print(f"[EMAIL TASK] Erro: {e}")

def send_mention_email(user, mentioned_by, task_title, comment_text):
    """Envia email quando alguém é mencionado num comentário"""
    try:
        msg = MIMEMultipart("alternative")
        msg['Subject'] = '[TaskFlow] ' + mentioned_by + ' mencionou-te em: ' + task_title
        msg["From"] = f"TaskFlow <{SMTP_EMAIL}>"
        msg["To"] = user["email"]
        html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#11111f;border-radius:14px;padding:32px;color:#eeeef5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a78bfa);display:inline-flex;align-items:center;justify-content:center;font-size:18px">⚡</div>
            <span style="font-size:20px;font-weight:800">TaskFlow</span>
          </div>
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Olá, {user["name"]}! 👋</h2>
          <p style="color:#8888aa;margin-bottom:20px"><strong style="color:#a5b4fc">{mentioned_by}</strong> mencionou-te num comentário.</p>
          <div style="background:#1d1d30;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="font-size:12px;color:#50507a;margin-bottom:8px">Em: {task_title}</div>
            <div style="font-size:14px;line-height:1.6;color:#eeeef5">{comment_text}</div>
          </div>
          <a href="{BASE_URL}" style="display:inline-block;padding:11px 22px;background:#6366f1;color:#fff;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px">Ver comentário →</a>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, user["email"], msg.as_string())
    except Exception as e:
        print(f"[EMAIL MENTION] Erro: {e}")

# ═══════════════ ROUTES ═══════════════
@app.route("/")
def index(): return render_template("index.html")

@app.route("/api/config")
def get_config(): return jsonify({"google_client_id":GOOGLE_CLIENT_ID,"has_gemini":bool(GEMINI_KEY)})

@app.route("/api/config", methods=["PATCH"])
def patch_config():
    global GEMINI_KEY
    u=cur()
    if not u or u["role"]!="admin": return jsonify({"error":"Sem permissão"}),403
    if "gemini_api_key" in request.json: GEMINI_KEY=request.json["gemini_api_key"]
    return jsonify({"ok":True,"has_gemini":bool(GEMINI_KEY)})

# ── AUTH ──────────────────────────────────────
@app.route("/api/auth/login", methods=["POST"])
def login():
    d=request.json; email=d.get("email","").lower().strip(); pw=d.get("password","")
    # Rate limit de login — máx 5 tentativas
    ok, msg = check_login_limit(email)
    if not ok: return jsonify({"error":msg}),429
    conn=get_db()
    row=conn.execute("SELECT * FROM users WHERE email=?",(email,)).fetchone()
    conn.close()
    if not row or not check_password(pw, row["password"]):
        return jsonify({"error":"Email ou password incorretos."}),401
    reset_login_limit(email)  # reset contador ao fazer login com sucesso
    u=map_user(row)
    conn=get_db(); conn.execute("UPDATE users SET online=1 WHERE id=?",(u["id"],)); conn.commit(); conn.close()
    session.permanent = True
    session["uid"]=u["id"]; return jsonify({"user":safe(u)})

@app.route("/api/auth/register/send-code", methods=["POST"])
def send_code():
    d=request.json; name=d.get("name","").strip(); email=d.get("email","").lower().strip(); pw=d.get("password","")
    if not name: return jsonify({"error":"Nome obrigatório."}),400
    if "@" not in email: return jsonify({"error":"Email inválido."}),400
    if len(pw)<6: return jsonify({"error":"Mínimo 6 caracteres."}),400
    conn=get_db()
    if conn.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone():
        conn.close(); return jsonify({"error":"Email já registado."}),400
    conn.close()
    code=str(random.randint(100000,999999))
    VERIFY_CODES[email]={"code":code,"expires":datetime.now()+timedelta(minutes=10),"data":{"name":name,"email":email,"password":pw}}
    sent=send_code_email(email,name,code)
    if not sent: print(f"\n⚠️  CÓDIGO PARA {email}: {code}\n")
    return jsonify({"ok":True,"message":f"Código enviado para {email}"})

@app.route("/api/auth/register/verify", methods=["POST"])
def verify_code():
    d=request.json; email=d.get("email","").lower().strip(); code=d.get("code","").strip()
    entry=VERIFY_CODES.get(email)
    if not entry: return jsonify({"error":"Código expirado. Solicita um novo."}),400
    if datetime.now()>entry["expires"]:
        del VERIFY_CODES[email]; return jsonify({"error":"Código expirado. Solicita um novo."}),400
    if entry["code"]!=code: return jsonify({"error":"Código incorreto."}),400
    del VERIFY_CODES[email]
    data=entry["data"]; name=data["name"]; em=data["email"]; pw=hash_password(data["password"])
    initials="".join(w[0] for w in name.split())[:2].upper()
    colors=["#6366f1","#ec4899","#10b981","#f59e0b","#8b5cf6","#3b82f6"]
    conn=get_db()
    cnt=conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    color=colors[cnt%len(colors)]
    new_id=uid()
    conn.execute("INSERT INTO users (id,name,email,password,role,avatar,color,bio,department,phone,location,online,joined,skills,google_id,verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (new_id,name,em,pw,"member",initials,color,"","","","",1,datetime.now().strftime("%Y-%m-%d"),"[]",None,1))
    conn.commit()
    row=conn.execute("SELECT * FROM users WHERE id=?",(new_id,)).fetchone()
    conn.close()
    u=map_user(row); session.permanent=True; session["uid"]=u["id"]; return jsonify({"user":safe(u)})

@app.route("/api/auth/google", methods=["POST"])
def google_auth():
    token=request.json.get("credential","")
    if not token: return jsonify({"error":"Token inválido"}),400
    try:
        import urllib.request as ur
        resp=ur.urlopen(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}")
        info=json.loads(resp.read())
        email=info.get("email",""); name=info.get("name",""); gid=info.get("sub","")
        conn=get_db()
        row=conn.execute("SELECT * FROM users WHERE email=? OR google_id=?",(email,gid)).fetchone()
        if row:
            u=map_user(row)
            conn.execute("UPDATE users SET google_id=?,online=1 WHERE id=?",(gid,u["id"])); conn.commit()
        else:
            initials="".join(w[0] for w in name.split())[:2].upper()
            new_id=uid()
            conn.execute("INSERT INTO users (id,name,email,password,role,avatar,color,bio,department,phone,location,online,joined,skills,google_id,verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (new_id,name,email,"google_auth","member",initials,"#6366f1","","","","",1,datetime.now().strftime("%Y-%m-%d"),"[]",gid,1))
            conn.commit()
            row=conn.execute("SELECT * FROM users WHERE id=?",(new_id,)).fetchone()
            u=map_user(row)
        conn.close(); session.permanent=True; session["uid"]=u["id"]; return jsonify({"user":safe(u)})
    except Exception as e:
        return jsonify({"error":f"Erro Google Auth: {str(e)}"}),400

@app.route("/api/auth/me")
def get_me():
    cu = cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    return jsonify(safe(cu))

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    uid_v=session.get("uid")
    if uid_v:
        conn=get_db(); conn.execute("UPDATE users SET online=0 WHERE id=?",(uid_v,)); conn.commit(); conn.close()
    session.clear(); return jsonify({"ok":True})

# ── USERS ──────────────────────────────────────
@app.route("/api/users")
def get_users():
    conn=get_db(); rows=conn.execute("SELECT * FROM users").fetchall(); conn.close()
    return jsonify([safe(map_user(r)) for r in rows])

@app.route("/api/users/<i>")
def get_user(i):
    conn=get_db(); row=conn.execute("SELECT * FROM users WHERE id=?",(i,)).fetchone(); conn.close()
    return jsonify(safe(map_user(row))) if row else (jsonify({"error":"404"}),404)

@app.route("/api/users/<i>", methods=["PATCH"])
def patch_user(i):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    if cu["id"]!=i and cu["role"]!="admin": return jsonify({"error":"Sem permissão"}),403
    d=request.json; allowed=["name","bio","department","phone","location","color"]
    if cu["role"]=="admin": allowed+=["role"]
    sets=[]; vals=[]
    for k in allowed:
        if k in d: sets.append(f"{k}=?"); vals.append(d[k])
    if "skills" in d: sets.append("skills=?"); vals.append(json.dumps(d["skills"]))
    if not sets: return jsonify({"error":"Nada para atualizar"}),400
    vals.append(i)
    conn=get_db(); conn.execute(f"UPDATE users SET {','.join(sets)} WHERE id=?",vals); conn.commit()
    row=conn.execute("SELECT * FROM users WHERE id=?",(i,)).fetchone(); conn.close()
    return jsonify(safe(map_user(row)))

@app.route("/api/users/<i>", methods=["DELETE"])
def delete_user(i):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    # Só o próprio ou um admin pode eliminar
    if cu["id"]!=i and cu["role"]!="admin": return jsonify({"error":"Sem permissão"}),403
    # Admin não pode eliminar-se a si mesmo
    if cu["id"]==i and cu["role"]=="admin":
        conn=get_db()
        other_admins=conn.execute("SELECT COUNT(*) as c FROM users WHERE role='admin' AND id!=?",(i,)).fetchone()["c"]
        conn.close()
        if other_admins==0: return jsonify({"error":"Não podes eliminar o único admin"}),400
    conn=get_db()
    conn.execute("DELETE FROM users WHERE id=?",(i,))
    conn.execute("DELETE FROM notes WHERE user_id=?",(i,))
    conn.execute("DELETE FROM notifications WHERE user_id=?",(i,))
    conn.execute("UPDATE tasks SET assignee=NULL WHERE assignee=?",(i,))
    conn.commit(); conn.close()
    if cu["id"]==i: session.clear()
    return jsonify({"ok":True})

@app.route("/api/users/<i>/password", methods=["PATCH"])
def change_pw(i):
    cu=cur()
    if not cu or cu["id"]!=i: return jsonify({"error":"Sem permissão"}),403
    d=request.json
    if not check_password(d.get("current",""), cu["password"]):
        return jsonify({"error":"Password atual incorreta"}),400
    if len(d.get("new",""))<6: return jsonify({"error":"Mínimo 6 caracteres"}),400
    conn=get_db(); conn.execute("UPDATE users SET password=? WHERE id=?",(hash_password(d["new"]),i)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── PROJECTS ──────────────────────────────────
@app.route("/api/projects")
def get_projects():
    conn=get_db(); rows=conn.execute("SELECT * FROM projects").fetchall(); conn.close()
    return jsonify([map_project(r) for r in rows])

@app.route("/api/projects", methods=["POST"])
def create_project():
    cu=cur()
    if not cu or cu["role"] not in ["admin","manager"]: return jsonify({"error":"Sem permissão"}),403
    d=request.json; pid=uid()
    conn=get_db()
    conn.execute("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)",
        (pid,d.get("name",""),d.get("color","#6366f1"),d.get("icon","📁"),d.get("description",""),
         json.dumps([cu["id"]]),"active",d.get("deadline") or None,datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    row=conn.execute("SELECT * FROM projects WHERE id=?",(pid,)).fetchone(); conn.close()
    return jsonify(map_project(row))

@app.route("/api/projects/<pid>", methods=["PATCH"])
def patch_project(pid):
    d=request.json; sets=[]; vals=[]
    for k in ["name","color","icon","description","status","deadline"]:
        if k in d: sets.append(f"{k}=?"); vals.append(d[k] or None if k=="deadline" else d[k])
    if "members" in d: sets.append("members=?"); vals.append(json.dumps(d["members"]))
    if not sets: return jsonify({"ok":True})
    vals.append(pid)
    conn=get_db(); conn.execute(f"UPDATE projects SET {','.join(sets)} WHERE id=?",vals); conn.commit()
    row=conn.execute("SELECT * FROM projects WHERE id=?",(pid,)).fetchone(); conn.close()
    return jsonify(map_project(row))

@app.route("/api/projects/<pid>", methods=["DELETE"])
def del_project(pid):
    conn=get_db(); conn.execute("DELETE FROM tasks WHERE project=?",(pid,)); conn.execute("DELETE FROM projects WHERE id=?",(pid,)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── TASKS ──────────────────────────────────────
@app.route("/api/tasks")
def get_tasks():
    proj    = request.args.get("project")
    status  = request.args.get("status")
    limit   = min(int(request.args.get("limit", 200)), 500)  # máx 500
    offset  = int(request.args.get("offset", 0))
    conn = get_db()
    where, params = [], []
    if proj:   where.append("project=?");  params.append(proj)
    if status: where.append("status=?");   params.append(status)
    sql = "SELECT * FROM tasks"
    if where: sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY pinned DESC, created DESC LIMIT {limit} OFFSET {offset}"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([map_task(r) for r in rows])

DEMO_DOMAINS = ["taskflow.io"]  # domínios de contas demo — não enviar emails

def is_real_email(email):
    """Verifica se o email é real (não é conta demo)"""
    if not email or "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    return domain not in DEMO_DOMAINS

@app.route("/api/tasks", methods=["POST"])
def create_task():
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    d=request.json or {}
    title = d.get("title","").strip()
    if not title: return jsonify({"error":"Título obrigatório"}),400
    if len(title) > 200: return jsonify({"error":"Título demasiado longo (máx 200 chars)"}),400
    tid=uid(); conn=get_db()
    assignee_id=d.get("assignee","")
    conn.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (tid,d.get("title",""),d.get("description",""),d.get("status","A Fazer"),d.get("priority","medium"),
         assignee_id,json.dumps(d.get("tags",[])),d.get("deadline") or None,d.get("project",""),
         json.dumps(d.get("subtasks",[])),json.dumps([]),datetime.now().strftime("%Y-%m-%d"),0,
         json.dumps(d.get("dependencies",[])),d.get("recurrence") or None,d.get("recurrenceEnd") or None))
    conn.execute("INSERT INTO activity VALUES (?,?,?,?,?,?,?,?)",
        (uid(),cu["id"],"criou",d.get("title",""),"task","agora","✨",now()))
    # Notificar responsável
    if assignee_id and assignee_id != cu["id"]:
        conn.execute("INSERT INTO notifications VALUES (?,?,?,?,?,?,?)",
            (uid(),assignee_id,"task","Nova tarefa atribuída",
             f'{cu["name"]} atribuiu-te "{d.get("title","")}"',0,now()))
        asgn_row=conn.execute("SELECT * FROM users WHERE id=?",(assignee_id,)).fetchone()
        if asgn_row:
            asgn=map_user(asgn_row)
            if is_real_email(asgn.get("email","")):
                threading.Thread(target=send_task_email,args=(asgn,d.get("title",""),cu["name"],d.get("deadline",""),d.get("priority","medium")),daemon=True).start()
    conn.commit()
    row=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone(); conn.close()
    return jsonify(map_task(row))

@app.route("/api/tasks/<tid>", methods=["PATCH"])
def patch_task(tid):
    cu=cur(); d=request.json; sets=[]; vals=[]
    for k in ["title","description","status","priority","assignee","project"]:
        if k in d: sets.append(f"{k}=?"); vals.append(d[k])
    if "deadline" in d: sets.append("deadline=?"); vals.append(d["deadline"] or None)
    if "pinned" in d: sets.append("pinned=?"); vals.append(1 if d["pinned"] else 0)
    if "tags" in d: sets.append("tags=?"); vals.append(json.dumps(d["tags"]))
    if "subtasks" in d: sets.append("subtasks=?"); vals.append(json.dumps(d["subtasks"]))
    if "comments" in d: sets.append("comments=?"); vals.append(json.dumps(d["comments"]))
    if "dependencies" in d: sets.append("dependencies=?"); vals.append(json.dumps(d["dependencies"]))
    if not sets: return jsonify({"ok":True})
    vals.append(tid)
    conn=get_db()
    # Notificar se responsável mudou
    if "assignee" in d and cu:
        old_row=conn.execute("SELECT assignee,title FROM tasks WHERE id=?",(tid,)).fetchone()
        new_asgn=d["assignee"]
        if old_row and new_asgn and new_asgn!=old_row["assignee"] and new_asgn!=cu["id"]:
            conn.execute("INSERT INTO notifications VALUES (?,?,?,?,?,?,?)",
                (uid(),new_asgn,"task","Tarefa atribuída a ti",
                 f'{cu["name"]} atribuiu-te "{old_row["title"]}"',0,now()))
            asgn_row=conn.execute("SELECT * FROM users WHERE id=?",(new_asgn,)).fetchone()
            if asgn_row:
                asgn_u = map_user(asgn_row)
                if is_real_email(asgn_u.get("email","")):
                    threading.Thread(target=send_task_email,args=(asgn_u,old_row["title"],cu["name"],"",d.get("priority","medium")),daemon=True).start()
    # Log history for key fields
    if cu:
        old_task=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone()
        if old_task:
            for field in ["status","priority","assignee","deadline","title"]:
                if field in d:
                    log_task_change(conn,tid,cu["id"],field,old_task[field],d[field])
    conn.execute(f"UPDATE tasks SET {','.join(sets)} WHERE id=?",vals); conn.commit()
    row=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone()
    # Criar próxima ocorrência se tarefa recorrente foi concluída
    if "status" in d and d["status"] == "Concluído" and row:
        t = map_task(row)
        recur = t.get("recurrence")
        if recur and t.get("deadline"):
            try:
                from datetime import timedelta
                dl_raw = t["deadline"]
                dl = dl_raw if hasattr(dl_raw, 'strftime') else datetime.strptime(str(dl_raw), "%Y-%m-%d")
                if recur == "daily":      next_dl = dl + timedelta(days=1)
                elif recur == "weekly":   next_dl = dl + timedelta(weeks=1)
                elif recur == "biweekly": next_dl = dl + timedelta(weeks=2)
                elif recur == "monthly":
                    m = dl.month + 1; y = dl.year + (1 if m > 12 else 0); m = m if m<=12 else 1
                    next_dl = dl.replace(year=y, month=m)
                else: next_dl = None
                recur_end = t.get("recurrenceEnd")
                if next_dl and (not recur_end or next_dl.strftime("%Y-%m-%d") <= recur_end):
                    new_tid = uid()
                    c2 = get_db()
                    c2.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (new_tid, t["title"], t.get("description",""), "A Fazer",
                         t.get("priority","medium"), t.get("assignee",""),
                         json.dumps(t.get("tags",[])), next_dl.strftime("%Y-%m-%d"),
                         t.get("project",""), json.dumps([]), json.dumps([]),
                         datetime.now().strftime("%Y-%m-%d"), 0,
                         json.dumps([]), recur, recur_end))
                    c2.commit(); c2.close()
                    log_activity(cu["id"] if cu else "system", "criou (recorrência)", t["title"], "🔁")
            except Exception as e:
                print(f"[recurrence] Erro: {e}")
    conn.close()
    return jsonify(map_task(row))

@app.route("/api/tasks/<tid>", methods=["DELETE"])
def del_task(tid):
    conn=get_db(); conn.execute("DELETE FROM tasks WHERE id=?",(tid,)); conn.commit(); conn.close()
    return jsonify({"ok":True})

@app.route("/api/tasks/<tid>/comment", methods=["POST"])
def add_comment(tid):
    cu=cur(); conn=get_db()
    row=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone()
    if not row: conn.close(); return jsonify({"error":"404"}),404
    t=map_task(row)
    text=request.json.get("text","")
    c={"id":uid(),"user":cu["id"],"text":text,"created":now()}
    t["comments"].append(c)
    conn.execute("UPDATE tasks SET comments=? WHERE id=?",(json.dumps(t["comments"]),tid))
    # Detectar menções @nome
    import re, threading
    mentions=re.findall(r"@(\w+)",text)
    all_users=conn.execute("SELECT * FROM users").fetchall()
    for m in mentions:
        mentioned=next((map_user(u) for u in all_users if u["name"].split()[0].lower()==m.lower() or u["name"].lower().replace(" ","_")==m.lower()),None)
        if mentioned and mentioned["id"]!=cu["id"]:
            conn.execute("INSERT INTO notifications VALUES (?,?,?,?,?,?,?)",
                (uid(),mentioned["id"],"mention",f"@menção de {cu['name']}",
                 f'{cu["name"]} mencionou-te: "{text}"',0,now()))
            if is_real_email(mentioned.get("email","")):
                threading.Thread(target=send_mention_email,args=(mentioned,cu["name"],t["title"],text),daemon=True).start()
    conn.commit(); conn.close()
    return jsonify(c)

@app.route("/api/tasks/<tid>/comment/<cid>", methods=["DELETE"])
def del_comment(tid,cid):
    conn=get_db(); row=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone()
    if row:
        t=map_task(row); t["comments"]=[c for c in t["comments"] if c["id"]!=cid]
        conn.execute("UPDATE tasks SET comments=? WHERE id=?",(json.dumps(t["comments"]),tid)); conn.commit()
    conn.close(); return jsonify({"ok":True})

@app.route("/api/tasks/<tid>/subtask/<sid>", methods=["PATCH"])
def toggle_sub(tid,sid):
    conn=get_db(); row=conn.execute("SELECT * FROM tasks WHERE id=?",(tid,)).fetchone()
    if not row: conn.close(); return jsonify({"error":"404"}),404
    t=map_task(row); s=next((x for x in t["subtasks"] if x["id"]==sid),None)
    if s: s["done"]=not s["done"]
    conn.execute("UPDATE tasks SET subtasks=? WHERE id=?",(json.dumps(t["subtasks"]),tid)); conn.commit(); conn.close()
    return jsonify(s)

# ── EVENTS ──────────────────────────────────────
@app.route("/api/events")
def get_events():
    conn=get_db(); rows=conn.execute("SELECT * FROM events").fetchall(); conn.close()
    return jsonify([map_event(r) for r in rows])

@app.route("/api/events", methods=["POST"])
def create_event():
    cu=cur(); d=request.json; eid=uid(); conn=get_db()
    conn.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)",
        (eid,d.get("title",""),d.get("start",""),d.get("end",""),d.get("color","#6366f1"),
         d.get("project",""),d.get("type","meeting"),d.get("description",""),
         json.dumps(d.get("attendees",[])),1 if d.get("allDay") else 0))
    if cu: conn.execute("INSERT INTO activity VALUES (?,?,?,?,?,?,?,?)",(uid(),cu["id"],"criou evento",d.get("title",""),"event","agora","📅",now()))
    conn.commit(); row=conn.execute("SELECT * FROM events WHERE id=?",(eid,)).fetchone(); conn.close()
    return jsonify(map_event(row))

@app.route("/api/events/<eid>", methods=["PATCH"])
def patch_event(eid):
    d=request.json; sets=[]; vals=[]
    for k in ["title","color","project","type","description"]:
        if k in d: sets.append(f"{k}=?"); vals.append(d[k])
    if "start" in d: sets.append("start_time=?"); vals.append(d["start"])
    if "end" in d: sets.append("end_time=?"); vals.append(d["end"])
    if "allDay" in d: sets.append("all_day=?"); vals.append(1 if d["allDay"] else 0)
    if "attendees" in d: sets.append("attendees=?"); vals.append(json.dumps(d["attendees"]))
    if not sets: return jsonify({"ok":True})
    vals.append(eid)
    conn=get_db(); conn.execute(f"UPDATE events SET {','.join(sets)} WHERE id=?",vals); conn.commit()
    row=conn.execute("SELECT * FROM events WHERE id=?",(eid,)).fetchone(); conn.close()
    return jsonify(map_event(row))

@app.route("/api/events/<eid>", methods=["DELETE"])
def del_event(eid):
    conn=get_db(); conn.execute("DELETE FROM events WHERE id=?",(eid,)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── NOTES ──────────────────────────────────────
@app.route("/api/notes")
def get_notes():
    cu=cur()
    if not cu: return jsonify([])
    conn=get_db(); rows=conn.execute("SELECT * FROM notes WHERE user_id=?",(cu["id"],)).fetchall(); conn.close()
    return jsonify([map_note(r) for r in rows])

@app.route("/api/notes", methods=["POST"])
def create_note():
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    d=request.json; nid=uid(); conn=get_db()
    conn.execute("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?)",
        (nid,cu["id"],d.get("title","Nova Nota"),d.get("content",""),now(),now(),d.get("color","#6366f1"),0))
    conn.commit(); row=conn.execute("SELECT * FROM notes WHERE id=?",(nid,)).fetchone(); conn.close()
    return jsonify(map_note(row))

@app.route("/api/notes/<nid>", methods=["PATCH"])
def patch_note(nid):
    d=request.json; sets=["updated=?"]; vals=[now()]
    for k in ["title","content","color"]:
        if k in d: sets.append(f"{k}=?"); vals.append(d[k])
    if "pinned" in d: sets.append("pinned=?"); vals.append(1 if d["pinned"] else 0)
    vals.append(nid)
    conn=get_db(); conn.execute(f"UPDATE notes SET {','.join(sets)} WHERE id=?",vals); conn.commit()
    row=conn.execute("SELECT * FROM notes WHERE id=?",(nid,)).fetchone(); conn.close()
    return jsonify(map_note(row))

@app.route("/api/notes/<nid>", methods=["DELETE"])
def del_note(nid):
    conn=get_db(); conn.execute("DELETE FROM notes WHERE id=?",(nid,)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── NOTIFICATIONS ──────────────────────────────
@app.route("/api/notifications")
def get_notifs():
    cu=cur()
    if not cu: return jsonify([])
    conn=get_db(); rows=conn.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY created DESC",(cu["id"],)).fetchall(); conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/notifications/read-all", methods=["PATCH"])
def read_all_notifs():
    cu=cur()
    if cu:
        conn=get_db(); conn.execute("UPDATE notifications SET read=1 WHERE user_id=?",(cu["id"],)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── ACTIVITY & STATS ────────────────────────────
@app.route("/api/activity")
def get_activity():
    conn=get_db()
    limit = min(int(request.args.get("limit", 50)), 200)
    rows=conn.execute("SELECT a.*, u.name as uname, u.color as ucolor, u.avatar as uavatar FROM activity a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.created DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return jsonify([{"id":r["id"],"user":r["user_id"],"userName":r["uname"],"userColor":r["ucolor"],"userAvatar":r["uavatar"],"action":r["action"],"target":r["target"],"type":r["type"],"time":r["time"],"icon":r["icon"],"created":r["created"]} for r in rows])

@app.route("/api/admin/stats")
def get_admin_stats():
    cu=cur()
    if not cu or cu["role"]!="admin": return jsonify({"error":"Sem permissão"}),403
    conn=get_db()
    tasks=conn.execute("SELECT * FROM tasks").fetchall()
    users=conn.execute("SELECT * FROM users").fetchall()
    projects=conn.execute("SELECT * FROM projects").fetchall()
    msgs=conn.execute("SELECT COUNT(*) as c FROM chat_messages").fetchone()
    timers=conn.execute("SELECT SUM(duration) as total FROM task_timers WHERE end_time IS NOT NULL").fetchone()
    attachments=conn.execute("SELECT COUNT(*) as c FROM task_attachments").fetchone()
    history=conn.execute("SELECT COUNT(*) as c FROM task_history").fetchone()
    today=datetime.now().strftime("%Y-%m-%d")
    task_list=[map_task(t) for t in tasks]
    conn.close()
    return jsonify({
        "totalUsers":len(users),
        "totalTasks":len(task_list),
        "doneTasks":sum(1 for t in task_list if t["status"]=="Concluído"),
        "overdue":sum(1 for t in task_list if t["deadline"] and t["deadline"]<today and t["status"]!="Concluído"),
        "totalProjects":len(projects),
        "activeProjects":sum(1 for p in projects if dict(p).get("status")!="archived"),
        "chatMessages":msgs["c"] if msgs else 0,
        "totalTimeSecs":int(timers["total"] or 0),
        "attachments":attachments["c"] if attachments else 0,
        "historyChanges":history["c"] if history else 0,
    })

@app.route("/api/stats")
def get_stats():
    conn=get_db()
    rows=conn.execute("SELECT * FROM tasks").fetchall()
    conn.close()
    tasks=[map_task(r) for r in rows]
    total=len(tasks)
    today=datetime.now().strftime("%Y-%m-%d")
    done = sum(1 for t in tasks if t["status"]=="Concluído")
    inprog = sum(1 for t in tasks if t["status"]=="Em Progresso")
    review = sum(1 for t in tasks if t["status"]=="Revisão")
    todo = sum(1 for t in tasks if t["status"]=="A Fazer")
    overdue = sum(1 for t in tasks if t["deadline"] and t["deadline"]<today and t["status"]!="Concluído")
    rate = round(done/total*100) if total else 0
    return jsonify({
        "total":total,"done":done,"inprog":inprog,"review":review,
        "todo":todo,"overdue":overdue,"rate":rate,
        "pinned":sum(1 for t in tasks if t.get("pinned")),
        "today":sum(1 for t in tasks if t.get("deadline")==today and t["status"]!="Concluído")
    })

# ── GEMINI AI ────────────────────────────────────
@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    if not GEMINI_KEY: return jsonify({"error":"🔑 Chave Gemini não configurada. Vai a Definições → IA."}),400
    d=request.json; msg=d.get("message","").strip(); history=d.get("history",[]); context=d.get("context","")
    if not msg: return jsonify({"error":"Mensagem vazia"}),400
    try:
        import urllib.request as ur, urllib.error

        # Payload ultra-simples — só a mensagem do utilizador, sem histórico nem contexto
        # para garantir que funciona primeiro
        simple_msg = msg
        if context:
            # Incluir contexto compacto no início da mensagem
            simple_msg = f"{context}\n\nPEDIDO DO UTILIZADOR: {msg}"

        payload = {
            "contents": [{"role":"user","parts":[{"text":simple_msg[:6000]}]}],
            "generationConfig": {"maxOutputTokens":1024,"temperature":0.7}
        }

        # Adicionar histórico só se existir e for válido
        if history:
            clean = []
            last = None
            for m in history[-6:]:  # máx 6 mensagens
                r2 = m.get("role","")
                t2 = str(m.get("text","")).strip()[:800]
                if r2 not in ["user","model"] or not t2 or r2==last: continue
                clean.append({"role":r2,"parts":[{"text":t2}]})
                last = r2
            if clean:
                # Garantir que começa com user e termina antes da mensagem atual
                if clean[0]["role"]=="user":
                    payload["contents"] = clean + [{"role":"user","parts":[{"text":simple_msg[:3000]}]}]

        # Payload enviado ao Gemini

        req=ur.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type":"application/json"},
            method="POST"
        )
        try:
            resp=ur.urlopen(req,timeout=60)
            data=json.loads(resp.read())
            text=data["candidates"][0]["content"]["parts"][0]["text"]
            return jsonify({"text":text})
        except urllib.error.HTTPError as he:
            body = he.read().decode('utf-8','ignore')
            print(f"[Gemini] HTTP {he.code}: {body[:500]}")
            if he.code==400:
                # Tentar com mensagem mínima absoluta
                try:
                    min_payload = {"contents":[{"role":"user","parts":[{"text":msg[:500]}]}],"generationConfig":{"maxOutputTokens":512}}
                    req2=ur.Request(
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}",
                        data=json.dumps(min_payload).encode(),
                        headers={"Content-Type":"application/json"},method="POST"
                    )
                    resp2=ur.urlopen(req2,timeout=30)
                    data2=json.loads(resp2.read())
                    return jsonify({"text":data2["candidates"][0]["content"]["parts"][0]["text"]})
                except urllib.error.HTTPError as he2:
                    body2=he2.read().decode('utf-8','ignore')
                    print(f"[Gemini] Min payload also failed {he2.code}: {body2[:300]}")
                    return jsonify({"error":f"Erro Gemini {he2.code}: {body2[:200]}"}),he2.code
            elif he.code==429: return jsonify({"error":"⚠️ Limite da API Gemini atingido. Aguarda uns segundos."}),429
            elif he.code in [401,403]: return jsonify({"error":"🔑 Chave Gemini inválida. Vai a Definições → IA."}),401
            elif he.code==503: return jsonify({"error":"⏳ O Gemini está com muita procura agora. Aguarda 10 segundos e tenta novamente."}),503
            elif he.code==500: return jsonify({"error":"❌ Erro interno do Gemini. Tenta novamente."}),500
            return jsonify({"error":f"Erro Gemini {he.code}: {body[:200]}"}),he.code
    except Exception as e:
        print(f"[Gemini] Exception: {e}")
        err=str(e)
        if "503" in err or "unavailable" in err.lower():
            return jsonify({"error":"⏳ O Gemini está com muita procura agora. Aguarda 10 segundos e tenta novamente."}),503
        if "quota" in err.lower() or "429" in err:
            return jsonify({"error":"⚠️ Limite da API Gemini atingido. Tenta novamente em breve."}),429
        if "401" in err or "403" in err:
            return jsonify({"error":"🔑 Chave Gemini inválida. Vai a Definições → IA."}),401
        if "timeout" in err.lower():
            return jsonify({"error":"⏱️ O Gemini demorou demasiado. Tenta novamente."}),408
        return jsonify({"error":f"Erro: {err[:150]}"}),500

# ── PICTURE UPLOAD ──────────────────────────────
@app.route("/api/users/<i>/picture", methods=["POST"])
def upload_picture(i):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    if cu["id"]!=i and cu["role"]!="admin": return jsonify({"error":"Sem permissão"}),403
    import base64
    data = request.json.get("data","")
    if not data: return jsonify({"error":"Sem imagem"}),400
    # Store as base64 data URL (max ~500KB)
    if len(data) > 700000: return jsonify({"error":"Imagem muito grande. Máximo 500KB."}),400
    conn=get_db(); conn.execute("UPDATE users SET picture=? WHERE id=?",(data,i)); conn.commit()
    row=conn.execute("SELECT * FROM users WHERE id=?",(i,)).fetchone(); conn.close()
    return jsonify(safe(map_user(row)))

@app.route("/api/users/<i>/picture", methods=["DELETE"])
def delete_picture(i):
    cu=cur()
    if not cu or (cu["id"]!=i and cu["role"]!="admin"): return jsonify({"error":"Sem permissão"}),403
    conn=get_db(); conn.execute("UPDATE users SET picture=NULL WHERE id=?",(i,)); conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── ONBOARDING ──────────────────────────────────
@app.route("/api/auth/onboarding", methods=["POST"])
def save_onboarding():
    cu = cur()
    d = request.json or {}
    use_type  = d.get("use_type", "pessoal")
    team_size = d.get("team_size", "solo")
    goal      = d.get("goal", "")
    if cu:
        conn = get_db()
        conn.execute("UPDATE users SET department=? WHERE id=?", (use_type, cu["id"]))
        conn.commit(); conn.close()
    return jsonify({"ok": True})

# ── INVITES ─────────────────────────────────────
INVITE_TOKENS = {}

def send_invite_email(to_email, invited_by_name, token):
    try:
        invite_url = f"{BASE_URL}/join?token={token}"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[TaskFlow] {invited_by_name} convidou-te para a equipa!"
        msg["From"]    = f"TaskFlow <{SMTP_EMAIL}>"
        msg["To"]      = to_email
        html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#11111f;border-radius:14px;padding:32px;color:#eeeef5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a78bfa);display:inline-flex;align-items:center;justify-content:center;font-size:18px">&#9889;</div>
            <span style="font-size:20px;font-weight:800">TaskFlow</span>
          </div>
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Foste convidado! &#127881;</h2>
          <p style="color:#8888aa;margin-bottom:20px"><strong style="color:#a5b4fc">{invited_by_name}</strong> convidou-te para se juntar à equipa no TaskFlow.</p>
          <div style="background:#1d1d30;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
            <p style="color:#8888aa;font-size:13px;margin-bottom:14px">Clica no botão para aceitar o convite e criar a tua conta</p>
            <a href="{invite_url}" style="display:inline-block;padding:13px 28px;background:#6366f1;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Aceitar convite &rarr;</a>
          </div>
          <p style="font-size:11px;color:#50507a">Este convite expira em 48 horas.</p>
          <p style="font-size:11px;color:#50507a;margin-top:6px">Link: <span style="color:#a5b4fc">{invite_url}</span></p>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[INVITE EMAIL] Erro: {e}")
        return False

@app.route("/api/invite", methods=["POST"])
def send_invite():
    cu = cur()
    if not cu: return jsonify({"error": "Não autenticado"}), 401
    email = request.json.get("email","").lower().strip()
    role  = request.json.get("role","member")
    if "@" not in email: return jsonify({"error":"Email inválido"}),400
    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone()
    conn.close()
    if existing: return jsonify({"error":"Este email já tem conta no TaskFlow"}),400
    token = str(uuid.uuid4())
    INVITE_TOKENS[token] = {
        "email": email, "invited_by": cu["name"],
        "invited_by_id": cu["id"], "role": role,
        "expires": datetime.now() + timedelta(hours=48)
    }
    invite_url = f"{BASE_URL}/join?token={token}"
    threading.Thread(target=send_invite_email, args=(email, cu["name"], token), daemon=True).start()
    print(f"\n📧 LINK DE CONVITE para {email}:\n   {invite_url}\n")
    return jsonify({"ok": True, "message": f"Convite enviado para {email}", "invite_url": invite_url})

@app.route("/api/invite/check")
def check_invite():
    token = request.args.get("token","")
    inv   = INVITE_TOKENS.get(token)
    if not inv: return jsonify({"error":"Convite inválido ou expirado"}),404
    if datetime.now() > inv["expires"]:
        del INVITE_TOKENS[token]
        return jsonify({"error":"Convite expirado"}),410
    return jsonify({"email":inv["email"],"invited_by":inv["invited_by"],"role":inv["role"]})

@app.route("/api/invite/accept", methods=["POST"])
def accept_invite():
    d     = request.json
    token = d.get("token","")
    inv   = INVITE_TOKENS.get(token)
    if not inv: return jsonify({"error":"Convite inválido ou expirado"}),404
    if datetime.now() > inv["expires"]:
        del INVITE_TOKENS[token]
        return jsonify({"error":"Convite expirado"}),410
    name  = d.get("name","").strip(); pw = d.get("password","")
    email = inv["email"]
    if not name: return jsonify({"error":"Nome obrigatório"}),400
    if len(pw)<6: return jsonify({"error":"Mínimo 6 caracteres"}),400
    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone():
        conn.close(); return jsonify({"error":"Email já registado"}),400
    initials = "".join(w[0] for w in name.split())[:2].upper()
    colors   = ["#6366f1","#ec4899","#10b981","#f59e0b","#8b5cf6","#3b82f6"]
    cnt      = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    new_id   = uid()
    conn.execute("INSERT INTO users (id,name,email,password,role,avatar,color,bio,department,phone,location,online,joined,skills,google_id,verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (new_id,name,email,pw,inv["role"],initials,colors[cnt%len(colors)],"","","","",1,datetime.now().strftime("%Y-%m-%d"),"[]",None,1))
    conn.execute("INSERT INTO notifications VALUES (?,?,?,?,?,?,?)",
        (uid(),inv["invited_by_id"],"team",f"{name} aceitou o convite!",
         f"{name} juntou-se à equipa via convite.",0,now()))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?",(new_id,)).fetchone()
    conn.close()
    del INVITE_TOKENS[token]
    u = map_user(row); session["uid"] = u["id"]
    return jsonify({"user": safe(u)})

@app.route("/join")
def join_page():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status":"ok","version":"5"})


# ── DEADLINE REMINDERS ──────────────────────────
def send_deadline_reminder(user, task_title, days_left, deadline):
    try:
        urgency = "hoje" if days_left==0 else f"em {days_left} dia{'s' if days_left>1 else ''}"
        color   = "#ef4444" if days_left<=1 else "#f59e0b"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[TaskFlow] ⏰ Prazo a aproximar-se: {task_title}"
        msg["From"]    = f"TaskFlow <{SMTP_EMAIL}>"
        msg["To"]      = user["email"]
        html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#11111f;border-radius:14px;padding:32px;color:#eeeef5">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:18px">&#9889;</div>
            <span style="font-size:20px;font-weight:800">TaskFlow</span>
          </div>
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Olá, {user['name']}! &#9200;</h2>
          <p style="color:#8888aa;margin-bottom:20px">Tens uma tarefa com prazo <strong style="color:{color}">{urgency}</strong>.</p>
          <div style="background:#1d1d30;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:16px;font-weight:700;margin-bottom:8px">{task_title}</div>
            <div style="font-size:13px;color:#8888aa">&#128197; Prazo: <strong style="color:{color}">{deadline}</strong></div>
          </div>
          <a href="{BASE_URL}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Ver tarefa &#8594;</a>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, user["email"], msg.as_string())
        return True
    except Exception as e:
        print(f"[REMINDER] Erro: {e}")
        return False


def run_reminders_once():
    sent = 0
    skipped = 0
    try:
        today = datetime.now().date()
        conn  = get_db()
        tasks = conn.execute("SELECT * FROM tasks WHERE deadline IS NOT NULL AND status != 'Concluído'").fetchall()
        users = {r["id"]: map_user(r) for r in conn.execute("SELECT * FROM users").fetchall()}
        conn.close()
        for t in tasks:
            try:
                dl_raw = t["deadline"]
                if hasattr(dl_raw, 'strftime'): dl = dl_raw
                else: dl = datetime.strptime(str(dl_raw), "%Y-%m-%d").date()
                diff = (dl - today).days
                if diff in [0, 1, 3] and t["assignee"] and t["assignee"] in users:
                    user = users[t["assignee"]]
                    if not is_real_email(user["email"]):
                        skipped += 1
                        print(f"[REMINDER] Ignorado (conta demo): {user['email']}")
                        continue
                    ok = send_deadline_reminder(user, t["title"], diff, t["deadline"])
                    if ok:
                        sent += 1
                        print(f"[REMINDER] ✅ Enviado para {user['email']} — '{t['title']}' em {diff}d")
                    else:
                        print(f"[REMINDER] ❌ Falhou para {user['email']}")
            except Exception as e:
                print(f"[REMINDER TASK] Erro: {e}")
    except Exception as e:
        print(f"[REMINDER] Erro: {e}")
    print(f"[REMINDER] Resumo: {sent} enviado(s), {skipped} ignorado(s) (demo)")
    return sent


# ── CHAT INTERNO ────────────────────────────────
@app.route("/api/chat", methods=["GET"])
def get_chat():
    conn=get_db()
    rows=conn.execute("SELECT * FROM chat_messages ORDER BY created DESC LIMIT 100").fetchall()
    conn.close()
    msgs=[dict(r) for r in reversed(rows)]
    return jsonify(msgs)

@app.route("/api/chat", methods=["POST"])
def post_chat():
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    text=request.json.get("text","").strip()
    if not text: return jsonify({"error":"Mensagem vazia"}),400
    mid=uid(); ts=now()
    conn=get_db()
    conn.execute("INSERT INTO chat_messages VALUES (?,?,?,?,?)",(mid,cu["id"],text,ts,0))
    conn.commit()
    row=conn.execute("SELECT * FROM chat_messages WHERE id=?",(mid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/chat/<mid>", methods=["DELETE"])
def del_chat(mid):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    conn=get_db()
    msg=conn.execute("SELECT * FROM chat_messages WHERE id=?",(mid,)).fetchone()
    if not msg: conn.close(); return jsonify({"error":"404"}),404
    if msg["user_id"]!=cu["id"] and cu["role"]!="admin":
        conn.close(); return jsonify({"error":"Sem permissão"}),403
    conn.execute("DELETE FROM chat_messages WHERE id=?",(mid,))
    conn.commit(); conn.close()
    return jsonify({"ok":True})

# ── TEMPORIZADOR POR TAREFA ─────────────────────
@app.route("/api/tasks/<tid>/timer/start", methods=["POST"])
def timer_start(tid):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    # Parar timer ativo se existir
    conn=get_db()
    active=conn.execute("SELECT * FROM task_timers WHERE task_id=? AND user_id=? AND end_time IS NULL",(tid,cu["id"])).fetchone()
    if active: conn.close(); return jsonify({"error":"Já há um timer ativo"}),400
    tid_id=uid(); ts=now()
    conn.execute("INSERT INTO task_timers VALUES (?,?,?,?,?,?,?)",(tid_id,tid,cu["id"],ts,None,0,""))
    conn.commit()
    row=conn.execute("SELECT * FROM task_timers WHERE id=?",(tid_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/tasks/<tid>/timer/stop", methods=["POST"])
def timer_stop(tid):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    conn=get_db()
    active=conn.execute("SELECT * FROM task_timers WHERE task_id=? AND user_id=? AND end_time IS NULL",(tid,cu["id"])).fetchone()
    if not active: conn.close(); return jsonify({"error":"Sem timer ativo"}),400
    ts=now()
    start=datetime.fromisoformat(active["start_time"])
    duration=int((datetime.now()-start).total_seconds())
    note=request.json.get("note","") if request.json else ""
    conn.execute("UPDATE task_timers SET end_time=?,duration=?,note=? WHERE id=?",(ts,duration,note,active["id"]))
    conn.commit()
    row=conn.execute("SELECT * FROM task_timers WHERE id=?",(active["id"],)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/tasks/<tid>/timers", methods=["GET"])
def get_timers(tid):
    conn=get_db()
    rows=conn.execute("SELECT * FROM task_timers WHERE task_id=? ORDER BY start_time DESC",(tid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── HISTÓRICO DE ALTERAÇÕES ─────────────────────
@app.route("/api/tasks/<tid>/history", methods=["GET"])
def get_task_history(tid):
    conn=get_db()
    rows=conn.execute("SELECT h.*,u.name as user_name,u.color as user_color,u.avatar as user_avatar FROM task_history h LEFT JOIN users u ON h.user_id=u.id WHERE h.task_id=? ORDER BY h.created DESC",(tid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

def log_task_change(conn, tid, uid_v, field, old_val, new_val):
    if str(old_val)==str(new_val): return
    conn.execute("INSERT INTO task_history VALUES (?,?,?,?,?,?,?)",
        (uid(),tid,uid_v,field,str(old_val),str(new_val),now()))

# Patch task_patch to log history
# (injected into patch_task route)

# ── ANEXOS ──────────────────────────────────────
@app.route("/api/tasks/<tid>/attachments", methods=["GET"])
def get_attachments(tid):
    conn=get_db()
    rows=conn.execute("SELECT id,task_id,user_id,filename,mimetype,size,created FROM task_attachments WHERE task_id=? ORDER BY created DESC",(tid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/tasks/<tid>/attachments", methods=["POST"])
def add_attachment(tid):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    d=request.json
    filename=d.get("filename","ficheiro")
    mimetype=d.get("mimetype","application/octet-stream")
    data=d.get("data","")
    size=len(data)
    if size>2000000: return jsonify({"error":"Ficheiro demasiado grande (máx 1.5MB)"}),400
    aid=uid(); ts=now()
    conn=get_db()
    conn.execute("INSERT INTO task_attachments VALUES (?,?,?,?,?,?,?,?)",(aid,tid,cu["id"],filename,mimetype,data,size,ts))
    conn.commit()
    row=conn.execute("SELECT id,task_id,user_id,filename,mimetype,size,created FROM task_attachments WHERE id=?",(aid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/tasks/<tid>/attachments/<aid>", methods=["GET"])
def get_attachment_data(tid, aid):
    conn=get_db()
    row=conn.execute("SELECT * FROM task_attachments WHERE id=? AND task_id=?",(aid,tid)).fetchone()
    conn.close()
    if not row: return jsonify({"error":"404"}),404
    return jsonify({"data":row["data"],"filename":row["filename"],"mimetype":row["mimetype"]})

@app.route("/api/tasks/<tid>/attachments/<aid>", methods=["DELETE"])
def del_attachment(tid, aid):
    cu=cur()
    if not cu: return jsonify({"error":"Não autenticado"}),401
    conn=get_db()
    row=conn.execute("SELECT * FROM task_attachments WHERE id=? AND task_id=?",(aid,tid)).fetchone()
    if not row: conn.close(); return jsonify({"error":"404"}),404
    if row["user_id"]!=cu["id"] and cu["role"]!="admin":
        conn.close(); return jsonify({"error":"Sem permissão"}),403
    conn.execute("DELETE FROM task_attachments WHERE id=?",(aid,))
    conn.commit(); conn.close()
    return jsonify({"ok":True})

def check_deadline_reminders():
    import time
    def _run():
        print("Verificar lembretes ao arrancar...")
        n = run_reminders_once()
        print(f"Lembretes: {n} enviado(s)")
        while True:
            time.sleep(86400)
            run_reminders_once()
    threading.Thread(target=_run, daemon=True).start()
    print("Sistema de lembretes ativo")

@app.route("/api/test-reminders")
def test_reminders():
    cu = cur()
    if not cu or cu["role"] != "admin":
        return jsonify({"error": "Sem permissao"}), 403
    threading.Thread(target=run_reminders_once, daemon=True).start()
    return jsonify({"ok": True, "message": "Verificacao iniciada — verifica a consola e o email"})

check_deadline_reminders()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    print(f"⚡ TaskFlow — http://127.0.0.1:{port}")
    app.run(debug=debug, port=port, host="0.0.0.0")
