// ═══════════════════════════════════════════════════
//  TaskFlow v5 — app.js
//  Gemini AI · Drag & Drop · Pomodoro · Notes · Calendar Google-style
// ═══════════════════════════════════════════════════

const DEFAULT_TAGS = [
  {id:"dev",l:"Dev",c:"#6366f1"},{id:"design",l:"Design",c:"#ec4899"},
  {id:"bug",l:"Bug",c:"#ef4444"},{id:"feature",l:"Feature",c:"#22c55e"},
  {id:"docs",l:"Docs",c:"#f59e0b"},{id:"devops",l:"DevOps",c:"#06b6d4"},
  {id:"test",l:"Teste",c:"#8b5cf6"},{id:"urgent",l:"Urgente",c:"#f97316"},
];
let TAGS = JSON.parse(localStorage.getItem("tf_custom_tags")||"null") || DEFAULT_TAGS;

function saveTags(){ localStorage.setItem("tf_custom_tags", JSON.stringify(TAGS)); }

function openTagManager(){
  const mo=document.createElement("div"); mo.className="mo";
  mo.innerHTML=`<div class="modal" style="max-width:420px;padding:28px">
    <div class="mhd" style="margin-bottom:18px"><h3>🏷️ Etiquetas Personalizadas</h3><button onclick="this.closest('.mo').remove()">✕</button></div>
    <div id="tag-list" style="margin-bottom:16px">${renderTagList()}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input class="fi" id="new-tag-name" placeholder="Nome da etiqueta" style="flex:2"/>
      <input type="color" id="new-tag-color" value="#6366f1" style="width:44px;height:38px;border:1px solid var(--b1);border-radius:8px;cursor:pointer;padding:2px;background:var(--bg3)"/>
      <button class="btn-cta" style="padding:8px 14px" onclick="addCustomTag()">+ Adicionar</button>
    </div>
    <button class="btn-ghost" style="width:100%;font-size:12px" onclick="TAGS=[...DEFAULT_TAGS];saveTags();document.getElementById('tag-list').innerHTML=renderTagList();toast('Etiquetas restauradas','s')">↩ Restaurar padrão</button>
  </div>`;
  document.body.appendChild(mo);
}

function renderTagList(){
  return TAGS.map((t,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1)">
    <span style="width:12px;height:12px;border-radius:3px;background:${t.c};flex-shrink:0"></span>
    <span style="font-size:13px;flex:1;font-weight:500">${t.l}</span>
    <span style="font-size:11px;padding:2px 8px;border-radius:5px;background:${t.c}18;color:${t.c}">${t.id}</span>
    <button onclick="removeTag(${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;padding:2px 6px" title="Remover">✕</button>
  </div>`).join("");
}

function addCustomTag(){
  const name=document.getElementById("new-tag-name").value.trim();
  const color=document.getElementById("new-tag-color").value;
  if(!name){toast("Nome obrigatório","w");return;}
  const id=name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
  if(TAGS.find(t=>t.id===id)){toast("Etiqueta já existe","w");return;}
  TAGS.push({id,l:name,c:color});
  saveTags();
  document.getElementById("tag-list").innerHTML=renderTagList();
  document.getElementById("new-tag-name").value="";
  toast(`Etiqueta "${name}" adicionada!`,"s");
}

function removeTag(idx){
  const t=TAGS[idx];
  TAGS.splice(idx,1);
  saveTags();
  document.getElementById("tag-list").innerHTML=renderTagList();
  toast(`"${t.l}" removida`,"i");
}
const PRIO = {
  high:  {l:"Alta",  c:"#ef4444",bg:"rgba(239,68,68,.14)"},
  medium:{l:"Média", c:"#f59e0b",bg:"rgba(245,158,11,.14)"},
  low:   {l:"Baixa", c:"#22c55e",bg:"rgba(34,197,94,.14)"},
};
const COLS  = ["A Fazer","Em Progresso","Revisão","Concluído"];
const SC    = {"A Fazer":"#6b7280","Em Progresso":"#3b82f6","Revisão":"#f59e0b","Concluído":"#22c55e"};
const ROLES = {admin:{l:"Admin",c:"#f97316",i:"👑"},manager:{l:"Manager",c:"#8b5cf6",i:"🛡️"},member:{l:"Member",c:"#3b82f6",i:"👤"},viewer:{l:"Viewer",c:"#6b7280",i:"👁️"}};
const PALETTE = ["#6366f1","#ec4899","#22c55e","#f59e0b","#8b5cf6","#3b82f6","#ef4444","#06b6d4","#f97316","#10b981"];
const EV_TYPES = {meeting:"🤝 Reunião",review:"🔍 Revisão",deploy:"🚀 Deploy",deadline:"⏰ Deadline",workshop:"🎓 Workshop",other:"📌 Outro"};

const S = {
  user:null, tasks:[], users:[], projects:[], events:[], notes:[], activity:[],
  view:"dashboard", search:"",
  calView:"month", calDate:new Date(),
  selColor:"#6366f1",
  newSubs:[], newStatus:"A Fazer",
  stab:"perfil",
  noteOpen:null,
  aiHistory:[], hasGemini:false, gcid:"",
  dTask:null, dCol:null, dOverCard:null,
  pomMode:"work", pomMin:25, pomSec:0, pomRunning:false, pomTimer:null, pomSessions:0, pomTotal:25*60,
  kf:{ proj:"", assignee:"", priority:"", deadline:"" }, // kanban filters
  notifs:[],
  dashWidgets: JSON.parse(localStorage.getItem("tf_dash_widgets")||'["stats","charts","streak","weather","projects","activity","pinned","overdue"]'),
};
let chatPollInterval = null;

// ── API ────────────────────────────────────────────
const api = async (url, m="GET", b=null, timeoutMs=15000) => {
  const o={method:m,headers:{"Content-Type":"application/json"}};
  if(b) o.body=JSON.stringify(b);
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    const r = await fetch(url, {...o, signal:controller.signal});
    clearTimeout(timer);
    if(!r.ok && r.status===401 && url!=="/api/auth/me" && url!=="/api/auth/login"){
      // Sessão expirada — tentar re-login automático silencioso
      const creds = localStorage.getItem("tf_creds");
      if(creds){
        try {
          const {email, password} = JSON.parse(creds);
          const relogin = await fetch("/api/auth/login",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email,password})
          });
          const redata = await relogin.json();
          if(redata.user){
            S.user = redata.user;
            localStorage.setItem("tf_u", JSON.stringify(redata.user));
            // Repetir o pedido original após re-login
            const r2 = await fetch(url, {...o});
            return r2.json();
          }
        } catch(e2) {}
      }
      // Login Google ou sem credenciais — redirecionar para login silenciosamente
      localStorage.removeItem("tf_u");
      localStorage.removeItem("tf_creds");
      S.user = null;
      document.getElementById("app")?.classList.add("hidden");
      document.getElementById("login-screen")?.classList.remove("hidden");
      toast("A sessão expirou. Faz login novamente.","w");
      return {error:"Sessão expirada."};
    }
    return r.json();
  } catch(e) {
    console.error("API error:", url, e);
    if(e.name==="AbortError")
      return {error:"⏱️ Pedido demorou demasiado. Verifica a ligação."};
    if(e.message==="Failed to fetch")
      return {error:"⚠️ Sem ligação ao servidor. Verifica se o TaskFlow está a correr."};
    return {error: "Erro de rede: " + e.message};
  }
};

// Global refresh — reloads all data and re-renders
async function refreshAll(opts={}){
  // Seletivo: só atualiza o que é necessário
  const toFetch = [];
  if(opts.tasks!==false) toFetch.push(api("/api/tasks").then(r=>{ if(Array.isArray(r)) S.tasks=r; }));
  if(opts.activity!==false) toFetch.push(api("/api/activity").then(r=>{ if(Array.isArray(r)) S.activity=r; }));
  if(opts.projects) toFetch.push(api("/api/projects").then(r=>{ if(Array.isArray(r)) S.projects=r; }));
  if(opts.users) toFetch.push(api("/api/users").then(r=>{ if(Array.isArray(r)) S.users=r; }));
  if(opts.notifs) toFetch.push(api("/api/notifications").then(r=>{ if(Array.isArray(r)){ S.notifs=r; updateNotifBadge(); } }));
  await Promise.all(toFetch);
  updateSB();
  render(S.view);
}

// ── BOOT ──────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  const cfg = await api("/api/config");
  S.gcid = cfg.google_client_id||""; S.hasGemini = cfg.has_gemini||false;
  initGoogle(); updateAIStatus();
  // Verificar se há token de convite na URL
  const hasToken = new URLSearchParams(window.location.search).get("token");
  if(hasToken){ checkInviteToken(); return; }
  // Tentar restaurar sessão do localStorage (persiste entre sessões)
  const saved = localStorage.getItem("tf_u");
  if(saved){
    try {
      const userData = JSON.parse(saved);
      // Verificar se a sessão no servidor ainda é válida
      const me = await api("/api/auth/me");
      if(me && me.id){
        S.user = me;
        localStorage.setItem("tf_u", JSON.stringify(me));
        await loadAll(); showApp(); return;
      }
      // Sessão expirou — tentar re-login automático com credenciais guardadas
      const creds = localStorage.getItem("tf_creds");
      if(creds){
        const {email, password} = JSON.parse(creds);
        const r = await api("/api/auth/login","POST",{email,password});
        if(r.user){
          S.user = r.user;
          localStorage.setItem("tf_u", JSON.stringify(r.user));
          await loadAll(); showApp(); return;
        }
      }
      // Não conseguiu re-login — limpar e mostrar login
      localStorage.removeItem("tf_u");
      localStorage.removeItem("tf_creds");
    } catch(e) { localStorage.removeItem("tf_u"); }
  }
});

function initGoogle(){
  if(!S.gcid) return;
  // Set client_id on the onload div
  const onload = document.getElementById("g_id_onload");
  if(onload) onload.setAttribute("data-client_id", S.gcid);
  const signin = document.getElementById("g_id_signin");
  if(signin) signin.setAttribute("data-client_id", S.gcid);

  if(window.google?.accounts?.id){
    google.accounts.id.initialize({
      client_id: S.gcid,
      callback: handleGoogleCb,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
    });
    // Render the official button
    const wrap = document.getElementById("g_id_signin");
    if(wrap){
      google.accounts.id.renderButton(wrap, {
        type: "standard",
        shape: "rectangular",
        theme: "outline",
        text: "continue_with",
        size: "large",
        logo_alignment: "left",
        width: 352,
      });
    }
  } else {
    // Retry when script loads
    setTimeout(initGoogle, 500);
  }
}

function tryGoogleLogin(){
  if(!S.gcid){ toast("Google Client ID não configurado","w"); return; }
  if(window.google?.accounts?.id){
    google.accounts.id.prompt();
  } else {
    toast("A carregar Google...","w");
    setTimeout(tryGoogleLogin, 1500);
  }
}



async function handleGoogleCb(resp){
  const r = await api("/api/auth/google","POST",{credential:resp.credential});
  if(r.error){ toast(r.error,"e"); return; }
  const isNew = !r.user.department && !r.user.bio;
  S.user=r.user; localStorage.setItem("tf_u",JSON.stringify(r.user));
  await loadAll(); showApp(); toast(`Olá, ${S.user.name}! 👋`,"s");
  if(isNew) showOnboarding();
}

async function loadAll(){
  try {
    // Carregar tudo em paralelo para máxima performance
    const [tasks, users, projects, events, notes, activity, notifs, cfg] = await Promise.all([
      api("/api/tasks"),
      api("/api/users"),
      api("/api/projects"),
      api("/api/events"),
      api("/api/notes"),
      api("/api/activity"),
      api("/api/notifications"),
      api("/api/config"),
    ]);
    S.tasks    = Array.isArray(tasks)    ? tasks    : [];
    S.users    = Array.isArray(users)    ? users    : [];
    S.projects = Array.isArray(projects) ? projects : [];
    S.events   = Array.isArray(events)   ? events   : [];
    S.notes    = Array.isArray(notes)    ? notes    : [];
    S.activity = Array.isArray(activity) ? activity : [];
    S.notifs   = Array.isArray(notifs)   ? notifs   : [];
    updateNotifBadge();
    if(cfg && !cfg.error){ S.hasGemini=cfg.has_gemini; updateAIStatus(); }
  } catch(e) {
    console.error("[loadAll] Erro:", e);
    toast("Erro ao carregar dados. Recarrega a página.","e");
  }
}

async function checkNotifs(){
  try {
    const n = await api("/api/notifications");
    if(!Array.isArray(n)) return;
    S.notifs = n;
    updateNotifBadge();
  } catch(e) {}
  renderNotifList(n);
}

function updateAIStatus(){
  const nk=document.getElementById("ai-nokey"),st=document.getElementById("ai-status");
  if(S.hasGemini){ nk?.classList.add("hidden"); if(st){st.textContent="● pronto";st.style.color="var(--ok)";} }
  else{ nk?.classList.remove("hidden"); if(st){st.textContent="● sem chave";st.style.color="var(--war)";} }
}

// ── AUTH ──────────────────────────────────────────
let S_pending_email = "";

function switchTab(t){
  document.getElementById("form-in").classList.toggle("hidden",t!=="in");
  document.getElementById("form-reg").classList.toggle("hidden",t!=="reg");
  document.getElementById("form-verify")?.classList.add("hidden");
  document.querySelectorAll(".lgtab").forEach((b,i)=>b.classList.toggle("active",(i===0&&t==="in")||(i===1&&t==="reg")));
  // Update header text
  const head=document.getElementById("lg-head");
  const demo=document.getElementById("lg-demo");
  const googleBtn=document.querySelector(".lg-google");
  const divider=document.querySelector(".lg-divider");
  if(t==="in"){
    if(head){head.querySelector("h2").textContent="Bem-vindo de volta";head.querySelector("p").textContent="Entra na tua conta para continuar";}
    demo?.classList.remove("hidden");
    googleBtn?.classList.remove("hidden");
    divider?.classList.remove("hidden");
  } else {
    if(head){head.querySelector("h2").textContent="Criar conta";head.querySelector("p").textContent="Junta-te ao TaskFlow hoje";}
    demo?.classList.add("hidden");
    googleBtn?.classList.remove("hidden");
    divider?.classList.remove("hidden");
  }
}
function fill(e,p){
  document.getElementById("li-email").value=e;
  document.getElementById("li-pass").value=p;
  // Make sure we're on login tab
  switchTab("in");
}
function toggleEye(id,btn){ const i=document.getElementById(id); i.type=i.type==="password"?"text":"password"; btn.style.color=i.type==="text"?"var(--a3)":"var(--t3)"; }

async function doLogin(ev){
  ev.preventDefault();
  const btn=ev.target.querySelector(".lg-cta,.auth-cta"); if(btn){btn.disabled=true; btn.textContent="A entrar...";}
  const email = document.getElementById("li-email").value;
  const password = document.getElementById("li-pass").value;
  const r=await api("/api/auth/login","POST",{email, password});
  if(r.error){ showErr("li-err",r.error); if(btn){btn.disabled=false; btn.textContent="Entrar";} return; }
  S.user=r.user;
  localStorage.setItem("tf_u", JSON.stringify(r.user));
  // Guardar credenciais para auto-relogin quando a sessão expirar
  localStorage.setItem("tf_creds", JSON.stringify({email, password}));
  await loadAll(); showApp(); toast(`Bem-vindo, ${S.user.name}! 👋`,"s");
}

async function sendVerifyCode(ev){
  ev.preventDefault();
  const btn=ev.target.querySelector(".lg-cta,.auth-cta");
  if(btn){btn.disabled=true; btn.textContent="A enviar...";}
  const name=document.getElementById("rg-name").value;
  const email=document.getElementById("rg-email").value;
  const pw=document.getElementById("rg-pass").value;
  const r=await api("/api/auth/register/send-code","POST",{name,email,password:pw});
  if(r.error){ showErr("rg-err",r.error); if(btn){btn.disabled=false; btn.textContent="Enviar código de verificação";} return; }
  S_pending_email=email;
  document.getElementById("verify-email-lbl").textContent=email;
  document.getElementById("form-reg").classList.add("hidden");
  document.getElementById("form-verify").classList.remove("hidden");
  document.getElementById("verify-code")?.focus();
  toast("Código enviado para "+email+" 📧","s");
  if(btn){btn.disabled=false; btn.textContent="Enviar código de verificação";}
}

async function doVerifyCode(){
  const code=document.getElementById("verify-code").value.trim();
  if(code.length!==6){ showErr("verify-err","Insere o código de 6 dígitos."); return; }
  const r=await api("/api/auth/register/verify","POST",{email:S_pending_email,code});
  if(r.error){ showErr("verify-err",r.error); return; }
  S.user=r.user; localStorage.setItem("tf_u",JSON.stringify(r.user));
  await loadAll(); showApp(); toast(`Conta criada! Bem-vindo, ${S.user.name}! 🎉`,"s");
  // Mostrar onboarding para conta nova
  showOnboarding();
}

async function resendCode(){
  if(!S_pending_email){ switchTab("reg"); return; }
  const name=document.getElementById("rg-name")?.value||"Utilizador";
  const pw=document.getElementById("rg-pass")?.value||"";
  const r=await api("/api/auth/register/send-code","POST",{name,email:S_pending_email,password:pw});
  if(r.ok) toast("Novo código enviado! 📧","s");
  else toast("Erro ao reenviar.","e");
}

async function doLogout(){
  await api("/api/auth/logout","POST");
  localStorage.removeItem("tf_u"); S.user=null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  toast("Sessão terminada","i");
}

function showErr(id,msg){ const e=document.getElementById(id); e.textContent="⚠ "+msg; e.classList.remove("hidden"); setTimeout(()=>e.classList.add("hidden"),4500); }

function showApp(){
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  document.getElementById("v-dashboard").classList.remove("hidden");
  const aiPanel = document.getElementById("ai-panel");
  if(aiPanel) aiPanel.classList.add("closed");
  // Restaurar estado da sidebar
  if(localStorage.getItem("tf_sb_closed")==="1" && window.innerWidth > 768){
    document.getElementById("sidebar")?.classList.add("closed");
  }
  setTimeout(updateMenuBtn, 100);
  S.view = "dashboard";
  updateSB();
  renderSBProjs();
  renderDash();
  document.querySelectorAll(".sb-a").forEach(a=>a.classList.remove("active"));
  document.querySelector(".sb-a[data-v='dashboard']")?.classList.add("active");
  setTimeout(setupGlobalSearch, 400);
  setTimeout(()=>checkNotifs(), 1000);
}

// ─── ONBOARDING ───────────────────────────────
const OB = { type: null, size: null, sector: null, current_tool: null, goal: null };

function showOnboarding(){
  OB.type=null; OB.size=null; OB.sector=null; OB.current_tool=null; OB.goal=null;
  ["ob-step1","ob-step2","ob-step3","ob-step4"].forEach((id,i)=>{
    const el=document.getElementById(id);
    if(el){ i===0 ? el.classList.remove("hidden") : el.classList.add("hidden"); }
  });
  document.getElementById("ob-progress").style.width = "25%";
  document.getElementById("ob-type-opts").querySelectorAll(".ob-opt").forEach(o=>o.classList.remove("selected"));
  document.getElementById("mo-onboard").classList.remove("hidden");
}

function obSelect(field, el){
  el.parentElement.querySelectorAll(".ob-opt").forEach(o=>o.classList.remove("selected"));
  el.classList.add("selected");
  OB[field] = el.dataset.val;
}

function obRenderStep2(){
  const el = document.getElementById("ob-step2");
  if(OB.type === "pessoal"){
    el.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">🏠</div>
      <h2 style="font-size:19px;font-weight:800;margin-bottom:6px">Vais usar sozinho ou com outros?</h2>
      <p style="color:var(--t3);font-size:13px;margin-bottom:24px">Ajuda-nos a personalizar a experiência.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="ob-opt" data-val="solo" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">🧑</div>
          <div style="font-weight:700;font-size:13px">Só eu</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Uso individual</div>
        </div>
        <div class="ob-opt" data-val="familia" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">👨‍👩‍👧</div>
          <div style="font-weight:700;font-size:13px">Com a família</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Partilhar com familiares</div>
        </div>
        <div class="ob-opt" data-val="amigos" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">👯</div>
          <div style="font-weight:700;font-size:13px">Com amigos</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Projetos a dois ou mais</div>
        </div>
        <div class="ob-opt" data-val="misto" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">🌐</div>
          <div style="font-weight:700;font-size:13px">Misto</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Pessoal e social</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-ghost" style="flex:1" onclick="obBack(2)">← Voltar</button>
        <button class="btn-cta" style="flex:2" onclick="obNext(2)">Continuar →</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">🏢</div>
      <h2 style="font-size:19px;font-weight:800;margin-bottom:6px">Qual o tamanho da equipa?</h2>
      <p style="color:var(--t3);font-size:13px;margin-bottom:24px">Ajuda-nos a configurar o melhor para ti.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="ob-opt" data-val="pequena" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">👫</div>
          <div style="font-weight:700;font-size:13px">2–5 pessoas</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Equipa pequena</div>
        </div>
        <div class="ob-opt" data-val="media" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">👥</div>
          <div style="font-weight:700;font-size:13px">6–20 pessoas</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Equipa média</div>
        </div>
        <div class="ob-opt" data-val="grande" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">🏗️</div>
          <div style="font-weight:700;font-size:13px">20–100 pessoas</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Grande empresa</div>
        </div>
        <div class="ob-opt" data-val="enterprise" onclick="obSelect('size',this)">
          <div style="font-size:26px;margin-bottom:8px">🌍</div>
          <div style="font-weight:700;font-size:13px">100+ pessoas</div>
          <div style="font-size:11px;color:var(--t3);margin-top:3px">Enterprise</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-ghost" style="flex:1" onclick="obBack(2)">← Voltar</button>
        <button class="btn-cta" style="flex:2" onclick="obNext(2)">Continuar →</button>
      </div>`;
  }
}

function obRenderStep3(){
  const el = document.getElementById("ob-step3");
  if(OB.type === "pessoal"){
    el.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">🎯</div>
      <h2 style="font-size:19px;font-weight:800;margin-bottom:6px">O que queres organizar?</h2>
      <p style="color:var(--t3);font-size:13px;margin-bottom:20px">Opcional — salta se quiseres.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="ob-opt ob-sm" data-val="tarefas do dia a dia" onclick="obSelect('goal',this)">📋 Tarefas do dia a dia</div>
        <div class="ob-opt ob-sm" data-val="habitos e rotinas" onclick="obSelect('goal',this)">🔄 Hábitos e rotinas</div>
        <div class="ob-opt ob-sm" data-val="projetos pessoais" onclick="obSelect('goal',this)">💡 Projetos pessoais</div>
        <div class="ob-opt ob-sm" data-val="financas e compras" onclick="obSelect('goal',this)">💰 Finanças e compras</div>
        <div class="ob-opt ob-sm" data-val="viagens e eventos" onclick="obSelect('goal',this)">✈️ Viagens e eventos</div>
        <div class="ob-opt ob-sm" data-val="saude e bem-estar" onclick="obSelect('goal',this)">🏃 Saúde e bem-estar</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-ghost" style="flex:1" onclick="obBack(3)">← Voltar</button>
        <button class="btn-cta" style="flex:2" onclick="obFinish()">Começar! 🚀</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">🏭</div>
      <h2 style="font-size:19px;font-weight:800;margin-bottom:6px">Qual é o setor da empresa?</h2>
      <p style="color:var(--t3);font-size:13px;margin-bottom:20px">Ajuda-nos a sugerir a melhor configuração.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="ob-opt ob-sm" data-val="tecnologia" onclick="obSelect('sector',this)">💻 Tecnologia & Software</div>
        <div class="ob-opt ob-sm" data-val="design" onclick="obSelect('sector',this)">🎨 Design & Criativo</div>
        <div class="ob-opt ob-sm" data-val="marketing" onclick="obSelect('sector',this)">📊 Marketing & Vendas</div>
        <div class="ob-opt ob-sm" data-val="construcao" onclick="obSelect('sector',this)">🏗️ Construção & Engenharia</div>
        <div class="ob-opt ob-sm" data-val="saude" onclick="obSelect('sector',this)">🏥 Saúde & Bem-estar</div>
        <div class="ob-opt ob-sm" data-val="educacao" onclick="obSelect('sector',this)">📚 Educação & Formação</div>
        <div class="ob-opt ob-sm" data-val="comercio" onclick="obSelect('sector',this)">🛒 Comércio & Retalho</div>
        <div class="ob-opt ob-sm" data-val="outro" onclick="obSelect('sector',this)">⚙️ Outro setor</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-ghost" style="flex:1" onclick="obBack(3)">← Voltar</button>
        <button class="btn-cta" style="flex:2" onclick="obNext(3)">Continuar →</button>
      </div>`;
  }
}

function obRenderStep4(){
  const el = document.getElementById("ob-step4");
  el.innerHTML = `
    <div style="font-size:28px;margin-bottom:8px">🎯</div>
    <h2 style="font-size:19px;font-weight:800;margin-bottom:6px">Como gerem o trabalho hoje?</h2>
    <p style="color:var(--t3);font-size:13px;margin-bottom:16px">Ajuda-nos a adaptar o TaskFlow à vossa forma de trabalhar.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div class="ob-opt ob-sm" data-val="excel_sheets" onclick="obSelect('current_tool',this)">📋 Excel / Google Sheets</div>
      <div class="ob-opt ob-sm" data-val="whatsapp_email" onclick="obSelect('current_tool',this)">💬 WhatsApp / Email</div>
      <div class="ob-opt ob-sm" data-val="outro_app" onclick="obSelect('current_tool',this)">📱 Outro app de tarefas</div>
      <div class="ob-opt ob-sm" data-val="nenhum" onclick="obSelect('current_tool',this)">🆕 Não usamos nada ainda</div>
    </div>
    <div style="background:var(--bg3);border-radius:10px;padding:12px 14px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--t2)">O que é mais importante? <span style="color:var(--t3);font-weight:400">(opcional)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="ob-opt ob-sm" data-val="velocidade" onclick="obSelect('goal',this)">⚡ Velocidade de entrega</div>
        <div class="ob-opt ob-sm" data-val="colaboracao" onclick="obSelect('goal',this)">🤝 Colaboração</div>
        <div class="ob-opt ob-sm" data-val="relatorios" onclick="obSelect('goal',this)">📊 Relatórios para gestão</div>
        <div class="ob-opt ob-sm" data-val="prazos" onclick="obSelect('goal',this)">🎯 Cumprir prazos</div>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn-ghost" style="flex:1" onclick="obBack(4)">← Voltar</button>
      <button class="btn-cta" style="flex:2" onclick="obFinish()">Começar! 🚀</button>
    </div>`;
}

function obNext(step){
  if(step===1){
    if(!OB.type){ return; }
    obRenderStep2();
    document.getElementById("ob-step1").classList.add("hidden");
    document.getElementById("ob-step2").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = OB.type==="empresarial" ? "25%" : "33%";
  } else if(step===2){
    if(!OB.size){ return; }
    obRenderStep3();
    document.getElementById("ob-step2").classList.add("hidden");
    document.getElementById("ob-step3").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = OB.type==="empresarial" ? "50%" : "66%";
  } else if(step===3){
    obRenderStep4();
    document.getElementById("ob-step3").classList.add("hidden");
    document.getElementById("ob-step4").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = "75%";
  }
}

function obBack(step){
  if(step===2){
    document.getElementById("ob-step2").classList.add("hidden");
    document.getElementById("ob-step1").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = "25%";
    OB.size=null;
  } else if(step===3){
    document.getElementById("ob-step3").classList.add("hidden");
    document.getElementById("ob-step2").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = OB.type==="empresarial" ? "25%" : "33%";
    OB.sector=null; OB.goal=null;
  } else if(step===4){
    document.getElementById("ob-step4").classList.add("hidden");
    document.getElementById("ob-step3").classList.remove("hidden");
    document.getElementById("ob-progress").style.width = "50%";
    OB.current_tool=null; OB.goal=null;
  }
}

async function obFinish(){
  try {
    await api("/api/auth/onboarding","POST",{
      use_type: OB.type, team_size: OB.size,
      sector: OB.sector||"", current_tool: OB.current_tool||"", goal: OB.goal||""
    });
  } catch(e){}
  document.getElementById("ob-progress").style.width = "100%";
  setTimeout(()=>{
    document.getElementById("mo-onboard").classList.add("hidden");
    if(OB.type==="empresarial"){
      toast("💡 Convida a tua equipa em Definições → Equipa!","i");
    } else if(OB.size==="familia"){
      toast("🏠 Convida a família em Definições → Equipa!","i");
    } else if(OB.size==="amigos"){
      toast("👯 Convida os amigos em Definições → Equipa!","i");
    } else {
      toast("Tudo pronto! Bom trabalho 🚀","s");
    }
    // Iniciar tour para novos utilizadores
    setTimeout(()=>startTour(), 800);
  }, 400);
}

// ─── CONVITES ─────────────────────────────────
function openInviteModal(){
  // Criar modal de convite dinamicamente
  const existing = document.getElementById("mo-send-invite");
  if(existing) existing.remove();
  const mo = document.createElement("div");
  mo.className = "mo";
  mo.id = "mo-send-invite";
  mo.innerHTML = `
  <div class="modal" style="max-width:440px;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="background:linear-gradient(135deg,var(--a),#a78bfa);padding:24px 28px 20px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">Convidar membro</div>
          <div style="font-size:12.5px;color:rgba(255,255,255,.7);margin-top:2px">Envia um convite por email</div>
        </div>
        <button onclick="document.getElementById('mo-send-invite').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
    </div>
    <div style="padding:24px 28px">
      <div class="fg" style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:var(--t2);display:block;margin-bottom:6px">📧 Email do convidado</label>
        <input class="fi" id="mi-email" type="email" placeholder="email@exemplo.com" autofocus style="width:100%"/>
      </div>
      <div class="fg" style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:600;color:var(--t2);display:block;margin-bottom:6px">👤 Cargo</label>
        <select class="fi" id="mi-role" style="width:100%">
          <option value="member">👤 Member</option>
          <option value="manager">💼 Manager</option>
          <option value="viewer">👁️ Viewer</option>
        </select>
      </div>
      <div id="mi-link-box" style="display:none;background:var(--bg3);border-radius:9px;padding:12px;margin-bottom:16px">
        <div style="font-size:11px;color:var(--t3);margin-bottom:6px;font-weight:600">🔗 Link de convite gerado:</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="mi-link" class="fi" readonly style="flex:1;font-size:11px;padding:7px 10px"/>
          <button onclick="navigator.clipboard.writeText(document.getElementById('mi-link').value);toast('Link copiado!','s')" class="btn-ghost" style="padding:7px 12px;font-size:12px;white-space:nowrap">📋 Copiar</button>
        </div>
      </div>
      <div id="mi-err" style="color:var(--err);font-size:12px;margin-bottom:10px;display:none"></div>
      <button class="btn-cta" style="width:100%;padding:11px" id="mi-btn" onclick="doSendInvite()">📧 Enviar convite</button>
    </div>
  </div>`;
  mo.onclick = (e)=>{ if(e.target===mo) mo.remove(); };
  document.body.appendChild(mo);
  setTimeout(()=>document.getElementById("mi-email")?.focus(), 100);
}

async function doSendInvite(){
  const email = document.getElementById("mi-email")?.value?.trim();
  const role  = document.getElementById("mi-role")?.value || "member";
  const errEl = document.getElementById("mi-err");
  if(!email){ errEl.textContent="Insere um email válido."; errEl.style.display="block"; return; }
  errEl.style.display="none";
  const btn = document.getElementById("mi-btn");
  if(btn){ btn.disabled=true; btn.textContent="A enviar..."; }
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(()=>ctrl.abort(), 8000);
    const resp = await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role}),signal:ctrl.signal});
    clearTimeout(tid);
    const r = await resp.json();
    if(btn){ btn.disabled=false; btn.textContent="📧 Enviar convite"; }
    if(r.error){ errEl.textContent=r.error; errEl.style.display="block"; return; }
    // Mostrar link
    const linkBox = document.getElementById("mi-link-box");
    const linkInp = document.getElementById("mi-link");
    if(linkBox && linkInp && r.link){
      linkInp.value = r.link;
      linkBox.style.display="block";
    }
    toast(`✅ Convite enviado para ${email}!`,"s");
  } catch(e){
    if(btn){ btn.disabled=false; btn.textContent="📧 Enviar convite"; }
    errEl.textContent="Erro de ligação. Tenta novamente.";
    errEl.style.display="block";
  }
}

async function sendInvite(){
  const email = document.getElementById("inv-send-email")?.value?.trim();
  const role  = document.getElementById("inv-send-role")?.value || "member";
  if(!email){ toast("Insere um email","w"); return; }
  const btn = document.getElementById("inv-send-btn");
  if(btn){ btn.disabled=true; btn.textContent="A enviar..."; }

  let r;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(()=>ctrl.abort(), 6000);
    const resp = await fetch("/api/invite", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({email, role}),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    r = await resp.json();
  } catch(e) {
    if(btn){ btn.disabled=false; btn.textContent="📧 Enviar convite"; }
    toast("Erro ao contactar o servidor. Tenta novamente.","e");
    return;
  }

  if(btn){ btn.disabled=false; btn.textContent="📧 Enviar convite"; }
  if(r.error){ toast(r.error,"e"); return; }

  toast(`Convite criado para ${email}! 📧`,"s");
  if(document.getElementById("inv-send-email")) document.getElementById("inv-send-email").value="";

  // Mostrar link para copiar
  if(r.invite_url){
    const old = document.getElementById("inv-link-box");
    if(old) old.remove();
    const box = document.createElement("div");
    box.id = "inv-link-box";
    box.style.cssText="margin-top:16px;background:var(--bg3);border:1px solid var(--a);border-radius:10px;padding:14px 16px";
    box.innerHTML=`<div style="font-size:11.5px;color:var(--t3);margin-bottom:8px">🔗 Partilha este link com <strong style="color:var(--t)">${email}</strong>:</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input readonly value="${r.invite_url}" id="inv-link-input" style="flex:1;background:var(--bg2);border:1px solid var(--b1);border-radius:7px;padding:7px 10px;font-size:11px;color:var(--t);outline:none;min-width:0" onclick="this.select()"/>
        <button onclick="navigator.clipboard.writeText(document.getElementById('inv-link-input').value);toast('Link copiado! 📋','s')" style="padding:7px 14px;background:var(--a);color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0">Copiar</button>
      </div>`;
    // Inserir dentro do bloco de definições, após o botão
    const btnEl = document.getElementById("inv-send-btn");
    if(btnEl) btnEl.closest("div").parentElement.appendChild(box);
    else document.body.appendChild(box);
  }
}

// Detetar token de convite na URL e mostrar modal
async function checkInviteToken(){
  const params = new URLSearchParams(window.location.search);
  const token  = params.get("token");
  if(!token) return;
  const r = await api(`/api/invite/check?token=${token}`);
  if(r.error){ toast(r.error,"e"); return; }
  // Pré-preencher e mostrar modal
  document.getElementById("inv-email").value  = r.email;
  document.getElementById("inv-desc").textContent = `${r.invited_by} convidou-te para a equipa como ${r.email}.`;
  document.getElementById("inv-err").style.display = "none";
  document.getElementById("mo-invite").classList.remove("hidden");
  // Guardar token
  document.getElementById("mo-invite").dataset.token = token;
  // Esconder login
  document.getElementById("login-screen").classList.add("hidden");
}

async function acceptInvite(){
  const token = document.getElementById("mo-invite").dataset.token;
  const name  = document.getElementById("inv-name").value.trim();
  const pw    = document.getElementById("inv-pass").value;
  const errEl = document.getElementById("inv-err");
  if(!name || pw.length<6){
    errEl.textContent = "⚠ Preenche o nome e uma password com 6+ caracteres.";
    errEl.style.display="block"; return;
  }
  const r = await api("/api/invite/accept","POST",{token, name, password: pw});
  if(r.error){ errEl.textContent="⚠ "+r.error; errEl.style.display="block"; return; }
  S.user = r.user; localStorage.setItem("tf_u", JSON.stringify(r.user));
  document.getElementById("mo-invite").classList.add("hidden");
  // Limpar token da URL
  window.history.replaceState({}, "", "/");
  await loadAll(); showApp();
  toast(`Bem-vindo à equipa, ${r.user.name}! 🎉`,"s");
  showOnboarding();
}

function updateSB(){
  const u=S.user; if(!u)return;
  const r=ROLES[u.role];
  const av=document.getElementById("sb-av"); av.textContent=u.avatar; av.style.background=u.color;
  document.getElementById("sb-name").textContent=u.name;
  document.getElementById("sb-role").textContent=(r?.i||"")+" "+(r?.l||"");
  document.getElementById("b-ip").textContent=S.tasks.filter(t=>t.status==="Em Progresso").length;
  renderSBProjs();
}

function renderSBProjs(){
  const can=S.user?.role==="admin"||S.user?.role==="manager";
  const el=document.getElementById("sb-projs"); if(!el)return;
  const active=S.projects.filter(p=>p.status!=="archived");
  const archived=S.projects.filter(p=>p.status==="archived");
  el.innerHTML=
    active.map(p=>`<div class="sb-proj-row" style="position:relative">
      <div class="sb-pdot" style="background:${p.color};cursor:pointer" onclick="filterProj('${p.id}')"></div>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;cursor:pointer" onclick="filterProj('${p.id}')">${p.name}</span>
      <span style="font-size:10px;background:var(--bg4);padding:1px 6px;border-radius:9px;color:var(--t3)">${S.tasks.filter(t=>t.project===p.id&&t.status!=="Concluído").length}</span>
      ${can?`<span onclick="openProjectSettings('${p.id}')" class="proj-cfg-btn" title="Definições do projeto">⚙</span>`:""}
    </div>`).join("")+
    (archived.length?`<div style="font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1.5px;padding:10px 8px 4px">📦 Arquivados</div>`+
      archived.map(p=>`<div class="sb-proj-row" style="opacity:.5">
        <div class="sb-pdot" style="background:${p.color}"></div>
        <span style="flex:1;text-decoration:line-through;overflow:hidden;text-overflow:ellipsis">${p.name}</span>
        ${can?`<span onclick="archiveProject('${p.id}')" style="cursor:pointer;font-size:10px;color:var(--a3);padding:2px 5px" title="Reativar">↩</span>`:""}
      </div>`).join(""):"")
    +(can?`<div class="sb-proj-row" onclick="openNewProj()" style="color:var(--t3)"><span style="font-size:14px">+</span><span>Novo projeto</span></div>`:"");
  el.querySelectorAll(".proj-cfg-btn").forEach(btn=>{
    const row=btn.closest(".sb-proj-row");
    row.addEventListener("mouseenter",()=>btn.style.opacity="1");
    row.addEventListener("mouseleave",()=>btn.style.opacity="0");
  });
}

function filterProj(pid){ S.search="proj:"+pid; nav("kanban"); }

// ── NAV ───────────────────────────────────────────
const VTITLES={dashboard:"Dashboard",kanban:"Kanban",calendar:"Calendário",notes:"Notas",team:"Equipa",reports:"Relatórios",settings:"Definições",chat:"Chat"};

function nav(v){
  S.view=v;
  // Parar polling do chat se sair
  if(v!=="chat" && chatPollInterval){ clearInterval(chatPollInterval); chatPollInterval=null; }
  document.querySelectorAll(".sb-a[data-v]").forEach(el=>el.classList.toggle("active",el.dataset.v===v));
  document.querySelectorAll(".view").forEach(el=>el.classList.add("hidden"));
  const vEl = document.getElementById("v-"+v);
  if(vEl){
    vEl.classList.remove("hidden");
    vEl.classList.remove("view-enter");
    void vEl.offsetWidth; // reflow para reiniciar animação
    vEl.classList.add("view-enter");
  }
  const titleEl = document.getElementById("pg-title");
  if(titleEl) titleEl.textContent=VTITLES[v]||v;
  // Atualizar título da aba do browser
  document.title = `${VTITLES[v]||v} — TaskFlow`;
  // Scroll to top ao mudar de vista
  const mainContent = document.getElementById("main") || document.querySelector(".main");
  if(mainContent) mainContent.scrollTop = 0;
  render(v);
}

function render(v){
  if(v==="dashboard")renderDash();
  else if(v==="kanban")renderKanban();
  else if(v==="calendar")renderCal();
  else if(v==="notes")renderNotes();
  else if(v==="team")renderTeam();
  else if(v==="reports")renderReports();
  else if(v==="chat")renderChat();
  else if(v==="settings")renderSettings();
}

function toggleAI(){
  document.getElementById("ai-panel").classList.toggle("closed");
  const pill = document.getElementById("ai-pill");
  if(pill) pill.textContent=document.getElementById("ai-panel").classList.contains("closed")?"OFF":"ON";
}

function clearAIChat(){
  S.aiHistory=[];
  document.getElementById("ai-msgs").innerHTML=`
  <div class="ai-msg bot">
    <div class="ai-av">✦</div>
    <div class="ai-bubble">Conversa limpa! Como posso ajudar? ✨</div>
  </div>`;
  toast("Conversa limpa","i");
}
let _searchTimer = null;
function onSearch(v){
  S.search = v.toLowerCase();
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(()=>render(S.view), 200);
}
function clearSearch(){ S.search=""; document.getElementById("srch").value=""; render(S.view); }
function focusSearch(){ document.getElementById("srch").focus(); }
function filt(){ if(!S.search)return S.tasks; if(S.search.startsWith("proj:"))return S.tasks.filter(t=>t.project===S.search.split(":")[1]); return S.tasks.filter(t=>t.title.toLowerCase().includes(S.search)||t.description?.toLowerCase().includes(S.search)); }

// ─────────────────────────────────────────────────
//  DASHBOARD — Stats grandes + Gráfico semanal + Projetos + Atividade
// ─────────────────────────────────────────────────
function renderDash(){
  const tasks=S.tasks;
  const total=tasks.length, done=tasks.filter(t=>t.status==="Concluído").length;
  const inp=tasks.filter(t=>t.status==="Em Progresso").length;
  const overdue=tasks.filter(t=>t.deadline&&t.deadline<tday()&&t.status!=="Concluído").length;
  const rate=Math.round(done/(total||1)*100);
  document.getElementById("b-ip").textContent=inp;

  const today=new Date();
  const wlabels=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const wb=Array.from({length:7},(_,i)=>{
    const d=new Date(today); d.setDate(today.getDate()-today.getDay()+i+1);
    const dk=d.toISOString().slice(0,10);
    return tasks.filter(t=>t.created===dk||t.deadline===dk).length;
  });

  const activeProjects = S.projects.filter(p=>p.status!=="archived");
  const projR=activeProjects.map(p=>{
    const pt=tasks.filter(t=>t.project===p.id), d=pt.filter(t=>t.status==="Concluído").length;
    const pct=pt.length?Math.round(d/pt.length*100):0;
    return`<div class="proj-r" onclick="filterProj('${p.id}')" style="cursor:pointer">
      <div class="proj-ico" style="background:${p.color}18">${p.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="proj-rname">${p.name}</div>
        <div style="margin-top:5px"><div class="prog"><div class="prog-fill" style="width:${pct}%;background:${p.color}"></div></div></div>
        <div class="proj-rsub">${d}/${pt.length} tarefas · ${pct}%</div>
      </div>
      <div class="proj-pct" style="color:${p.color}">${pct}%</div>
    </div>`;
  }).join("");

  const actH=S.activity.slice(0,8).map(a=>{
    const u=S.users.find(x=>x.id===a.user);
    return`<div class="act-r">
      <div class="av sm" style="background:${u?.color||"#666"}">${u?.avatar||"?"}</div>
      <div style="flex:1;min-width:0">
        <div class="act-txt"><span class="hn">${u?.name?.split(" ")[0]||"?"}</span> <span style="color:var(--t2)">${a.action}</span> <span class="ht">"${a.target}"</span></div>
        <div class="act-time">${a.time} atrás</div>
      </div>
      <div class="act-ico">${a.icon}</div>
    </div>`;
  }).join("");

  const pinnedTasks = tasks.filter(t=>t.pinned&&t.status!=="Concluído").slice(0,5);
  const overdueTasks = tasks.filter(t=>t.deadline&&t.deadline<tday()&&t.status!=="Concluído").slice(0,5);

  // Widget definitions
  // ── Streak de produtividade ──────────────────
  const streakData = calcStreak();

  // ── Widget de clima (carregado async) ────────
  const weatherHtml = S.weatherCache
    ? buildWeatherHtml(S.weatherCache)
    : `<div class="card" style="margin-bottom:4px" id="weather-widget">
        <div class="shd"><div class="stitle">🌤️ Clima</div></div>
        <div style="padding:12px;text-align:center">
          <div class="skel" style="height:60px;border-radius:8px;margin-bottom:8px"></div>
          <div style="font-size:12px;color:var(--t3)">A obter localização...</div>
        </div>
      </div>`;

  const WIDGETS = {
    stats: {
      label:"📊 Estatísticas", html:`
      <div class="stats-row">
        ${[
          {l:"Total de Tarefas", v:total, i:"📋", b:S.projects.length+" projetos", bc:"badge-neu", s:"s1", c:"#6366f1"},
          {l:"Concluídas",       v:done,  i:"✅", b:rate+"%",                      bc:"badge-ok",  s:"s2", c:"#22c55e"},
          {l:"Em Progresso",    v:inp,   i:"⚡", b:"ativas",                       bc:"badge-neu", s:"s3", c:"#f59e0b"},
          {l:"Em Atraso",       v:overdue,i:"🚨",b:overdue>0?"atenção":"em dia",  bc:overdue>0?"badge-err":"badge-ok", s:"s4", c:overdue>0?"#ef4444":"#22c55e"},
        ].map(s=>`<div class="stat-card ${s.s}">
          <div class="stat-top">
            <div style="width:38px;height:38px;border-radius:10px;background:${s.c}18;display:flex;align-items:center;justify-content:center;font-size:18px">${s.i}</div>
            <span class="stat-badge ${s.bc}">${s.b}</span>
          </div>
          <div class="stat-num" style="color:${s.c}">${s.v}</div>
          <div class="stat-lbl">${s.l}</div>
        </div>`).join("")}
      </div>`
    },
    charts: {
      label:"📈 Gráficos", html:`
      <div style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;margin-bottom:4px">
        <div class="card">
          <div class="shd" style="margin-bottom:16px">
            <div class="stitle">Progresso Semanal</div>
            <div style="font-size:11px;color:var(--t3);font-family:var(--mono)">${new Date().toLocaleDateString("pt-PT",{month:"long",year:"numeric"})}</div>
          </div>
          <div style="position:relative;height:160px;overflow:hidden"><canvas id="chart-weekly"></canvas></div>
        </div>
        <div class="card">
          <div class="shd" style="margin-bottom:16px"><div class="stitle">Por Estado</div></div>
          <div style="position:relative;height:160px;overflow:hidden"><canvas id="chart-status"></canvas></div>
        </div>
      </div>`
    },
    streak: {
      label:"🔥 Streak", html:`
      <div class="card" style="margin-bottom:4px">
        <div class="shd" style="margin-bottom:14px">
          <div class="stitle">🔥 Produtividade Pessoal</div>
          <span style="font-size:11px;color:var(--t3)">Últimos 30 dias</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="text-align:center;padding:12px;background:var(--bg3);border-radius:10px">
            <div style="font-size:32px;font-weight:800;color:${streakData.current>0?"#f59e0b":"var(--t3)"}">${streakData.current}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:3px">🔥 Streak atual</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg3);border-radius:10px">
            <div style="font-size:32px;font-weight:800;color:var(--a)">${streakData.best}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:3px">⭐ Melhor streak</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg3);border-radius:10px">
            <div style="font-size:32px;font-weight:800;color:var(--ok)">${streakData.totalDone}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:3px">✅ Total concluídas</div>
          </div>
        </div>
        <div style="margin-bottom:8px;font-size:11.5px;color:var(--t3)">Atividade nos últimos 30 dias</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${streakData.heatmap.map(d=>`
            <div title="${d.date}: ${d.count} tarefa${d.count!==1?"s":""}" style="width:14px;height:14px;border-radius:3px;background:${d.count===0?"var(--bg3)":d.count===1?"rgba(99,102,241,.35)":d.count<=3?"rgba(99,102,241,.6)":"rgba(99,102,241,.9)"};cursor:default"></div>
          `).join("")}
        </div>
        ${streakData.current>0?`<div style="margin-top:12px;font-size:12.5px;color:#f59e0b;font-weight:600">🔥 Estás em chamas! ${streakData.current} dia${streakData.current>1?"s":""} consecutivo${streakData.current>1?"s":""} com tarefas concluídas!</div>`
        :`<div style="margin-top:12px;font-size:12.5px;color:var(--t3)">Conclui uma tarefa hoje para iniciar o teu streak! 💪</div>`}
      </div>`
    },
    weather: {
      label:"🌤️ Clima", html: weatherHtml
    },
    projects: {
      label:"📁 Projetos", html:`
      <div class="card" style="margin-bottom:4px">
        <div class="shd"><div class="stitle">Projetos</div>${S.user?.role==="admin"||S.user?.role==="manager"?`<button class="btn-ghost" style="padding:5px 12px;font-size:12px" onclick="openNewProj()">+ Novo</button>`:""}</div>
        ${projR||`<div class="empty-st" style="padding:16px"><div class="empty-t">Sem projetos ativos</div></div>`}
      </div>`
    },
    activity: {
      label:"🕐 Atividade", html:`
      <div class="card" style="margin-bottom:4px">
        <div class="shd"><div class="stitle">Atividade da Equipa</div></div>
        ${actH||`<div class="empty-st" style="padding:20px"><div class="empty-i" style="font-size:24px">📋</div><div class="empty-t">Sem atividade recente</div></div>`}
      </div>`
    },
    pinned: {
      label:"📌 Tarefas Fixadas", html: pinnedTasks.length ? `
      <div class="card" style="margin-bottom:4px">
        <div class="shd"><div class="stitle">📌 Tarefas Fixadas</div></div>
        ${pinnedTasks.map(t=>{
          const u=S.users.find(x=>x.id===t.assignee);
          const dl=dleft(t.deadline);
          return`<div class="proj-r" onclick="openDetail('${t.id}')" style="cursor:pointer">
            <div style="width:3px;height:36px;border-radius:2px;background:${PRIO[t.priority]?.c};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div class="proj-rname">${t.title}</div>
              <div class="proj-rsub">${PRIO[t.priority]?.l}${t.deadline?` · ${dl===0?"Hoje":dl<0?Math.abs(dl)+"d atraso":dl+"d"}`:""}</div>
            </div>
            ${u?`<div class="av sm" style="background:${u.color}">${u.avatar}</div>`:""}
          </div>`;
        }).join("")}
      </div>` : ""
    },
    overdue: {
      label:"🚨 Em Atraso", html: overdueTasks.length ? `
      <div class="card" style="margin-bottom:4px;border-color:rgba(239,68,68,.3)">
        <div class="shd"><div class="stitle" style="color:var(--err)">🚨 Em Atraso</div><span style="font-size:11px;color:var(--err)">${overdueTasks.length} tarefa${overdueTasks.length>1?"s":""}</span></div>
        ${overdueTasks.map(t=>{
          const dl=dleft(t.deadline);
          const u=S.users.find(x=>x.id===t.assignee);
          return`<div class="proj-r" onclick="openDetail('${t.id}')" style="cursor:pointer">
            <div style="width:3px;height:36px;border-radius:2px;background:var(--err);flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div class="proj-rname">${t.title}</div>
              <div class="proj-rsub" style="color:var(--err)">${Math.abs(dl)} dias em atraso</div>
            </div>
            ${u?`<div class="av sm" style="background:${u.color}">${u.avatar}</div>`:""}
          </div>`;
        }).join("")}
      </div>` : ""
    },
  };

  const w = S.dashWidgets;
  let html = `
  <!-- Checklist de setup -->
  ${buildSetupWidget()}
  <!-- Barra de personalização — discreta, só ícone -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <div style="font-size:20px;font-weight:800;color:var(--t);letter-spacing:-.3px">Olá, ${S.user?.name?.split(" ")[0]} 👋</div>
      <div style="font-size:12.5px;color:var(--t3);margin-top:2px">${new Date().toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"})}</div>
    </div>
    <div style="position:relative">
      <button id="dash-customize-btn" onclick="toggleDashCustomize()" title="Personalizar dashboard" style="background:var(--bg3);border:1px solid var(--b1);border-radius:10px;padding:7px 12px;cursor:pointer;font-size:12px;color:var(--t3);display:flex;align-items:center;gap:6px;transition:all .15s" onmouseenter="this.style.borderColor='var(--b2)';this.style.color='var(--t)'" onmouseleave="this.style.borderColor='var(--b1)';this.style.color='var(--t3)'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Personalizar
      </button>
      <div id="dash-customize-panel" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:var(--bg2);border:1px solid var(--b1);border-radius:14px;padding:14px;min-width:220px;z-index:100;box-shadow:var(--shadow)">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Widgets visíveis</div>
        ${Object.entries(WIDGETS).map(([k,v])=>`
          <div onclick="toggleDashWidget('${k}')" style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;transition:background .12s" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background='transparent'">
            <div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ${w.includes(k)?"var(--a)":"var(--b2)"};background:${w.includes(k)?"var(--a)":"transparent"};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s">
              ${w.includes(k)?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':""}
            </div>
            <span style="font-size:12.5px;color:${w.includes(k)?"var(--t)":"var(--t3)"}">${v.label}</span>
          </div>
        `).join("")}
      </div>
    </div>
  </div>`;

  // Render active widgets
  w.forEach(wk=>{ if(WIDGETS[wk]?.html) html += `<div style="margin-bottom:14px">${WIDGETS[wk].html}</div>`; });

  document.getElementById("v-dashboard").innerHTML = html;
  requestAnimationFrame(()=>{
    try {
      if(w.includes("charts")) initCharts(wb,wlabels,tasks);
    } catch(e){ console.warn("Chart error:", e); }
    if(w.includes("weather")) setTimeout(loadWeather, 100);
  });
}


function toggleDashCustomize(){
  const panel = document.getElementById("dash-customize-panel");
  if(!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  // Fechar ao clicar fora
  if(!isOpen){
    setTimeout(()=>{
      document.addEventListener("click", function handler(e){
        if(!document.getElementById("dash-customize-btn")?.contains(e.target) &&
           !panel?.contains(e.target)){
          panel.style.display="none";
          document.removeEventListener("click", handler);
        }
      });
    }, 100);
  }
}

function toggleDashWidget(key){
  const w = S.dashWidgets;
  const idx = w.indexOf(key);
  if(idx>=0) w.splice(idx,1);
  else w.push(key);
  localStorage.setItem("tf_dash_widgets", JSON.stringify(w));
  renderDash();
}

// ─── STREAK DE PRODUTIVIDADE ──────────────────
function calcStreak(){
  const myTasks = S.tasks.filter(t=>t.assignee===S.user?.id || !t.assignee);
  const doneTasks = myTasks.filter(t=>t.status==="Concluído");

  // Heatmap últimos 30 dias
  const heatmap = [];
  const today = new Date();
  for(let i=29; i>=0; i--){
    const d = new Date(today);
    d.setDate(today.getDate()-i);
    const dk = d.toISOString().slice(0,10);
    const count = doneTasks.filter(t=>t.deadline===dk||t.created===dk).length;
    heatmap.push({ date:dk, count });
  }

  // Calcular streak atual (dias consecutivos com ≥1 tarefa concluída)
  let current = 0;
  for(let i=heatmap.length-1; i>=0; i--){
    if(heatmap[i].count>0) current++;
    else break;
  }

  // Melhor streak
  let best=0, tmp=0;
  heatmap.forEach(d=>{ if(d.count>0){tmp++;best=Math.max(best,tmp);}else tmp=0; });

  return { current, best, totalDone:doneTasks.length, heatmap };
}

// ─── WIDGET DE CLIMA ─────────────────────────
function buildWeatherHtml(w){
  const icons = {
    0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",
    51:"🌦️",53:"🌧️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",
    71:"🌨️",73:"🌨️",75:"❄️",80:"🌦️",81:"🌧️",82:"⛈️",
    95:"⛈️",96:"⛈️",99:"⛈️"
  };
  const icon = icons[w.code]||"🌡️";
  const desc = w.desc||"";
  return `<div class="card" style="margin-bottom:4px">
    <div class="shd" style="margin-bottom:12px">
      <div class="stitle">🌤️ Clima — ${w.city||"A tua localização"}</div>
      <span style="font-size:11px;color:var(--t3)">${new Date().toLocaleDateString("pt-PT",{weekday:"long",day:"2-digit",month:"long"})}</span>
    </div>
    <div style="display:flex;align-items:center;gap:20px">
      <div style="font-size:56px;line-height:1">${icon}</div>
      <div>
        <div style="font-size:42px;font-weight:800;color:var(--t);line-height:1">${w.temp}°C</div>
        <div style="font-size:13px;color:var(--t3);margin-top:4px;text-transform:capitalize">${desc}</div>
      </div>
      <div style="flex:1"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:var(--bg3);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:var(--t)">${w.humidity}%</div>
          <div style="font-size:10.5px;color:var(--t3)">Humidade</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:var(--t)">${w.wind} km/h</div>
          <div style="font-size:10.5px;color:var(--t3)">Vento</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#3b82f6">${w.tempMin}°</div>
          <div style="font-size:10.5px;color:var(--t3)">Mín.</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#ef4444">${w.tempMax}°</div>
          <div style="font-size:10.5px;color:var(--t3)">Máx.</div>
        </div>
      </div>
    </div>
  </div>`;
}

async function loadWeather(){
  if(!S.dashWidgets.includes("weather")) return;
  if(S.weatherCache && Date.now()-S.weatherCache.ts < 1800000) return; // cache 30min

  if(!navigator.geolocation){
    S.weatherCache = { error:true, ts:Date.now() };
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos=>{
    try {
      const {latitude:lat, longitude:lon} = pos.coords;
      // Open-Meteo — gratuito, sem API key
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
      const resp = await fetch(url);
      const data = await resp.json();
      const c = data.current;
      const d = data.daily;

      // Reverse geocode para nome da cidade
      let city = "";
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const gdata = await geo.json();
        city = gdata.address?.city || gdata.address?.town || gdata.address?.village || "";
      } catch(e){}

      const weatherCodes = {
        0:"Sol", 1:"Maioritariamente sol", 2:"Parcialmente nublado", 3:"Nublado",
        45:"Nevoeiro", 48:"Nevoeiro", 51:"Chuviscos leves", 53:"Chuviscos", 55:"Chuviscos fortes",
        61:"Chuva leve", 63:"Chuva", 65:"Chuva forte",
        71:"Neve leve", 73:"Neve", 75:"Neve forte",
        80:"Aguaceiros", 81:"Aguaceiros fortes", 82:"Aguaceiros violentos",
        95:"Trovoada", 96:"Trovoada com granizo", 99:"Trovoada forte"
      };

      S.weatherCache = {
        temp: Math.round(c.temperature_2m),
        humidity: c.relative_humidity_2m,
        wind: Math.round(c.wind_speed_10m),
        code: c.weather_code,
        desc: weatherCodes[c.weather_code] || "Variável",
        tempMax: Math.round(d.temperature_2m_max[0]),
        tempMin: Math.round(d.temperature_2m_min[0]),
        city, ts: Date.now()
      };

      // Atualizar widget sem recarregar tudo
      const el = document.getElementById("weather-widget");
      if(el) el.outerHTML = buildWeatherHtml(S.weatherCache);
      else if(S.view==="dashboard") renderDash();

    } catch(e){
      console.error("[Weather]", e);
    }
  }, ()=>{
    // Sem permissão de localização
    const el = document.getElementById("weather-widget");
    if(el) el.innerHTML = `<div class="shd"><div class="stitle">🌤️ Clima</div></div><div style="padding:12px;font-size:12.5px;color:var(--t3)">Permite o acesso à localização para ver o clima.</div>`;
  });
}

// ─────────────────────────────────────────────────
//  CHART.JS — Dashboard Charts
// ─────────────────────────────────────────────────
let _chartWeekly = null, _chartStatus = null;

function initCharts(wb, wlabels, tasks){
  // Verificar se Chart.js está disponível
  if(typeof Chart === 'undefined'){
    console.warn("Chart.js não disponível");
    return;
  }
  // Destroy old charts
  if(_chartWeekly){ _chartWeekly.destroy(); _chartWeekly=null; }
  if(_chartStatus){ _chartStatus.destroy(); _chartStatus=null; }

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const gridC = isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
  const textC = isDark ? "#50507a" : "#9490c0";

  // Weekly bar chart
  const wCtx = document.getElementById("chart-weekly");
  if(wCtx){
    _chartWeekly = new Chart(wCtx, {
      type: "bar",
      data: {
        labels: wlabels,
        datasets: [{
          label: "Tarefas",
          data: wb,
          backgroundColor: wlabels.map((_,i)=>{
            const day = new Date().getDay();
            const todayIdx = day===0?6:day-1;
            return i===todayIdx ? "#6366f1" : "rgba(99,102,241,.25)";
          }),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} tarefas` } } },
        scales: {
          x: { grid: { color: gridC }, ticks: { color: textC, font: { size: 10 } } },
          y: { grid: { color: gridC }, ticks: { color: textC, font: { size: 10 }, stepSize: 1 }, beginAtZero: true }
        }
      }
    });
  }

  // Status donut chart
  const sCtx = document.getElementById("chart-status");
  if(sCtx){
    const statuses = ["A Fazer","Em Progresso","Revisão","Concluído"];
    const counts = statuses.map(s=>tasks.filter(t=>t.status===s).length);
    const colors = ["#6b7280","#3b82f6","#f59e0b","#22c55e"];
    _chartStatus = new Chart(sCtx, {
      type: "doughnut",
      data: {
        labels: statuses,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "right",
            labels: { color: textC, font: { size: 10 }, boxWidth: 10, padding: 8 }
          },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────
//  KANBAN + DRAG & DROP
// ─────────────────────────────────────────────────
function filtKanban(){
  let tasks = S.tasks;
  const kf = S.kf;
  if(kf.proj)     tasks = tasks.filter(t=>t.project===kf.proj);
  if(kf.assignee) tasks = tasks.filter(t=>t.assignee===kf.assignee);
  if(kf.priority) tasks = tasks.filter(t=>t.priority===kf.priority);
  if(kf.deadline==="hoje")   tasks = tasks.filter(t=>t.deadline===tday());
  if(kf.deadline==="atraso") tasks = tasks.filter(t=>t.deadline&&t.deadline<tday()&&t.status!=="Concluído");
  if(kf.deadline==="semana"){ const w=new Date(); w.setDate(w.getDate()+7); const ws=w.toISOString().slice(0,10); tasks=tasks.filter(t=>t.deadline&&t.deadline>=tday()&&t.deadline<=ws); }
  if(S.search && !S.search.startsWith("proj:")) tasks=tasks.filter(t=>t.title.toLowerCase().includes(S.search)||t.description?.toLowerCase().includes(S.search));
  return tasks;
}

function kfActive(){ const k=S.kf; return !!(k.proj||k.assignee||k.priority||k.deadline); }

function renderKanban(){
  const tasks = filtKanban();
  const activeFilters = kfActive();
  document.getElementById("v-kanban").innerHTML=`
  <!-- Barra de filtros -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.proj=this.value;renderKanban()">
      <option value="">📁 Todos os projetos</option>
      ${S.projects.map(p=>`<option value="${p.id}" ${S.kf.proj===p.id?"selected":""}>${p.icon} ${p.name}</option>`).join("")}
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.assignee=this.value;renderKanban()">
      <option value="">👤 Todos os membros</option>
      ${S.users.map(u=>`<option value="${u.id}" ${S.kf.assignee===u.id?"selected":""}>${u.avatar} ${u.name}</option>`).join("")}
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.priority=this.value;renderKanban()">
      <option value="">🎯 Todas as prioridades</option>
      <option value="high" ${S.kf.priority==="high"?"selected":""}>🔴 Alta</option>
      <option value="medium" ${S.kf.priority==="medium"?"selected":""}>🟡 Média</option>
      <option value="low" ${S.kf.priority==="low"?"selected":""}>🟢 Baixa</option>
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.deadline=this.value;renderKanban()">
      <option value="">📅 Qualquer prazo</option>
      <option value="hoje" ${S.kf.deadline==="hoje"?"selected":""}>Hoje</option>
      <option value="semana" ${S.kf.deadline==="semana"?"selected":""}>Esta semana</option>
      <option value="atraso" ${S.kf.deadline==="atraso"?"selected":""}>⚠️ Em atraso</option>
    </select>
    ${activeFilters?`<button onclick="S.kf={proj:'',assignee:'',priority:'',deadline:''};renderKanban()" style="padding:6px 12px;background:rgba(239,68,68,.1);color:var(--err);border:1px solid rgba(239,68,68,.2);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">✕ Limpar filtros</button>`:""}
    <div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button onclick="exportKanbanPNG()" style="padding:5px 12px;background:var(--bg3);border:1px solid var(--b1);border-radius:8px;cursor:pointer;font-size:12px;color:var(--t2);font-weight:600;display:flex;align-items:center;gap:5px" title="Exportar Kanban como imagem">📸 Exportar PNG</button>
      ${COLS.map(c=>`<span style="font-size:11px;color:var(--t3);display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${SC[c]};display:inline-block"></span>${c}: <b style="color:var(--t2)">${tasks.filter(t=>t.status===c).length}</b></span>`).join("")}
    </div>
  </div>
  ${activeFilters&&!tasks.length?`<div class="empty-st"><div class="empty-i">🔍</div><div class="empty-t">Nenhuma tarefa com estes filtros</div><button class="btn-ghost" style="margin-top:12px" onclick="S.kf={proj:'',assignee:'',priority:'',deadline:''};renderKanban()">Limpar filtros</button></div>`:""}
  <div class="kanban">
    ${COLS.map(col=>{
      const ct=tasks.filter(t=>t.status===col);
      return`<div class="k-col" id="kc-${col.replace(/ /g,"_")}" ondragover="onDOver(event,'${col}')" ondrop="onDrop(event,'${col}')" ondragleave="onDLeave(event)">
        <div class="k-hd"><div class="k-dot" style="background:${SC[col]}"></div><span class="k-title">${col}</span><span class="k-cnt">${ct.length}</span></div>
        <div class="k-body">
          ${!ct.length?`<div class="empty-st" style="padding:18px 8px"><div class="empty-i" style="font-size:24px">◻</div><div class="empty-t" style="font-size:11px">Sem tarefas</div></div>`:""}
          ${ct.map(t=>{
            const u=S.users.find(x=>x.id===t.assignee),dl=dleft(t.deadline),ds=t.subtasks?.filter(s=>s.done).length||0,proj=S.projects.find(p=>p.id===t.project);
            return`<div class="tc" id="tc-${t.id}" draggable="true" ondragstart="onDStart(event,'${t.id}','${col}')" ondragend="onDEnd(event)" ondragover="onDOverCard(event,'${t.id}')" onclick="openDetail('${t.id}')">
              <div style="position:absolute;left:0;top:0;bottom:0;width:2.5px;background:${PRIO[t.priority]?.c};border-radius:8px 0 0 8px"></div>
              ${t.pinned?`<div style="position:absolute;top:7px;right:8px;font-size:10px" title="Fixada">📌</div>`:""}
              ${isTaskBlocked(t)?`<div style="font-size:10px;color:var(--err);font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:3px"><span>🔒</span><span>Bloqueada por ${getBlockedBy(t).length} tarefa${getBlockedBy(t).length>1?"s":""}</span></div>`:""}
              <div class="tc-title">${t.title}</div>
              ${t.tags?.length?`<div class="tc-tags">${t.tags.map(tg=>{const g=TAGS.find(x=>x.id===tg);return g?`<span class="tag" style="background:${g.c}18;color:${g.c}">${g.l}</span>`:""}).join("")}</div>`:""}
              ${t.subtasks?.length?`<div class="tc-sub">☑ ${ds}/${t.subtasks.length}</div>`:""}
              <div class="tc-meta">
                <div class="pri" style="background:${PRIO[t.priority]?.bg};color:${PRIO[t.priority]?.c}">${PRIO[t.priority]?.l}</div>
                ${proj?`<span style="font-size:9px;padding:2px 6px;background:${proj.color}18;color:${proj.color};border-radius:4px;font-weight:700">${proj.icon}</span>`:""}
                ${u?`<div class="av sm" style="background:${u.color}" title="${u.name}">${u.avatar}</div>`:""}
                ${dl!==null?`<div class="dl-b ${dl<0?"r":dl<=2?"w":""}">${dl<0?Math.abs(dl)+"d atraso":dl===0?"hoje":dl+"d"}</div>`:""}
                ${t.comments?.length?`<span style="font-size:9.5px;color:var(--t3)">💬${t.comments.length}</span>`:""}
                <button class="tc-done-btn ${t.status==="Concluído"?"done":""}" onclick="event.stopPropagation();quickComplete('${t.id}')" title="${t.status==="Concluído"?"Reabrir tarefa":"Marcar como concluída"}">
                  ${t.status==="Concluído"?"✓":"○"}
                </button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

// ─── DRAG & DROP (colunas + reordenação) ─────────
function onDStart(e,tid,col){
  S.dTask=tid; S.dCol=col;
  e.dataTransfer.effectAllowed="move";
  e.dataTransfer.setData("text/plain",tid);
  setTimeout(()=>document.getElementById("tc-"+tid)?.classList.add("dragging"),0);
}
function onDEnd(e){
  document.querySelectorAll(".tc,.k-col,.tc-drop-indicator").forEach(el=>{
    el.classList.remove("dragging","drag-over","drag-above","drag-below");
    if(el.classList.contains("tc-drop-indicator")) el.remove();
  });
  S.dOverCard=null;
}
function onDOver(e,col){
  e.preventDefault(); e.dataTransfer.dropEffect="move";
  document.querySelectorAll(".k-col").forEach(el=>el.classList.remove("drag-over"));
  document.getElementById("kc-"+col.replace(/ /g,"_"))?.classList.add("drag-over");
}
function onDOverCard(e,tid){
  e.preventDefault(); e.stopPropagation();
  if(S.dTask===tid) return;
  S.dOverCard=tid;
  // Mostrar indicador visual
  document.querySelectorAll(".tc").forEach(el=>el.classList.remove("drag-above","drag-below"));
  const el=document.getElementById("tc-"+tid);
  if(el){
    const rect=el.getBoundingClientRect();
    const half=rect.top+rect.height/2;
    el.classList.add(e.clientY<half?"drag-above":"drag-below");
  }
}
function onDLeave(e){ if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.classList.remove("drag-over"); }

async function onDrop(e,col){
  e.preventDefault();
  document.querySelectorAll(".k-col,.tc").forEach(el=>el.classList.remove("drag-over","drag-above","drag-below"));
  if(!S.dTask) return;

  const sameCol = S.dCol===col;
  const overCard = S.dOverCard;
  S.dOverCard=null;

  if(!sameCol){
    // Mover para outra coluna
    await api(`/api/tasks/${S.dTask}`,"PATCH",{status:col});
    const t=S.tasks.find(x=>x.id===S.dTask); if(t)t.status=col;
    toast(`Movido para "${col}"`,"s");
    await refreshAll();
  } else if(overCard && overCard!==S.dTask){
    // Reordenar na mesma coluna
    const colTasks = S.tasks.filter(t=>t.status===col);
    const fromIdx  = colTasks.findIndex(t=>t.id===S.dTask);
    const toIdx    = colTasks.findIndex(t=>t.id===overCard);
    if(fromIdx!==-1 && toIdx!==-1){
      // Mover no array global
      const taskObj = S.tasks.splice(S.tasks.findIndex(t=>t.id===S.dTask),1)[0];
      const insertAt = S.tasks.findIndex(t=>t.id===overCard);
      S.tasks.splice(insertAt,0,taskObj);
      renderKanban();
      toast("Tarefa reordenada","s");
    }
  }
  S.dTask=null; S.dCol=null;
}

document.head.appendChild(Object.assign(document.createElement("style"),{textContent:`
  .tc.dragging{opacity:.25;transform:rotate(1.5deg);box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .k-col.drag-over{border-color:var(--a);background:rgba(99,102,241,.04)}
  .tc.drag-above{border-top:2.5px solid var(--a);margin-top:-1px}
  .tc.drag-below{border-bottom:2.5px solid var(--a);margin-bottom:-1px}
`}));

// ─────────────────────────────────────────────────
//  CALENDAR — Google-style Month/Week/Day
// ─────────────────────────────────────────────────
const MNS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WDS=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

function renderCal(){
  document.getElementById("v-calendar").innerHTML=`
  <div class="cal-tb">
    <button class="cal-nb" onclick="calToday()">Hoje</button>
    <button class="cal-nb" onclick="calMove(-1)">‹</button>
    <div class="cal-title">${calTitle()}</div>
    <button class="cal-nb" onclick="calMove(1)">›</button>
    <div class="cal-vbs" style="margin-left:auto">
      ${["month","week","day"].map(v=>`<button class="cal-vb ${S.calView===v?"on":""}" onclick="S.calView='${v}';renderCal()">${{month:"Mês",week:"Semana",day:"Dia"}[v]}</button>`).join("")}
    </div>
    <button class="btn-cta" style="padding:7px 14px;font-size:12.5px" onclick="openNewEvent()">+ Evento</button>
  </div>
  <div id="cal-body">${S.calView==="month"?calMonth():S.calView==="week"?calWeek():calDay()}</div>`;
}

function calTitle(){
  const d=S.calDate;
  if(S.calView==="month") return MNS[d.getMonth()]+" "+d.getFullYear();
  if(S.calView==="week"){ const m=wkStart(d),s=new Date(m);s.setDate(s.getDate()+6);return`${m.getDate()}–${s.getDate()} ${MNS[s.getMonth()]} ${s.getFullYear()}`; }
  return`${d.getDate()} de ${MNS[d.getMonth()]} ${d.getFullYear()}`;
}
function calToday(){ S.calDate=new Date(); renderCal(); }
function calMove(dir){
  const d=new Date(S.calDate);
  if(S.calView==="month")d.setMonth(d.getMonth()+dir);
  else if(S.calView==="week")d.setDate(d.getDate()+dir*7);
  else d.setDate(d.getDate()+dir);
  S.calDate=d; renderCal();
}

function calMonth(){
  const d=S.calDate,y=d.getFullYear(),m=d.getMonth();
  const first=new Date(y,m,1).getDay(),dim=new Date(y,m+1,0).getDate();
  const off=first===0?6:first-1,prev=new Date(y,m,0).getDate();
  const tn=new Date();
  const cells=[];
  for(let i=off;i>0;i--)cells.push({day:prev-i+1,cur:false,date:new Date(y,m-1,prev-i+1)});
  for(let dd=1;dd<=dim;dd++)cells.push({day:dd,cur:true,date:new Date(y,m,dd)});
  while(cells.length%7!==0)cells.push({day:cells.length-dim-off+1,cur:false,date:new Date(y,m+1,cells.length-dim-off+1)});
  const em={};
  S.events.forEach(e=>{const k=e.start?.slice(0,10);if(!em[k])em[k]=[];em[k].push(e);});
  S.tasks.filter(t=>t.deadline).forEach(t=>{const k=t.deadline;if(!em[k])em[k]=[];em[k].push({id:"t"+t.id,title:"📋 "+t.title,color:SC[t.status]||"#6b7280",_tid:t.id});});
  return`<div class="cal-grid">
    ${WDS.map(w=>`<div class="cal-dh">${w}</div>`).join("")}
    ${cells.map(c=>{
      const k=fmtKey(c.date),evs=em[k]||[],isT=c.date.toDateString()===tn.toDateString();
      return`<div class="cal-cell ${isT?"today":""} ${!c.cur?"other-m":""}" onclick="calCellClick('${k}')">
        <div class="cal-num"><div>${c.day}</div></div>
        ${evs.slice(0,3).map(e=>`<div class="cal-ev" style="background:${e.color}22;color:${e.color}" onclick="event.stopPropagation();${e._tid?`openDetail('${e._tid}')`:`openEvDet('${e.id}')`}" title="${e.title}">${e.title}</div>`).join("")}
        ${evs.length>3?`<div class="cal-more">+${evs.length-3} mais</div>`:""}
      </div>`;
    }).join("")}
  </div>`;
}

function calWeek(){
  const ws=wkStart(S.calDate),tn=new Date();
  const days=Array.from({length:7},(_,i)=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
  const ebd=days.map(d=>S.events.filter(e=>e.start?.slice(0,10)===fmtKey(d)));
  return`<div class="week-grid">
    <div class="week-hd-row">
      <div class="week-hd-cell"></div>
      ${days.map((d,i)=>{const isT=d.toDateString()===tn.toDateString();return`<div class="week-hd-cell"><div class="whd-name">${WDS[i]}</div><div class="whd-num ${isT?"today":""}">${d.getDate()}</div></div>`;}).join("")}
    </div>
    ${Array.from({length:15},(_,i)=>i+7).map(h=>`
      <div class="week-body-row">
        <div class="week-time">${h.toString().padStart(2,"0")}:00</div>
        ${days.map((d,di)=>{
          const hevs=ebd[di].filter(e=>parseInt(e.start?.slice(11,13)||"0")===h);
          return`<div class="week-cell" onclick="openNewEventAt('${fmtKey(d)}T${h.toString().padStart(2,"0")}:00')">
            ${hevs.map(e=>`<div class="week-ev" style="background:${e.color}" onclick="event.stopPropagation();openEvDet('${e.id}')">${e.title}</div>`).join("")}
          </div>`;
        }).join("")}
      </div>`).join("")}
  </div>`;
}

function calDay(){
  const d=S.calDate,k=fmtKey(d),evs=S.events.filter(e=>e.start?.slice(0,10)===k);
  return`<div style="background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid var(--b1);font-size:16px;font-weight:700">${d.getDate()} de ${MNS[d.getMonth()]} ${d.getFullYear()}</div>
    ${Array.from({length:15},(_,i)=>i+7).map(h=>{
      const he=evs.filter(e=>parseInt(e.start?.slice(11,13)||"0")===h);
      return`<div style="display:flex;border-bottom:1px solid var(--b1);min-height:54px">
        <div style="width:60px;padding:10px 8px;font-size:10px;color:var(--t3);font-family:var(--mono);flex-shrink:0">${h.toString().padStart(2,"0")}:00</div>
        <div style="flex:1;padding:6px;cursor:pointer" onclick="openNewEventAt('${k}T${h.toString().padStart(2,"0")}:00')">
          ${he.map(e=>`<div style="background:${e.color};color:#fff;padding:8px 13px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;margin-bottom:3px" onclick="event.stopPropagation();openEvDet('${e.id}')">${e.title} <span style="opacity:.7;font-weight:400">${e.start?.slice(11,16)}</span></div>`).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function calCellClick(k){ S.calDate=new Date(k+"T12:00"); S.calView="day"; renderCal(); }
function wkStart(d){ const dd=d.getDay(),diff=d.getDate()-(dd===0?6:dd-1);return new Date(d.getFullYear(),d.getMonth(),diff); }
function fmtKey(d){ return d.toISOString().slice(0,10); }

function openEvDet(eid){
  const e=S.events.find(x=>x.id===eid); if(!e)return;
  const atts=S.users.filter(u=>e.attendees?.includes(u.id));
  document.getElementById("mo-detail-body").innerHTML=`
    <div class="mhd">
      <div style="display:flex;align-items:center;gap:9px">
        <div style="width:10px;height:10px;border-radius:3px;background:${e.color}"></div>
        <h3>${e.title}</h3>
      </div>
      <button onclick="closeMo('mo-detail')">✕</button>
    </div>
    <div class="mbody">
      <div style="font-size:12.5px;color:var(--t3);margin-bottom:12px">${EV_TYPES[e.type]||"📌 Evento"}</div>
      ${e.description?`<div style="background:var(--bg3);border-radius:8px;padding:12px;font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:14px">${e.description}</div>`:""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="td-mb"><div class="td-ml">Início</div><div style="font-size:13px;font-weight:600">${fmtDT(e.start)}</div></div>
        <div class="td-mb"><div class="td-ml">Fim</div><div style="font-size:13px;font-weight:600">${fmtDT(e.end)}</div></div>
      </div>
      ${atts.length?`<div class="td-ml">Participantes</div><div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px">${atts.map(u=>`<div style="display:flex;align-items:center;gap:6px;padding:5px 11px;background:var(--bg3);border-radius:99px"><div class="av sm" style="background:${u.color}">${u.avatar}</div><span style="font-size:12px">${u.name}</span></div>`).join("")}</div>`:""}
    </div>
    <div class="mfoot"><button class="btn-err" onclick="delEvent('${e.id}')">🗑 Eliminar</button><button class="btn-ghost" onclick="closeMo('mo-detail')">Fechar</button></div>`;
  document.getElementById("mo-detail").classList.remove("hidden");
}

async function delEvent(eid){ await api(`/api/events/${eid}`,"DELETE"); S.events=S.events.filter(e=>e.id!==eid); closeMo("mo-detail"); toast("Evento eliminado","i"); if(S.view==="calendar")renderCal(); }

// ─────────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────────
function renderNotes(){
  if(S.noteOpen){ renderNoteEd(S.noteOpen); return; }
  document.getElementById("v-notes").innerHTML=`
  <div class="shd"><div class="stitle">Notas (${S.notes.length})</div><button class="btn-cta" style="padding:7px 14px;font-size:12.5px" onclick="createNote()">+ Nova nota</button></div>
  ${!S.notes.length?`<div class="empty-st"><div class="empty-i">📝</div><div class="empty-t">Sem notas ainda</div></div>`:""}
  <div class="notes-grid">
    ${S.notes.map(n=>`<div class="note-card" style="background:${n.color}14;border-color:${n.color}28" onclick="openNote('${n.id}')">
      ${n.pinned?`<div style="position:absolute;top:10px;right:10px;font-size:11px">📌</div>`:""}
      <div class="note-title">${n.title}</div>
      <div class="note-body">${n.content||"<em style='opacity:.4'>Vazia</em>"}</div>
      <div class="note-date">${fmtDate(n.updated)}</div>
    </div>`).join("")}
  </div>`;
}

function renderNoteEd(nid){
  const n=S.notes.find(x=>x.id===nid); if(!n){ S.noteOpen=null; renderNotes(); return; }
  document.getElementById("v-notes").innerHTML=`
  <div style="max-width:780px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <button class="btn-ghost" style="padding:6px 12px;font-size:12.5px" onclick="S.noteOpen=null;renderNotes()">← Notas</button>
      <div class="color-row">${PALETTE.slice(0,7).map(c=>`<div class="col-opt ${n.color===c?"on":""}" style="background:${c}" onclick="noteColor('${n.id}','${c}',this)"></div>`).join("")}</div>
      <button class="btn-ghost" style="padding:6px 12px;font-size:12.5px;margin-left:auto" onclick="notePin('${n.id}')">${n.pinned?"📌 Fixada":"📌 Fixar"}</button>
      <button class="btn-err" onclick="noteDelete('${n.id}')">🗑</button>
    </div>
    <div style="background:${n.color}10;border:1px solid ${n.color}28;border-radius:var(--r);padding:24px">
      <input class="note-ed-title" id="ned-t" value="${n.title.replace(/"/g,"&quot;")}" placeholder="Título..." oninput="noteTitle('${n.id}',this.value)"/>
      <textarea class="note-ed-body" id="ned-b" placeholder="Escreve aqui..." oninput="noteBody('${n.id}',this.value)" rows="20">${n.content}</textarea>
    </div>
  </div>`;
}

function openNote(nid){ S.noteOpen=nid; renderNotes(); }
async function createNote(){ const n=await api("/api/notes","POST",{title:"Nova nota",content:"",color:PALETTE[0]}); S.notes.unshift(n); S.noteOpen=n.id; renderNotes(); }
function noteTitle(nid,v){ clearTimeout(S._nt); S._nt=setTimeout(async()=>{ await api(`/api/notes/${nid}`,"PATCH",{title:v}); const n=S.notes.find(x=>x.id===nid);if(n)n.title=v; },600); }
function noteBody(nid,v){ clearTimeout(S._nb); S._nb=setTimeout(async()=>{ await api(`/api/notes/${nid}`,"PATCH",{content:v}); const n=S.notes.find(x=>x.id===nid);if(n)n.content=v; },600); }
async function noteColor(nid,color,el){ await api(`/api/notes/${nid}`,"PATCH",{color}); const n=S.notes.find(x=>x.id===nid);if(n)n.color=color; document.querySelectorAll(".col-opt").forEach(e=>e.classList.remove("on")); el.classList.add("on"); const ed=document.querySelector("[style*='note-ed-title']")?.closest("div");if(ed){ed.style.background=color+"10";ed.style.borderColor=color+"28";} }
async function notePin(nid){ const n=S.notes.find(x=>x.id===nid);if(!n)return; await api(`/api/notes/${nid}`,"PATCH",{pinned:!n.pinned}); n.pinned=!n.pinned; renderNotes(); }
async function noteDelete(nid){
  const note = S.notes.find(n=>n.id===nid);
  if(!confirm(`Eliminar a nota "${note?.title||"Nota"}"?`)) return;
  await api(`/api/notes/${nid}`,"DELETE");
  S.notes=S.notes.filter(x=>x.id!==nid);
  S.noteOpen=null;
  renderNotes();
  toast("Nota eliminada","i");
}

// ─────────────────────────────────────────────────
//  TEAM + PROFILE
// ─────────────────────────────────────────────────
function renderTeam(){
  const isAdmin=S.user?.role==="admin";
  document.getElementById("v-team").innerHTML=`
  <div class="shd"><div class="stitle">Equipa (${S.users.length})</div>${isAdmin?`<button class="btn-cta" style="padding:7px 14px;font-size:12.5px" onclick="openInviteModal()">+ Convidar</button>`:""}</div>
  <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">
    ${["Todos","Admin","Manager","Member","Viewer"].map(r=>`<button class="btn-ghost" style="padding:5px 12px;font-size:12px" onclick="teamFilter('${r}')" id="tf-${r}">${r}</button>`).join("")}
  </div>
  <div class="team-grid" id="team-g">${teamCards(S.users)}</div>`;
  document.getElementById("tf-Todos")?.classList.add("active");
}

function teamCards(us){
  return us.map(u=>{
    const ut=S.tasks.filter(t=>t.assignee===u.id),d=ut.filter(t=>t.status==="Concluído").length,ip=ut.filter(t=>t.status==="Em Progresso").length;
    const pct=ut.length?Math.round(d/ut.length*100):0,r=ROLES[u.role];
    return`<div class="mc" onclick="openProfile('${u.id}')">
      <div class="mc-top"><div class="mc-av-wrap"><div class="av md" style="background:${u.color}">${u.avatar}</div>${u.online?`<div class="mc-online"></div>`:""}</div>
      <div><div class="mc-name">${u.name}</div><div class="mc-dept">${u.department||"—"}</div></div></div>
      <div class="role-tag" style="color:${r?.c}">${r?.i} ${r?.l}</div>
      <div class="mc-stats"><div class="mcs"><div class="mcs-v">${ut.length}</div><div class="mcs-l">Tarefas</div></div><div class="mcs"><div class="mcs-v" style="color:var(--ok)">${d}</div><div class="mcs-l">Feitas</div></div><div class="mcs"><div class="mcs-v" style="color:var(--war)">${ip}</div><div class="mcs-l">Ativas</div></div></div>
      <div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--t3);margin-bottom:4px"><span>Produtividade</span><span>${pct}%</span></div><div class="prog prog-md"><div class="prog-fill" style="width:${pct}%;background:${r?.c}"></div></div></div>
      ${u.skills?.length?`<div class="skill-chips">${u.skills.slice(0,3).map(s=>`<span class="skill-chip">${s}</span>`).join("")}${u.skills.length>3?`<span class="skill-chip">+${u.skills.length-3}</span>`:""}</div>`:""}
    </div>`;
  }).join("");
}

function teamFilter(role){
  document.querySelectorAll("[id^='tf-']").forEach(b=>b.classList.remove("active"));
  document.getElementById("tf-"+role)?.classList.add("active");
  const users=role==="Todos"?S.users:S.users.filter(u=>u.role===role.toLowerCase());
  document.getElementById("team-g").innerHTML=teamCards(users);
}

async function uploadPic(uid, input){
  const file = input.files[0]; if(!file) return;
  if(file.size > 500000){ toast("Imagem muito grande! Máximo 500KB.","e"); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = e.target.result; // base64 data URL
    toast("A carregar foto...","i");
    const r = await api(`/api/users/${uid}/picture`,"POST",{data});
    if(r.error){ toast(r.error,"e"); return; }
    // Update local state
    const u = S.users.find(x=>x.id===uid);
    if(u) u.picture = data;
    if(S.user?.id===uid){ S.user.picture=data; localStorage.setItem("tf_u",JSON.stringify(S.user)); }
    toast("Foto atualizada! ✨","s");
    closeMo("mo-profile");
    setTimeout(()=>openProfile(uid),100);
  };
  reader.readAsDataURL(file);
}

function openProfile(uid){
  const u=S.users.find(x=>x.id===uid); if(!u)return;
  const r=ROLES[u.role],ut=S.tasks.filter(t=>t.assignee===uid);
  const d=ut.filter(t=>t.status==="Concluído").length,ip=ut.filter(t=>t.status==="Em Progresso").length;
  const pct=ut.length?Math.round(d/ut.length*100):0,isAdmin=S.user?.role==="admin",isOwn=S.user?.id===uid;
  const projs=S.projects.filter(p=>p.members?.includes(uid));
  const picHtml = u.picture
    ? `<div class="pr-av-wrap" style="margin-bottom:20px"><img src="${u.picture}" style="width:70px;height:70px;border-radius:18px;object-fit:cover;border:3px solid var(--b2);box-shadow:0 4px 16px rgba(0,0,0,.4)" alt="${u.name}"/>${isOwn?`<label class="pr-pic-btn" title="Alterar foto"><input type="file" accept="image/*" style="display:none" onchange="uploadPic('${u.id}',this)"/>📷</label>`:''}</div>`
    : `<div class="pr-av-wrap" style="margin-bottom:20px"><div class="av xl" style="background:${u.color}">${u.avatar}</div>${isOwn?`<label class="pr-pic-btn" title="Adicionar foto"><input type="file" accept="image/*" style="display:none" onchange="uploadPic('${u.id}',this)"/>📷</label>`:''}</div>`;

  document.getElementById("mo-profile-body").innerHTML=`
    <div class="mhd" style="border:none;background:transparent"><button onclick="closeMo('mo-profile')" style="margin-left:auto">✕</button></div>
    <div class="pr-bg">
      ${picHtml}
      <div class="pr-info">
        <div class="pr-name">${u.name} ${u.online?`<span style="font-size:11px;color:var(--ok);font-weight:400">● online</span>`:""}</div>
        <div class="pr-sub">${u.department||""} · ${r?.i} ${r?.l}</div>
        ${u.bio?`<div class="pr-bio">${u.bio}</div>`:""}
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px">
          ${u.phone?`<span style="font-size:11.5px;color:var(--t2)">📞 ${u.phone}</span>`:""}
          ${u.location?`<span style="font-size:11.5px;color:var(--t2)">📍 ${u.location}</span>`:""}
          <span style="font-size:11.5px;color:var(--t2)">✉️ ${u.email}</span>
        </div>
      </div>
    </div>
    <div class="pr-stats">
      ${[{v:ut.length,l:"Tarefas"},{v:d,l:"Concluídas",c:"var(--ok)"},{v:ip,l:"Em Progresso",c:"var(--war)"},{v:pct+"%",l:"Produtividade",c:"var(--a3)"}]
        .map(s=>`<div class="ps"><div class="ps-v" style="color:${s.c||"var(--t)"}">${s.v}</div><div class="ps-l">${s.l}</div></div>`).join("")}
    </div>
    <div class="pr-body">
      <div>
        <div class="td-ml">Skills</div>
        ${u.skills?.length?`<div class="skill-chips" style="margin-top:8px">${u.skills.map(s=>`<span class="skill-chip">${s}</span>`).join("")}</div>`:`<div style="font-size:12.5px;color:var(--t3);margin-top:8px">—</div>`}
        <div class="td-ml" style="margin-top:16px">Projetos</div>
        <div style="margin-top:8px">${projs.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1)"><div style="width:7px;height:7px;border-radius:50%;background:${p.color}"></div><span style="font-size:12.5px">${p.name}</span></div>`).join("")||`<div style="font-size:12.5px;color:var(--t3)">—</div>`}</div>
        ${isAdmin&&!isOwn?`<div style="margin-top:16px"><div class="td-ml">Cargo</div><select class="fi" style="margin-top:6px" onchange="changeRole('${u.id}',this.value)">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u.role===k?"selected":""}>${v.i} ${v.l}</option>`).join("")}</select></div>`:""}
        ${isOwn?`<div style="margin-top:14px"><button class="btn-ghost" style="font-size:12.5px;padding:6px 12px" onclick="closeMo('mo-profile');nav('settings')">⚙ Editar Perfil</button></div>`:""}
      </div>
      <div>
        <div class="td-ml">Tarefas Recentes</div>
        <div style="margin-top:8px">${ut.slice(0,6).map(t=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--b1);cursor:pointer" onclick="closeMo('mo-profile');openDetail('${t.id}')"><div style="width:7px;height:7px;border-radius:50%;background:${SC[t.status]}"></div><span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</span></div>`).join("")||`<div style="font-size:12.5px;color:var(--t3)">Sem tarefas</div>`}</div>
      </div>
    </div>`;
  document.getElementById("mo-profile").classList.remove("hidden");
}

async function changeRole(uid,role){ await api(`/api/users/${uid}`,"PATCH",{role}); const u=S.users.find(x=>x.id===uid);if(u)u.role=role; toast("Cargo atualizado!","s"); renderTeam(); }

// ─────────────────────────────────────────────────
//  REPORTS + exportar PDF real
// ─────────────────────────────────────────────────
function renderReports(){
  const t=S.tasks, total=t.length;
  const bySt=Object.fromEntries(COLS.map(c=>[c,t.filter(x=>x.status===c).length]));
  const byPr={Alta:t.filter(x=>x.priority==="high").length,Média:t.filter(x=>x.priority==="medium").length,Baixa:t.filter(x=>x.priority==="low").length};
  const byMem=S.users.map(u=>({
    name:u.name, short:u.name.split(" ")[0],
    done:t.filter(x=>x.assignee===u.id&&x.status==="Concluído").length,
    inprog:t.filter(x=>x.assignee===u.id&&x.status==="Em Progresso").length,
    todo:t.filter(x=>x.assignee===u.id&&x.status==="A Fazer").length,
    total:t.filter(x=>x.assignee===u.id).length,
    color:u.color
  })).filter(m=>m.total>0);
  const overdue=t.filter(x=>x.deadline&&x.deadline<tday()&&x.status!=="Concluído").length;
  const rate=Math.round(bySt["Concluído"]/(total||1)*100);

  const lang = S.lang||"pt";

  document.getElementById("v-reports").innerHTML=`
  <div class="shd" style="margin-bottom:18px">
    <div class="stitle">${T("reportsTitle")}</div>
    <div style="display:flex;gap:8px">
      <button class="btn-ghost" style="padding:6px 14px;font-size:12.5px" onclick="exportPDF()">📥 ${T("exportPDF")}</button>
      <button class="btn-ghost" style="padding:6px 14px;font-size:12.5px" onclick="exportCSV()">📊 ${T("exportCSV")}</button>
    </div>
  </div>

  <!-- KPIs -->
  <div class="stats-row" style="margin-bottom:18px">
    ${[
      {l:lang==="pt"?"Taxa de Conclusão":"Completion Rate", v:rate+"%", i:"📈", s:"s2"},
      {l:lang==="pt"?"Em Progresso":"In Progress",          v:bySt["Em Progresso"], i:"⚙️", s:"s3"},
      {l:lang==="pt"?"Em Revisão":"In Review",              v:bySt["Revisão"], i:"🔍", s:"s1"},
      {l:lang==="pt"?"Em Atraso":"Overdue",                 v:overdue, i:"🚨", s:"s4"}
    ].map(s=>`<div class="stat-card ${s.s}"><div class="stat-top"><span class="stat-icon">${s.i}</span></div><div class="stat-num">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join("")}
  </div>

  <!-- Gráficos Chart.js: barras por membro + donut estado -->
  <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;margin-bottom:18px">
    <div class="card">
      <div class="clabel" style="margin-bottom:14px">${lang==="pt"?"📊 Produtividade por Membro":"📊 Productivity by Member"}</div>
      <div style="position:relative;height:200px"><canvas id="chart-member"></canvas></div>
    </div>
    <div class="card">
      <div class="clabel" style="margin-bottom:14px">${lang==="pt"?"🍩 Por Estado":"🍩 By Status"}</div>
      <div style="position:relative;height:200px"><canvas id="chart-status-rep"></canvas></div>
    </div>
  </div>

  <!-- Barras estado + prioridade -->
  <div class="g2" style="margin-bottom:18px">
    <div class="card">
      <div class="clabel">${T("byState")}</div>
      <div class="rbar">${Object.entries(bySt).map(([s,v])=>`<div class="rbar-row">
        <div class="rbar-lbl">${s}</div>
        <div class="rbar-track"><div class="rbar-fill" style="width:${Math.round(v/(total||1)*100)}%;background:${SC[s]}"></div></div>
        <div class="rbar-val">${v}</div>
      </div>`).join("")}</div>
    </div>
    <div class="card">
      <div class="clabel">${T("byPriority")}</div>
      <div class="rbar">${[{l:lang==="pt"?"Alta":"High",v:byPr["Alta"],c:"#ef4444"},{l:lang==="pt"?"Média":"Medium",v:byPr["Média"],c:"#f59e0b"},{l:lang==="pt"?"Baixa":"Low",v:byPr["Baixa"],c:"#22c55e"}].map(p=>`<div class="rbar-row">
        <div class="rbar-lbl">${p.l}</div>
        <div class="rbar-track"><div class="rbar-fill" style="width:${Math.round(p.v/(total||1)*100)}%;background:${p.c}"></div></div>
        <div class="rbar-val">${p.v}</div>
      </div>`).join("")}</div>
    </div>
  </div>

  <!-- Tabela de produtividade detalhada por membro -->
  <div class="card" style="margin-bottom:18px">
    <div class="clabel" style="margin-bottom:14px">${T("byMember")}</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="border-bottom:2px solid var(--b1)">
            <th style="text-align:left;padding:8px 10px;color:var(--t3);font-weight:600">${lang==="pt"?"Membro":"Member"}</th>
            <th style="text-align:center;padding:8px 10px;color:var(--t3);font-weight:600">${lang==="pt"?"Total":"Total"}</th>
            <th style="text-align:center;padding:8px 10px;color:#22c55e;font-weight:600">${lang==="pt"?"Concluídas":"Done"}</th>
            <th style="text-align:center;padding:8px 10px;color:#6366f1;font-weight:600">${lang==="pt"?"Em Progresso":"In Progress"}</th>
            <th style="text-align:center;padding:8px 10px;color:var(--t3);font-weight:600">${lang==="pt"?"A Fazer":"To Do"}</th>
            <th style="text-align:right;padding:8px 10px;color:var(--t3);font-weight:600">${lang==="pt"?"Taxa":"Rate"}</th>
          </tr>
        </thead>
        <tbody>
          ${byMem.map(m=>{
            const pct=m.total?Math.round(m.done/m.total*100):0;
            return`<tr style="border-bottom:1px solid var(--b1)">
              <td style="padding:10px 10px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:10px;height:10px;border-radius:50%;background:${m.color};flex-shrink:0"></div>
                  <span style="font-weight:600;color:var(--t)">${m.name}</span>
                </div>
              </td>
              <td style="text-align:center;padding:10px;color:var(--t2);font-family:var(--mono)">${m.total}</td>
              <td style="text-align:center;padding:10px;color:#22c55e;font-family:var(--mono);font-weight:700">${m.done}</td>
              <td style="text-align:center;padding:10px;color:#6366f1;font-family:var(--mono)">${m.inprog}</td>
              <td style="text-align:center;padding:10px;color:var(--t3);font-family:var(--mono)">${m.todo}</td>
              <td style="text-align:right;padding:10px">
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                  <div style="width:60px;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${m.color};border-radius:3px"></div>
                  </div>
                  <span style="font-weight:700;color:${m.color};font-family:var(--mono);min-width:32px;text-align:right">${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Por projeto + resumo -->
  <div class="g2" style="margin-bottom:18px">
    <div class="card">
      <div class="clabel">${lang==="pt"?"Por Projeto":"By Project"}</div>
      ${S.projects.map(p=>{
        const pt=t.filter(x=>x.project===p.id),d=pt.filter(x=>x.status==="Concluído").length;
        const pct=pt.length?Math.round(d/pt.length*100):0;
        return`<div class="proj-r">
          <div class="proj-ico" style="background:${p.color}18">${p.icon}</div>
          <div style="flex:1"><div class="proj-rname">${p.name}</div>
          <div style="margin-top:4px"><div class="prog"><div class="prog-fill" style="width:${pct}%;background:${p.color}"></div></div></div>
          <div class="proj-rsub">${d}/${pt.length} · ${pct}%</div></div>
          <div class="proj-pct" style="color:${p.color}">${pct}%</div>
        </div>`;
      }).join("")}
    </div>
    <div class="card">
      <div class="clabel">${lang==="pt"?"Resumo Geral":"General Summary"}</div>
      ${[
        {l:lang==="pt"?"Total de tarefas":"Total tasks",   v:total},
        {l:lang==="pt"?"Concluídas":"Completed",           v:bySt["Concluído"]},
        {l:lang==="pt"?"Taxa de conclusão":"Completion",   v:rate+"%"},
        {l:lang==="pt"?"Em atraso":"Overdue",              v:overdue},
        {l:lang==="pt"?"Membros":"Members",                v:S.users.length},
        {l:lang==="pt"?"Projetos ativos":"Active projects",v:S.projects.filter(p=>p.status==="active").length},
        {l:lang==="pt"?"Eventos":"Events",                 v:S.events.length},
        {l:lang==="pt"?"Notas":"Notes",                    v:S.notes.length}
      ].map(s=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--b1)">
        <span style="font-size:12.5px;color:var(--t2)">${s.l}</span>
        <strong style="font-family:var(--mono);font-size:13px;color:var(--t)">${s.v}</strong>
      </div>`).join("")}
    </div>
  </div>

  <div class="card" style="margin-top:0">
    <div class="shd" style="margin-bottom:14px">
      <div class="stitle">${T("activityHistory")}</div>
    </div>
    ${renderHistory()}
  </div>`;

  // Inicializar gráficos
  requestAnimationFrame(()=>initReportCharts(byMem, bySt));
}

let _chartMember=null, _chartStatusRep=null;
function initReportCharts(byMem, bySt){
  const isDark = document.documentElement.getAttribute("data-theme")!=="light";
  const gridColor = isDark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)";
  const textColor = isDark?"#8888aa":"#666";
  const lang = S.lang||"pt";

  if(_chartMember){ _chartMember.destroy(); _chartMember=null; }
  if(_chartStatusRep){ _chartStatusRep.destroy(); _chartStatusRep=null; }

  // Gráfico barras empilhadas por membro
  const mCtx = document.getElementById("chart-member");
  if(mCtx && byMem.length){
    _chartMember = new Chart(mCtx, {
      type:"bar",
      data:{
        labels: byMem.map(m=>m.short),
        datasets:[
          {label:lang==="pt"?"Concluídas":"Done",    data:byMem.map(m=>m.done),   backgroundColor:"rgba(34,197,94,.75)",   borderRadius:3},
          {label:lang==="pt"?"Em Progresso":"In Prog",data:byMem.map(m=>m.inprog),backgroundColor:"rgba(99,102,241,.75)",  borderRadius:3},
          {label:lang==="pt"?"A Fazer":"To Do",       data:byMem.map(m=>m.todo),   backgroundColor:"rgba(156,163,175,.4)",  borderRadius:3},
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:textColor,font:{size:11}}},tooltip:{mode:"index"}},
        scales:{
          x:{stacked:true,ticks:{color:textColor,font:{size:11}},grid:{color:gridColor}},
          y:{stacked:true,ticks:{color:textColor,font:{size:11},stepSize:1},grid:{color:gridColor},beginAtZero:true}
        }
      }
    });
  }

  // Donut por estado
  const sCtx = document.getElementById("chart-status-rep");
  if(sCtx){
    const labels = Object.keys(bySt);
    const data   = Object.values(bySt);
    const colors = labels.map(l=>SC[l]||"#666");
    _chartStatusRep = new Chart(sCtx, {
      type:"doughnut",
      data:{labels, datasets:[{data, backgroundColor:colors.map(c=>c+"cc"), borderColor:colors, borderWidth:2, hoverOffset:6}]},
      options:{
        responsive:true, maintainAspectRatio:false, cutout:"68%",
        plugins:{legend:{position:"bottom",labels:{color:textColor,font:{size:11},padding:12}}}
      }
    });
  }
}


// ── EXPORTAR PDF (via Print Dialog) ────────────
function exportPDF(){
  toast("A gerar PDF...","i");
  // Usar jsPDF via CDN
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  script.onload = ()=>_generatePDF();
  if(window.jspdf) { _generatePDF(); return; }
  document.head.appendChild(script);
}

function _generatePDF(){
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    const t = S.tasks, total = t.length;
    const bySt = Object.fromEntries(COLS.map(c=>[c,t.filter(x=>x.status===c).length]));
    const rate = Math.round(bySt["Concluído"]/(total||1)*100);
    const now = new Date().toLocaleDateString("pt-PT",{day:"2-digit",month:"long",year:"numeric"});
    const W = 210, M = 18;

    // ── Fundo header ──
    doc.setFillColor(13,13,26);
    doc.rect(0,0,W,38,"F");

    // ── Logo / Título ──
    doc.setTextColor(255,255,255);
    doc.setFontSize(22); doc.setFont("helvetica","bold");
    doc.text("⚡ TaskFlow",M,16);
    doc.setFontSize(11); doc.setFont("helvetica","normal");
    doc.setTextColor(160,160,200);
    doc.text("Relatório de Produtividade",M,24);
    doc.text(now, W-M, 24, {align:"right"});

    // ── Linha separadora ──
    doc.setDrawColor(99,102,241);
    doc.setLineWidth(0.8);
    doc.line(0,38,W,38);

    let y = 50;

    // ── KPIs ──
    doc.setFillColor(26,26,53);
    const kpis = [
      {l:"Total",      v:String(total),            c:[99,102,241]},
      {l:"Concluídas", v:String(bySt["Concluído"]),c:[34,197,94]},
      {l:"Em Progresso",v:String(bySt["Em Progresso"]),c:[59,130,246]},
      {l:"Taxa",        v:rate+"%",                c:[245,158,11]},
    ];
    const kw = (W-M*2-9)/4;
    kpis.forEach((k,i)=>{
      const kx = M + i*(kw+3);
      doc.setFillColor(26,26,53); doc.roundedRect(kx,y,kw,20,2,2,"F");
      doc.setFillColor(...k.c); doc.roundedRect(kx,y,kw,2,1,1,"F");
      doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.setTextColor(...k.c);
      doc.text(k.v, kx+kw/2, y+12, {align:"center"});
      doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(150,150,180);
      doc.text(k.l, kx+kw/2, y+18, {align:"center"});
    });
    y += 28;

    // ── Projetos ──
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(200,200,240);
    doc.text("Projetos", M, y); y += 6;
    doc.setFillColor(26,26,53); doc.rect(M,y,W-M*2,0.5,"F"); y += 5;

    S.projects.filter(p=>p.status!=="archived").forEach(p=>{
      const pt=t.filter(x=>x.project===p.id), d=pt.filter(x=>x.status==="Concluído").length;
      const pct = pt.length ? Math.round(d/pt.length*100) : 0;
      doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(220,220,255);
      doc.text(p.name, M, y);
      doc.setFont("helvetica","normal"); doc.setTextColor(120,120,160);
      doc.text(`${d}/${pt.length} tarefas · ${pct}%`, W-M, y, {align:"right"});
      // Barra de progresso
      doc.setFillColor(40,40,70); doc.roundedRect(M,y+2,W-M*2,3,1,1,"F");
      const hex = p.color?.replace("#","");
      const pr = hex ? [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)] : [99,102,241];
      doc.setFillColor(...pr);
      if(pct>0) doc.roundedRect(M,y+2,(W-M*2)*pct/100,3,1,1,"F");
      y += 10;
      if(y > 265) { doc.addPage(); y = 20; }
    });
    y += 4;

    // ── Tabela de membros ──
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(200,200,240);
    doc.text("Membros da Equipa", M, y); y += 6;

    // Header tabela
    const cols2 = [{h:"Nome",w:55},{h:"Cargo",w:30},{h:"Total",w:20},{h:"Concluídas",w:30},{h:"Taxa",w:25}];
    doc.setFillColor(30,30,60); doc.rect(M,y,W-M*2,7,"F");
    let cx = M+2;
    cols2.forEach(c=>{
      doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(140,140,200);
      doc.text(c.h,cx,y+5); cx+=c.w;
    });
    y+=7;

    S.users.forEach((u,idx)=>{
      const ut=t.filter(x=>x.assignee===u.id), d=ut.filter(x=>x.status==="Concluído").length;
      const pct=ut.length?Math.round(d/ut.length*100):0;
      doc.setFillColor(idx%2===0?22:26, idx%2===0?22:26, idx%2===0?44:53);
      doc.rect(M,y,W-M*2,7,"F");
      cx=M+2;
      const vals=[u.name,u.role,String(ut.length),String(d),pct+"%"];
      vals.forEach((v,vi)=>{
        doc.setFontSize(9); doc.setFont("helvetica",vi===0?"bold":"normal");
        doc.setTextColor(vi===0?220:170, vi===0?220:170, vi===0?255:200);
        doc.text(v,cx,y+5); cx+=cols2[vi].w;
      });
      y+=7;
      if(y>270){doc.addPage();y=20;}
    });
    y += 6;

    // ── Lista de tarefas ──
    if(y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(200,200,240);
    doc.text("Tarefas (últimas 20)", M, y); y += 6;

    const tcols = [{h:"Título",w:70},{h:"Estado",w:32},{h:"Prioridade",w:28},{h:"Responsável",w:35},{h:"Prazo",w:20}];
    doc.setFillColor(30,30,60); doc.rect(M,y,W-M*2,7,"F");
    cx=M+2;
    tcols.forEach(c=>{ doc.setFontSize(8);doc.setFont("helvetica","bold");doc.setTextColor(140,140,200);doc.text(c.h,cx,y+5);cx+=c.w; });
    y+=7;

    t.slice(0,20).forEach((tk,idx)=>{
      const u=S.users.find(x=>x.id===tk.assignee);
      doc.setFillColor(idx%2===0?22:26,idx%2===0?22:26,idx%2===0?44:53);
      doc.rect(M,y,W-M*2,7,"F");
      cx=M+2;
      const vals=[tk.title.slice(0,35),tk.status,PRIO[tk.priority]?.l||"—",u?.name?.split(" ")[0]||"—",tk.deadline||"—"];
      const statusC = tk.status==="Concluído"?[34,197,94]:tk.status==="Em Progresso"?[59,130,246]:[107,114,128];
      vals.forEach((v,vi)=>{
        doc.setFontSize(8.5);doc.setFont("helvetica",vi===0?"bold":"normal");
        doc.setTextColor(vi===1?statusC[0]:180,vi===1?statusC[1]:180,vi===1?statusC[2]:200);
        doc.text(v,cx,y+5);cx+=tcols[vi].w;
      });
      y+=7;
      if(y>270){doc.addPage();y=20;}
    });

    // ── Rodapé ──
    const pages = doc.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setFillColor(13,13,26); doc.rect(0,287,W,10,"F");
      doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(80,80,120);
      doc.text("TaskFlow — Relatório gerado automaticamente",M,293);
      doc.text(`Página ${i}/${pages}`,W-M,293,{align:"right"});
    }

    doc.save(`TaskFlow_Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
    toast("✅ PDF exportado!","s");
  } catch(e){
    console.error(e);
    toast("Erro ao gerar PDF: "+e.message,"e");
  }
}


function exportCSV(){
  const rows=[["Título","Estado","Prioridade","Responsável","Projeto","Prazo","Tags"]];
  S.tasks.forEach(t=>{
    const u=S.users.find(x=>x.id===t.assignee),proj=S.projects.find(p=>p.id===t.project);
    rows.push([`"${t.title}"`,t.status,PRIO[t.priority]?.l||"",u?.name||"",proj?.name||"",t.deadline||"",t.tags?.join(";")]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`taskflow_tarefas_${tday()}.csv`; a.click();
  toast("CSV exportado!","s");
}

// ─────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────
function setStab(t){ S.stab=t; renderSettings(); }

function renderSettings(){
  const isAdmin = S.user?.role==="admin";
  document.getElementById("v-settings").innerHTML=`
  <div class="stitle" style="margin-bottom:18px">Definições</div>
  <div class="stg-layout">
    <div class="stg-nav">
      ${[["perfil","👤 Perfil"],["segurança","🔒 Segurança"],["notificações","🔔 Notificações"],["ia","🤖 Gemini AI"],["integracoes","🔗 Integrações"],["aparência","🎨 Aparência"],["equipa","👥 Equipa"],...(isAdmin?[["admin","⚙️ Admin"]]:[])]
        .map(([k,l])=>`<div class="stg-item ${S.stab===k?"on":""}" onclick="setStab('${k}')">${l}</div>`).join("")}
    </div>
    <div id="stg-body"></div>
  </div>`;
  renderStgPanel();
}

function renderStgPanel(){
  const u=S.user,r=ROLES[u?.role];
  const el=document.getElementById("stg-body"); if(!el)return;
  if(S.stab==="perfil"){
    el.innerHTML=`<div class="stg-block"><h4>Informações Pessoais</h4>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div class="av lg" style="background:${u?.color}">${u?.avatar}</div>
        <div><div style="font-size:16px;font-weight:700">${u?.name}</div><div style="font-size:12px;color:var(--t3);margin-top:3px">${u?.email}</div><div class="role-tag" style="color:${r?.c};margin-top:6px">${r?.i} ${r?.l}</div></div>
      </div>
      <div class="frow"><div class="fg"><label>Nome</label><input class="fi" id="s-name" value="${u?.name||""}"/></div><div class="fg"><label>Departamento</label><input class="fi" id="s-dept" value="${u?.department||""}"/></div></div>
      <div class="frow mt10"><div class="fg"><label>Telefone</label><input class="fi" id="s-phone" value="${u?.phone||""}"/></div><div class="fg"><label>Localização</label><input class="fi" id="s-loc" value="${u?.location||""}"/></div></div>
      <div class="fg mt10"><label>Bio</label><textarea class="fi" id="s-bio" rows="3">${u?.bio||""}</textarea></div>
      <div class="fg mt10"><label>Skills (separadas por vírgula)</label><input class="fi" id="s-skills" value="${(u?.skills||[]).join(", ")}"/></div>
      <button class="btn-solid" style="margin-top:14px" onclick="saveProfile()">Guardar</button>
    </div>`;
  } else if(S.stab==="segurança"){
    const isGoogle = S.user?.google_id;
    el.innerHTML=`<div class="stg-block"><h4>Alterar Password</h4>
      ${isGoogle?`<div style="padding:12px;background:var(--bg3);border-radius:8px;font-size:12.5px;color:var(--t3);margin-bottom:16px">⚠️ A tua conta usa Google OAuth — não tens password para alterar.</div>`:`
      <div class="fg"><label>Password atual</label><input class="fi" type="password" id="s-cp"/></div>
      <div class="fg mt10"><label>Nova password</label><input class="fi" type="password" id="s-np" placeholder="Mínimo 6 caracteres"/></div>
      <div class="fg mt10"><label>Confirmar</label><input class="fi" type="password" id="s-np2"/></div>
      <button class="btn-solid" style="margin-top:14px" onclick="savePw()">Atualizar</button>`}
    </div>
    <div class="stg-block" style="margin-top:16px;border:1px solid rgba(239,68,68,.2);border-radius:12px;padding:20px">
      <h4 style="color:var(--err);margin-bottom:8px">⚠️ Zona de Perigo</h4>
      <p style="font-size:12.5px;color:var(--t3);margin-bottom:14px;line-height:1.6">Ao eliminares a conta, todos os teus dados serão apagados permanentemente. Esta ação não pode ser desfeita.</p>
      <button class="btn-err" onclick="confirmDeleteAccount()">🗑️ Eliminar a minha conta</button>
    </div>`;
  } else if(S.stab==="notificações"){
    const pushEnabled = Notification?.permission==="granted" && localStorage.getItem(PUSH_KEY);
    const pushSupported = "Notification" in window;
    el.innerHTML=`<div class="stg-block"><h4>Notificações</h4>
      ${[{l:"Alertas de deadline",d:"Antes do prazo expirar",on:true},{l:"Novas atribuições",d:"Quando uma tarefa é atribuída a ti",on:true},{l:"Comentários",d:"Novos comentários nas tuas tarefas",on:true},{l:"Menções @",d:"Quando és mencionado",on:false},{l:"Email semanal",d:"Resumo semanal de progresso",on:true}].map(n=>`<div class="trow"><div><div class="trow-lbl">${n.l}</div><div class="trow-desc">${n.d}</div></div><div class="toggle ${n.on?"on":"off"}" onclick="this.classList.toggle('on');this.classList.toggle('off')"><div class="toggle-b"></div></div></div>`).join("")}
    </div>
    <div class="stg-block" style="margin-top:16px">
      <h4>🔔 Notificações Push do Browser</h4>
      <p style="font-size:12.5px;color:var(--t3);margin-bottom:14px;line-height:1.6">
        Recebe alertas mesmo quando não estás na página — prazos, menções e novas tarefas.
      </p>
      ${!pushSupported ? `<div style="font-size:12px;color:var(--err)">⚠️ O teu browser não suporta notificações push.</div>` :
        pushEnabled ? `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;margin-bottom:12px">
          <span style="font-size:20px">✅</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--ok)">Notificações push ativas</div>
            <div style="font-size:11.5px;color:var(--t3)">Receberás alertas mesmo sem a página aberta</div>
          </div>
          <button class="btn-ghost" style="font-size:12px;padding:5px 12px" onclick="disablePush()">Desativar</button>
        </div>` : `
        <button class="btn-cta" style="padding:10px 20px" onclick="requestPushPermission()">
          🔔 Ativar notificações push
        </button>
        <div style="font-size:11px;color:var(--t3);margin-top:8px">O browser irá pedir permissão.</div>`
      }
    </div>
    <div class="stg-block" style="margin-top:16px">
      <h4>🗺️ Tour Guiado</h4>
      <p style="font-size:12.5px;color:var(--t3);margin-bottom:14px;line-height:1.6">
        Faz um tour interativo pelas principais funcionalidades do TaskFlow.
      </p>
      <button class="btn-ghost" style="padding:9px 20px" onclick="localStorage.removeItem('${TOUR_KEY}');startTour(true);nav('dashboard')">
        ▶ Iniciar tour guiado
      </button>
    </div>`;
  } else if(S.stab==="ia"){
    el.innerHTML=`<div class="stg-block"><h4>🤖 Gemini AI</h4>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.18);border-radius:9px;padding:14px;margin-bottom:16px;font-size:12.5px;color:var(--t2);line-height:1.7">
        <strong style="color:var(--a3)">Como obter a chave Gemini (grátis):</strong><br>
        1. Vai a <a href="https://aistudio.google.com" target="_blank" style="color:var(--a3);text-decoration:underline">aistudio.google.com</a><br>
        2. Clica em <strong>Get API Key</strong> → <strong>Create API key</strong><br>
        3. Copia a chave e cola abaixo<br>
        4. Clica em Guardar — o assistente fica imediatamente disponível
      </div>
      <div class="fg"><label>Chave API Gemini</label>
        <input class="fi" id="s-gem" type="password" placeholder="AIzaSy..." value="${S.hasGemini?"(configurada — substitui para alterar)":""}"/>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-solid" onclick="saveGemini()">Guardar & Ativar</button>
        ${S.hasGemini?`<button class="btn-err" onclick="clearGemini()">Remover chave</button>`:""}
      </div>
      <div style="margin-top:14px;font-size:11.5px;color:var(--t3)">Modelo: gemini-1.5-flash · A chave é processada apenas no servidor local.</div>
    </div>`;
  } else if(S.stab==="integracoes"){
    el.innerHTML=`<div class="stg-block"><h4>🔗 Google OAuth (Login com Google)</h4>
      <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.18);border-radius:9px;padding:14px;margin-bottom:16px;font-size:12.5px;color:var(--t2);line-height:1.7">
        <strong style="color:var(--a3)">Como ativar o Login com Google:</strong><br>
        1. Vai a <a href="https://console.cloud.google.com" target="_blank" style="color:var(--a3);text-decoration:underline">console.cloud.google.com</a><br>
        2. Cria um projeto → <strong>APIs & Services</strong> → <strong>OAuth 2.0</strong><br>
        3. Authorized origins: <code style="background:var(--bg3);padding:1px 6px;border-radius:4px">http://127.0.0.1:5000</code> e <code style="background:var(--bg3);padding:1px 6px;border-radius:4px">http://localhost:5000</code><br>
        4. Copia o <strong>Client ID</strong> (termina em .apps.googleusercontent.com)
      </div>
      <div class="fg"><label>Google Client ID</label><input class="fi" id="s-gcid" placeholder="*.apps.googleusercontent.com" value="${S.gcid||""}"/></div>
      <button class="btn-solid" style="margin-top:12px" onclick="saveGCID()">Guardar e Recarregar</button>
    </div>
    <div class="stg-block" style="margin-top:16px">
      <h4>📅 Google Calendar</h4>
      <p style="font-size:12.5px;color:var(--t3);margin-bottom:14px;line-height:1.6">
        Sincroniza os teus eventos do TaskFlow com o Google Calendar.
      </p>
      ${isGcalConnected() ? `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;margin-bottom:14px">
          <span style="font-size:22px">✅</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--ok)">Google Calendar ligado</div>
            <div style="font-size:11.5px;color:var(--t3)">Podes exportar e importar eventos</div>
          </div>
          <button class="btn-ghost" style="font-size:12px" onclick="disconnectGcal()">Desligar</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-cta" style="padding:9px 18px" onclick="syncAllEventsToGcal()">⬆️ Exportar todos os eventos</button>
          <button class="btn-ghost" style="padding:9px 18px" onclick="importGcalEvents()">⬇️ Importar próximos 30 dias</button>
        </div>
      ` : `
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:14px;font-size:12px;color:var(--t3);line-height:1.7">
          Exporta eventos para o Google Calendar e importa eventos para o TaskFlow. O botão irá pedir autenticação Google.
        </div>
        <button class="btn-cta" style="padding:10px 20px;display:flex;align-items:center;gap:8px" onclick="connectGcal()">
          <span style="font-size:16px">📅</span> Ligar Google Calendar
        </button>
      `}
    </div>`;
  } else if(S.stab==="aparência"){
    el.innerHTML=`<div class="stg-block"><h4>Aparência</h4>
      ${[{l:"Tema",v:"Dark Mode"},{l:"Fonte",v:"Inter"},{l:"Idioma",v:"Português (PT)"},{l:"Fuso horário",v:"Europe/Lisbon"},{l:"Versão",v:"TaskFlow v5.0"}].map(s=>`<div class="trow"><span class="trow-lbl">${s.l}</span><span style="font-size:13px;color:var(--t2)">${s.v}</span></div>`).join("")}
    </div>
    <div class="stg-block" style="margin-top:16px">
      <h4>🏷️ Etiquetas Personalizadas</h4>
      <p style="font-size:12.5px;color:var(--t3);margin-bottom:14px;line-height:1.6">Cria e gere etiquetas personalizadas para organizar as tuas tarefas.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${TAGS.map(t=>`<span style="font-size:12px;padding:4px 10px;border-radius:6px;background:${t.c}18;color:${t.c};font-weight:600">${t.l}</span>`).join("")}
      </div>
      <button class="btn-ghost" onclick="openTagManager()">✏️ Gerir etiquetas</button>
    </div>`;
  } else if(S.stab==="equipa"){
    const isAdmin=S.user?.role==="admin" || S.user?.role==="manager";
    const canInvite = true; // qualquer utilizador pode convidar
    el.innerHTML=`<div class="stg-block">
      ${canInvite ? `
      <h4>Convidar para a equipa</h4>
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        <input class="fi" id="inv-send-email" placeholder="email@exemplo.com" style="flex:2;min-width:180px"/>
        <select class="fi" id="inv-send-role" style="flex:1;min-width:120px">
          ${Object.entries(ROLES).filter(([k])=>k!=="admin").map(([k,v])=>`<option value="${k}">${v.i} ${v.l}</option>`).join("")}
        </select>
        <button class="btn-cta" id="inv-send-btn" style="padding:9px 18px;white-space:nowrap" onclick="sendInvite()">📧 Enviar convite</button>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:24px;padding:10px 12px;background:var(--bg3);border-radius:8px">
        💡 O convidado receberá um email com link para criar a conta e entrar diretamente na equipa.
      </div>
      <div style="border-top:1px solid var(--b1);padding-top:16px;margin-bottom:12px"></div>
      ` : ""}
      <h4 style="margin-bottom:12px">Membros da Equipa</h4>
      ${S.users.map(u=>`<div style="display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--b1)">
        <div class="av sm" style="background:${u.color}">${u.avatar}</div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${u.name}</div><div style="font-size:11px;color:var(--t3)">${u.email}</div></div>
        ${isAdmin?`<select class="fi" style="width:130px;padding:5px 8px;font-size:12px" onchange="changeRole('${u.id}',this.value)">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u.role===k?"selected":""}>${v.i} ${v.l}</option>`).join("")}</select>`:`<div class="role-tag" style="color:${ROLES[u.role]?.c}">${ROLES[u.role]?.i} ${ROLES[u.role]?.l}</div>`}
        <button class="btn-ghost" style="padding:4px 10px;font-size:12px" onclick="openProfile('${u.id}')">Ver</button>
      </div>`).join("")}
    </div>`;
  } else if(S.stab==="admin"){
    if(S.user?.role!=="admin"){ el.innerHTML=`<div class="empty-st"><div class="empty-i">🔒</div><div class="empty-t">Sem permissão</div></div>`; return; }

    el.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--b1);padding-bottom:14px">
      ${["stats","users","activity","system"].map((t,i)=>`
        <button onclick="setAdminTab('${t}')" id="atab-${t}" style="padding:7px 16px;border-radius:8px;border:none;cursor:pointer;font-size:12.5px;font-weight:600;background:${i===0?"var(--a)":"var(--bg3)"};color:${i===0?"#fff":"var(--t3)"}">
          ${{stats:"📊 Estatísticas",users:"👥 Utilizadores",activity:"📋 Atividade",system:"⚙️ Sistema"}[t]}
        </button>`).join("")}
    </div>
    <div id="admin-tab-content">A carregar...</div>`;

    loadAdminTab("stats");
  }
}

async function setAdminTab(tab){
  document.querySelectorAll("[id^='atab-']").forEach(b=>{
    b.style.background = b.id===`atab-${tab}` ? "var(--a)" : "var(--bg3)";
    b.style.color = b.id===`atab-${tab}` ? "#fff" : "var(--t3)";
  });
  await loadAdminTab(tab);
}

async function loadAdminTab(tab){
  const el = document.getElementById("admin-tab-content");
  if(!el) return;
  el.innerHTML=`<div style="padding:20px;text-align:center;color:var(--t3)">A carregar...</div>`;

  if(tab==="stats"){
    const r = await api("/api/admin/stats");
    if(r.error){ el.innerHTML=`<div style="color:var(--err)">${r.error}</div>`; return; }
    const fmtT = s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h?`${h}h ${m}min`:`${m}min`; };
    const rate = Math.round((r.doneTasks/(r.totalTasks||1))*100);
    el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">
      ${[
        {i:"👥",l:"Utilizadores",v:r.totalUsers,c:"var(--a)"},
        {i:"📋",l:"Total Tarefas",v:r.totalTasks,c:"var(--a3)"},
        {i:"✅",l:"Concluídas",v:r.doneTasks+" ("+rate+"%)",c:"var(--ok)"},
        {i:"🚨",l:"Em Atraso",v:r.overdue,c:r.overdue>0?"var(--err)":"var(--ok)"},
        {i:"📁",l:"Projetos Ativos",v:r.activeProjects+"/"+r.totalProjects,c:"var(--a)"},
        {i:"💬",l:"Msgs Chat",v:r.chatMessages,c:"#06b6d4"},
        {i:"⏱️",l:"Tempo Registado",v:fmtT(r.totalTimeSecs),c:"#f59e0b"},
        {i:"📎",l:"Anexos",v:r.attachments,c:"#8b5cf6"},
      ].map(s=>`<div style="background:var(--bg3);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
        <span style="font-size:24px">${s.i}</span>
        <div>
          <div style="font-size:20px;font-weight:800;color:${s.c}">${s.v}</div>
          <div style="font-size:11px;color:var(--t3)">${s.l}</div>
        </div>
      </div>`).join("")}
    </div>
    <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:13px;font-weight:600">📧 Lembretes de Prazo</div>
        <div style="font-size:11.5px;color:var(--t3)">Envia emails para tarefas com prazo hoje, amanhã ou em 3 dias</div>
      </div>
      <button class="btn-cta" style="padding:8px 16px;font-size:12px" onclick="testReminders(this)">▶ Testar agora</button>
    </div>
    <div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:14px">
      <div style="font-size:12px;color:var(--t3);line-height:1.8">
        📊 <strong style="color:var(--t)">${r.historyChanges}</strong> alterações registadas no histórico ·
        ⚡ <strong style="color:var(--t)">TaskFlow v8</strong> — Python/Flask + SQLite
      </div>
    </div>`;

  } else if(tab==="users"){
    el.innerHTML=`
    <div style="margin-bottom:12px;font-size:13px;font-weight:600;color:var(--t2)">${S.users.length} utilizadores registados</div>
    ${S.users.map(u=>{
      const ut=S.tasks.filter(t=>t.assignee===u.id);
      const done=ut.filter(t=>t.status==="Concluído").length;
      const pct=ut.length?Math.round(done/ut.length*100):0;
      return`<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg3);border-radius:10px;margin-bottom:8px">
        <div class="av sm" style="background:${u.color}">${u.picture?`<img src="${u.picture}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:u.avatar}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">
            ${u.name}
            <span style="font-size:10px;padding:2px 7px;border-radius:5px;background:${ROLES[u.role]?.c}18;color:${ROLES[u.role]?.c}">${ROLES[u.role]?.l}</span>
          </div>
          <div style="font-size:11px;color:var(--t3)">${u.email}</div>
          <div style="margin-top:5px;display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:4px;background:var(--b1);border-radius:2px"><div style="width:${pct}%;height:4px;background:${u.color};border-radius:2px;transition:width .4s"></div></div>
            <span style="font-size:10.5px;color:var(--t3)">${done}/${ut.length} · ${pct}%</span>
          </div>
        </div>
        <select class="fi" style="width:120px;padding:4px 8px;font-size:12px" onchange="adminChangeRole('${u.id}',this.value)">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u.role===k?"selected":""}>${v.i} ${v.l}</option>`).join("")}
        </select>
        ${u.id!==S.user.id?`<button class="btn-err" style="padding:4px 10px;font-size:11.5px" onclick="adminDeleteUser('${u.id}','${u.name}')">🗑️</button>`:`<div style="width:52px"></div>`}
      </div>`;
    }).join("")}`;

  } else if(tab==="activity"){
    await renderGlobalActivity(el);

  } else if(tab==="system"){
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px">
      ${[
        {i:"🐍",l:"Backend",v:"Python 3 + Flask"},
        {i:"🗄️",l:"Base de dados",v:"SQLite — taskflow.db"},
        {i:"🔐",l:"Autenticação",v:"Sessions + Google OAuth 2.0"},
        {i:"🤖",l:"IA",v:"Gemini 2.5 Flash (Google)"},
        {i:"📧",l:"Email",v:"SMTP via Gmail"},
        {i:"🌐",l:"Frontend",v:"HTML/CSS/JS SPA + Chart.js"},
        {i:"📡",l:"API REST",v:"56 rotas"},
        {i:"📊",l:"Tabelas DB",v:"11 tabelas SQLite"},
      ].map(s=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg3);border-radius:9px">
        <span style="font-size:20px;width:28px;text-align:center">${s.i}</span>
        <span style="font-size:12.5px;color:var(--t3);width:130px">${s.l}</span>
        <span style="font-size:13px;font-weight:600;color:var(--t)">${s.v}</span>
      </div>`).join("")}
    </div>`;
  }
}

async function renderGlobalActivity(container){
  const activity = await api("/api/activity");
  if(!Array.isArray(activity)||!activity.length){
    container.innerHTML=`<div class="empty-st"><div class="empty-i">📋</div><div class="empty-t">Sem atividade registada</div></div>`;
    return;
  }

  const typeColors = {task:"var(--a)",project:"var(--ok)",user:"#f59e0b",note:"#8b5cf6",event:"#06b6d4"};
  const grouped = {};
  activity.forEach(a=>{
    const date = (a.created||"").slice(0,10)||"—";
    if(!grouped[date]) grouped[date]=[];
    grouped[date].push(a);
  });

  container.innerHTML=`
  <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:13px;font-weight:600;color:var(--t2)">${activity.length} ações registadas</div>
    <span style="font-size:11px;color:var(--t3)">Últimas 100</span>
  </div>
  ${Object.entries(grouped).slice(0,15).map(([date,acts])=>`
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <span>${fmtDate(date)}</span>
        <div style="flex:1;height:1px;background:var(--b1)"></div>
        <span>${acts.length} ação${acts.length>1?"ões":""}</span>
      </div>
      ${acts.map(a=>{
        const color = typeColors[a.type]||"var(--t3)";
        const time = a.created ? new Date(a.created).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}) : "";
        return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
          <div class="av sm" style="background:${a.userColor||"#444"};flex-shrink:0">${a.userAvatar||"?"}</div>
          <div style="flex:1;min-width:0;font-size:12.5px;line-height:1.5">
            <strong style="color:var(--t)">${a.userName||"Sistema"}</strong>
            <span style="color:var(--t3)"> ${a.action} </span>
            <span style="color:${color};font-weight:600">"${(a.target||"").slice(0,40)}"</span>
          </div>
          <span style="font-size:15px;flex-shrink:0">${a.icon||"📋"}</span>
          <span style="font-size:10px;color:var(--t3);font-family:var(--mono);flex-shrink:0">${time}</span>
        </div>`;
      }).join("")}
    </div>
  `).join("")}`;
}


async function testReminders(btn){
  btn.disabled=true; btn.textContent="A verificar...";
  const r = await api("/api/test-reminders");
  btn.disabled=false; btn.textContent="▶ Testar agora";
  if(r.ok) toast("✅ "+r.message,"s");
  else toast(r.error||"Erro","e");
}

// ─── ELIMINAR CONTA ───────────────────────────
function confirmDeleteAccount(){
  const mo = document.createElement("div");
  mo.className = "mo";
  mo.innerHTML=`<div class="modal" style="max-width:400px;padding:28px">
    <div style="font-size:28px;margin-bottom:10px">⚠️</div>
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px">Eliminar conta?</h3>
    <p style="font-size:13px;color:var(--t3);line-height:1.6;margin-bottom:20px">Esta ação é <strong style="color:var(--err)">irreversível</strong>. Todos os teus dados serão apagados permanentemente.</p>
    <div class="fg" style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:600;color:var(--t2);display:block;margin-bottom:6px">Escreve <b style="color:var(--err)">ELIMINAR</b> para confirmar</label>
      <input class="fi" id="del-confirm-input" placeholder="ELIMINAR" oninput="document.getElementById('del-confirm-btn').disabled=this.value!=='ELIMINAR'"/>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn-ghost" style="flex:1" onclick="this.closest('.mo').remove()">Cancelar</button>
      <button id="del-confirm-btn" class="btn-err" style="flex:1" disabled onclick="doDeleteAccount(this)">Eliminar conta</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
}

async function doDeleteAccount(btn){
  btn.disabled=true; btn.textContent="A eliminar...";
  const r = await api(`/api/users/${S.user.id}`,"DELETE");
  if(r.error){ toast(r.error,"e"); btn.disabled=false; btn.textContent="Eliminar conta"; return; }
  document.querySelector(".mo")?.remove();
  toast("Conta eliminada. Até logo! 👋","i");
  setTimeout(()=>{ localStorage.removeItem("tf_u"); localStorage.removeItem("tf_creds"); location.reload(); }, 1500);
}

// ─── ADMIN FUNCTIONS ──────────────────────────
async function adminChangeRole(uid, role){
  await api(`/api/users/${uid}`,"PATCH",{role});
  const u = S.users.find(x=>x.id===uid); if(u) u.role=role;
  toast("Cargo atualizado!","s");
  renderSettings();
}

function adminDeleteUser(uid, name){
  const mo = document.createElement("div");
  mo.className = "mo";
  mo.innerHTML=`<div class="modal" style="max-width:380px;padding:28px">
    <div style="font-size:26px;margin-bottom:10px">🗑️</div>
    <h3 style="font-size:16px;font-weight:800;margin-bottom:8px">Eliminar utilizador?</h3>
    <p style="font-size:13px;color:var(--t3);line-height:1.6;margin-bottom:20px">Tens a certeza que queres eliminar <strong style="color:var(--t)">${name}</strong>? Esta ação não pode ser desfeita.</p>
    <div style="display:flex;gap:10px">
      <button class="btn-ghost" style="flex:1" onclick="this.closest('.mo').remove()">Cancelar</button>
      <button class="btn-err" style="flex:1" onclick="doAdminDeleteUser('${uid}',this)">Eliminar</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
}

async function doAdminDeleteUser(uid, btn){
  btn.disabled=true; btn.textContent="A eliminar...";
  const r = await api(`/api/users/${uid}`,"DELETE");
  document.querySelector(".mo")?.remove();
  if(r.error){ toast(r.error,"e"); return; }
  S.users = S.users.filter(u=>u.id!==uid);
  toast("Utilizador eliminado","s");
  renderSettings();
}

async function saveProfile(){
  const d={name:document.getElementById("s-name")?.value,department:document.getElementById("s-dept")?.value,phone:document.getElementById("s-phone")?.value,location:document.getElementById("s-loc")?.value,bio:document.getElementById("s-bio")?.value,skills:document.getElementById("s-skills")?.value.split(",").map(s=>s.trim()).filter(Boolean)};
  const r=await api(`/api/users/${S.user.id}`,"PATCH",d);
  if(r.error){toast(r.error,"e");return;}
  Object.assign(S.user,d); localStorage.setItem("tf_u",JSON.stringify(S.user));
  const ui=S.users.findIndex(u=>u.id===S.user.id); if(ui>=0)Object.assign(S.users[ui],d);
  updateSB(); toast("Perfil guardado!","s");
}

async function savePw(){
  const cp=document.getElementById("s-cp")?.value,np=document.getElementById("s-np")?.value,np2=document.getElementById("s-np2")?.value;
  if(np!==np2){toast("Passwords não coincidem","e");return;}
  const r=await api(`/api/users/${S.user.id}/password`,"PATCH",{current:cp,new:np});
  if(r.error){toast(r.error,"e");return;}
  toast("Password atualizada!","s");
}

async function saveGemini(){
  const k=document.getElementById("s-gem")?.value;
  if(!k||k.includes("configurada")){toast("Insere uma chave válida","w");return;}
  const r=await api("/api/config","PATCH",{gemini_api_key:k});
  if(r.ok){S.hasGemini=true;updateAIStatus();toast("Gemini AI ativado! ✨","s");renderSettings();}
}

async function clearGemini(){
  await api("/api/config","PATCH",{gemini_api_key:""});
  S.hasGemini=false;updateAIStatus();toast("Chave removida","i");renderSettings();
}

async function saveGCID(){
  const cid=document.getElementById("s-gcid")?.value;
  await api("/api/config","PATCH",{google_client_id:cid});
  S.gcid=cid; toast("Guardado! A recarregar...","s"); setTimeout(()=>location.reload(),1500);
}

// ─────────────────────────────────────────────────
//  TASK MODAIS
// ─────────────────────────────────────────────────
function openNewTask(){ openNewTaskStatus("A Fazer"); }
function openNewTaskStatus(status){
  S.newStatus=status; S.newSubs=[];
  document.getElementById("mt-title").value="";
  document.getElementById("mt-desc").value="";
  document.getElementById("mt-status").value=status;
  document.getElementById("mt-prio").value="medium";
  document.getElementById("mt-dl").value="";
  document.getElementById("mt-asgn").innerHTML=S.users.map(u=>`<option value="${u.id}">${u.name}</option>`).join("");
  document.getElementById("mt-proj").innerHTML=`<option value="">Nenhum</option>`+S.projects.map(p=>`<option value="${p.id}">${p.icon} ${p.name}</option>`).join("");
  document.getElementById("mt-tags").innerHTML=TAGS.map(t=>`<div class="topt" style="background:${t.c}18;color:${t.c}" data-id="${t.id}" onclick="this.classList.toggle('on')">${t.l}</div>`).join("");
  document.getElementById("mt-subs").innerHTML="";
  document.getElementById("mt-sub-i").value="";
  document.getElementById("mo-task").classList.remove("hidden");
}

function addSub(){const i=document.getElementById("mt-sub-i");if(!i.value.trim())return;S.newSubs.push({id:"s"+Date.now(),title:i.value.trim(),done:false});i.value="";renderNewSubs();}
function renderNewSubs(){document.getElementById("mt-subs").innerHTML=S.newSubs.map((s,i)=>`<div class="sub-row"><div class="sub-cb"></div><span class="sub-txt">${s.title}</span><span style="cursor:pointer;color:var(--t3);font-size:11px;margin-left:auto" onclick="S.newSubs.splice(${i},1);renderNewSubs()">✕</span></div>`).join("");}

async function submitTask(){
  const title=document.getElementById("mt-title").value.trim();
  if(!title){toast("Título obrigatório!","e");return;}
  const tags=[...document.querySelectorAll("#mt-tags .topt.on")].map(el=>el.dataset.id);
  const t={title,description:document.getElementById("mt-desc").value,status:document.getElementById("mt-status").value,priority:document.getElementById("mt-prio").value,assignee:document.getElementById("mt-asgn").value,deadline:document.getElementById("mt-dl").value,project:document.getElementById("mt-proj").value,tags,subtasks:S.newSubs};
  const r=await api("/api/tasks","POST",t);
  if(r.error){toast(r.error,"e");return;}
  closeMo("mo-task"); toast(`"${r.title}" criada! ✨`,"s");
  await refreshAll();
  setTimeout(async()=>{ S.notifs = await api("/api/notifications")||[]; updateNotifBadge(); }, 500);
}

// ─────────────────────────────────────────────────
//  TASK DETAIL
// ─────────────────────────────────────────────────
function openDetail(id){ const t=S.tasks.find(x=>x.id===id);if(!t)return; renderDetail(t); document.getElementById("mo-detail").classList.remove("hidden"); }

function renderDetail(t){
  const asgn=S.users.find(u=>u.id===t.assignee),proj=S.projects.find(p=>p.id===t.project);
  const dl=dleft(t.deadline),ds=t.subtasks?.filter(s=>s.done).length||0;
  document.getElementById("mo-detail-body").innerHTML=`
    <div class="mhd">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px">
          <div class="pri" style="background:${PRIO[t.priority]?.bg};color:${PRIO[t.priority]?.c}">${PRIO[t.priority]?.l}</div>
          ${t.tags?.map(tg=>{const g=TAGS.find(x=>x.id===tg);return g?`<span class="tag" style="background:${g.c}18;color:${g.c}">${g.l}</span>`:""}).join("")||""}
          ${proj?`<span style="font-size:10px;padding:2px 8px;background:${proj.color}18;color:${proj.color};border-radius:4px;font-weight:600">${proj.icon} ${proj.name}</span>`:""}
        </div>
        <h3 style="font-size:17px;font-weight:800;letter-spacing:-.2px;line-height:1.3">${t.title}</h3>
      </div>
      <button onclick="closeMo('mo-detail')">✕</button>
    </div>
    <div class="td-wrap">
      <div class="td-main">
        ${t.description?`<div style="background:var(--bg3);border-radius:8px;padding:13px;font-size:13px;color:var(--t2);line-height:1.65;margin-bottom:16px">${t.description}</div>`:""}
        ${t.subtasks?.length?`<div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:7px"><span style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px">Subtarefas</span><span style="font-size:11px;font-family:var(--mono);color:var(--t3)">${ds}/${t.subtasks.length}</span></div>
          <div class="prog" style="margin-bottom:9px"><div class="prog-fill" style="width:${t.subtasks.length?ds/t.subtasks.length*100:0}%;background:var(--a)"></div></div>
          ${t.subtasks.map(s=>`<div class="sub-row" onclick="toggleSub('${t.id}','${s.id}')" style="cursor:pointer"><div class="sub-cb ${s.done?"done":""}">${s.done?"✓":""}</div><span class="sub-txt ${s.done?"done":""}">${s.title}</span></div>`).join("")}
        </div>`:""}
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Comentários (${t.comments?.length||0})</div>
          ${!t.comments?.length?`<div style="font-size:12.5px;color:var(--t3);font-style:italic;margin-bottom:12px">Sem comentários.</div>`:""}
          ${t.comments?.map(c=>{const cu=S.users.find(x=>x.id===c.user);return`<div class="cmt-row"><div class="av sm" style="background:${cu?.color||"#666"}">${cu?.avatar||"?"}</div><div class="cmt-bd"><div><span class="cmt-name" onclick="openProfile('${c.user}')">${cu?.name||"?"}</span><span class="cmt-time">${timeAgo(c.created)}</span>${(S.user?.role==="admin"||c.user===S.user?.id)?`<button onclick="delCmt('${t.id}','${c.id}')" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:11px;margin-left:6px">✕</button>`:""}</div><div class="cmt-text">${c.text}</div></div></div>`;}).join("")}
          <div class="cmt-inp-row"><div class="av sm" style="background:${S.user?.color}">${S.user?.avatar}</div><input class="fi" id="ci-${t.id}" placeholder="Adicionar comentário..." style="flex:1" onkeydown="if(event.key==='Enter')postCmt('${t.id}')"/><button class="btn-xs" onclick="postCmt('${t.id}')">Enviar</button></div>
        </div>
        <!-- Tabs extra: Timer, Histórico, Anexos -->
        <div style="margin-top:8px">
          <div style="display:flex;gap:4px;border-bottom:1px solid var(--b1);margin-bottom:12px">
            ${["timer","history","attachments"].map(tab=>`<button onclick="loadDetailTab('${t.id}','${tab}')" id="dtab-${t.id}-${tab}" style="padding:7px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s">${{timer:"⏱️ Timer",history:"📋 Histórico",attachments:"📎 Anexos"}[tab]}</button>`).join("")}
          </div>
          <div id="detail-tab-content-${t.id}" style="min-height:60px">
            <div style="font-size:12px;color:var(--t3);padding:8px 0">Clica num separador para ver mais.</div>
          </div>
        </div>
      </div>
      <div class="td-side">
        <div class="td-mb"><div class="td-ml">Estado</div><select class="fi" style="padding:6px 10px;font-size:12.5px" onchange="patchT('${t.id}','status',this.value)">${COLS.map(c=>`<option ${t.status===c?"selected":""}>${c}</option>`).join("")}</select></div>
        <div class="td-mb"><div class="td-ml">Prioridade</div><select class="fi" style="padding:6px 10px;font-size:12.5px" onchange="patchT('${t.id}','priority',this.value)">${Object.entries(PRIO).map(([k,v])=>`<option value="${k}" ${t.priority===k?"selected":""}>${v.l}</option>`).join("")}</select></div>
        <div class="td-mb"><div class="td-ml">Responsável</div><div style="display:flex;align-items:center;gap:7px;cursor:pointer" onclick="openProfile('${t.assignee}')">${asgn?`<div class="av sm" style="background:${asgn.color}">${asgn.avatar}</div><span style="font-size:12.5px;font-weight:600">${asgn.name}</span>`:"<span style='color:var(--t3)'>—</span>"}</div></div>
        <div class="td-mb"><div class="td-ml">Prazo</div><div class="dl-b ${dl!==null&&dl<0?"r":dl!==null&&dl<=2?"w":""}" style="font-size:12.5px">${t.deadline?fmtDate(t.deadline):"—"}${dl!==null?`<div style="font-size:10.5px;margin-top:2px">${dl<0?Math.abs(dl)+"d atraso":dl===0?"Hoje!":dl+"d restantes"}</div>`:""}</div></div>
        ${proj?`<div class="td-mb"><div class="td-ml">Projeto</div><div style="display:flex;align-items:center;gap:6px"><div style="width:7px;height:7px;border-radius:50%;background:${proj.color}"></div><span style="font-size:12.5px">${proj.name}</span></div></div>`:""}
        <div class="td-mb"><div class="td-ml">Fixar</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="toggle ${t.pinned?"on":"off"}" onclick="patchT('${t.id}','pinned',${!t.pinned});this.classList.toggle('on');this.classList.toggle('off')"><div class="toggle-b"></div></div>
            <span style="font-size:12px;color:var(--t3)">${t.pinned?"Fixada":"Fixar"}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn-err" onclick="delTask('${t.id}')">🗑 Eliminar</button>
      <button class="btn-ghost" onclick="openDepsModal('${t.id}')" title="Dependências">🔗 Dependências${t.dependencies?.length?` (${t.dependencies.length})`:""}</button>
      <button class="btn-ghost" onclick="closeMo('mo-detail')">Fechar</button>
    </div>`;
}

async function patchT(id,f,v){ await api(`/api/tasks/${id}`,"PATCH",{[f]:v}); const t=S.tasks.find(x=>x.id===id);if(t)t[f]=v; updateSB(); render(S.view); }
async function toggleSub(tid,sid){ const r=await api(`/api/tasks/${tid}/subtask/${sid}`,"PATCH"); const t=S.tasks.find(x=>x.id===tid); if(t){const s=t.subtasks.find(x=>x.id===sid);if(s)s.done=r.done;} renderDetail(t); }
async function postCmt(tid){ const i=document.getElementById("ci-"+tid);if(!i?.value.trim())return; const r=await api(`/api/tasks/${tid}/comment`,"POST",{text:i.value}); const t=S.tasks.find(x=>x.id===tid);if(t)t.comments.push(r); i.value=""; renderDetail(t); }
async function delCmt(tid,cid){ await api(`/api/tasks/${tid}/comment/${cid}`,"DELETE"); const t=S.tasks.find(x=>x.id===tid);if(t)t.comments=t.comments.filter(c=>c.id!==cid); renderDetail(t); }
async function delTask(id){
  const t = S.tasks.find(x=>x.id===id);
  const mo = document.createElement("div"); mo.className="mo";
  mo.innerHTML=`<div class="modal" style="max-width:360px;padding:28px;text-align:center">
    <div style="font-size:32px;margin-bottom:10px">🗑️</div>
    <h3 style="font-size:15px;font-weight:800;margin-bottom:8px">Eliminar tarefa?</h3>
    <p style="font-size:12.5px;color:var(--t3);margin-bottom:20px">"<strong>${t?.title||"Tarefa"}</strong>" será eliminada permanentemente.</p>
    <div style="display:flex;gap:10px">
      <button class="btn-ghost" style="flex:1" onclick="this.closest('.mo').remove()">Cancelar</button>
      <button class="btn-err" style="flex:1" id="confirm-del-btn">Eliminar</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
  mo.querySelector("#confirm-del-btn").onclick = async ()=>{
    mo.remove();
    await api(`/api/tasks/${id}`,"DELETE");
    S.tasks=S.tasks.filter(t=>t.id!==id);
    closeMo("mo-detail");
    toast("Tarefa eliminada","i");
    await refreshAll();
  };
}

// ─────────────────────────────────────────────────
//  EVENT MODAL
// ─────────────────────────────────────────────────
function openNewEvent(){ setupEvModal(); document.getElementById("mo-event").classList.remove("hidden"); }
function openNewEventAt(dt){ setupEvModal(dt); document.getElementById("mo-event").classList.remove("hidden"); }

function setupEvModal(dt=null){
  S.selColor=PALETTE[0];
  document.getElementById("ev-title").value="";
  document.getElementById("ev-desc").value="";
  document.getElementById("ev-start").value=dt||"";
  document.getElementById("ev-end").value=dt||"";
  document.getElementById("ev-proj").innerHTML=`<option value="">Nenhum</option>`+S.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  document.getElementById("ev-colors").innerHTML=PALETTE.map(c=>`<div class="col-opt ${c===S.selColor?"on":""}" style="background:${c}" onclick="pickColor('${c}','ev-colors',this)"></div>`).join("");
  document.getElementById("ev-atts").innerHTML=`<div class="atts-wrap">${S.users.map(u=>`<div class="att-opt ${u.id===S.user?.id?"on":""}" data-id="${u.id}" onclick="this.classList.toggle('on')"><div class="av sm" style="background:${u.color}">${u.avatar}</div><span>${u.name.split(" ")[0]}</span></div>`).join("")}</div>`;
}

function pickColor(color,cid,el){ S.selColor=color; document.querySelectorAll(`#${cid} .col-opt`).forEach(e=>e.classList.remove("on")); el.classList.add("on"); }

async function submitEvent(){
  const title=document.getElementById("ev-title").value.trim();
  if(!title){toast("Título obrigatório!","e");return;}
  const atts=[...document.querySelectorAll("#ev-atts .att-opt.on")].map(el=>el.dataset.id);
  const e={title,description:document.getElementById("ev-desc").value,start:document.getElementById("ev-start").value,end:document.getElementById("ev-end").value,type:document.getElementById("ev-type").value,project:document.getElementById("ev-proj").value,color:S.selColor,attendees:atts};
  const r=await api("/api/events","POST",e);
  S.events.push(r); closeMo("mo-event"); toast(`Evento "${r.title}" criado!`,"s");
  if(S.view==="calendar")renderCal(); if(S.view==="dashboard")renderDash();
}

// ─────────────────────────────────────────────────
//  PROJECT MODAL
// ─────────────────────────────────────────────────
function openNewProj(){
  const mo = document.getElementById("mo-proj");
  if(!mo){ toast("Erro ao abrir modal de projeto","e"); return; }
  const npName = document.getElementById("np-name");
  const npDesc = document.getElementById("np-desc");
  const npIcon = document.getElementById("np-icon");
  const npDeadline = document.getElementById("np-deadline");
  if(npName) npName.value="";
  if(npDesc) npDesc.value="";
  if(npIcon) npIcon.value="📁";
  if(npDeadline) npDeadline.value="";
  S.selColor="#6366f1";
  document.querySelectorAll("#mo-proj .col-opt").forEach(e=>{
    e.classList.remove("on");
    if(e.dataset.color==="#6366f1") e.classList.add("on");
  });
  mo.classList.remove("hidden");
  setTimeout(()=>npName?.focus(), 100);
}

async function submitProj(){
  const name=document.getElementById("np-name").value.trim();
  if(!name){toast("Nome obrigatório","w");return;}
  const r=await api("/api/projects","POST",{name,color:S.selColor,icon:document.getElementById("np-icon").value||"📁",description:document.getElementById("np-desc").value,deadline:document.getElementById("np-deadline").value||null});
  S.projects.push(r); closeMo("mo-proj"); toast(`Projeto "${r.name}" criado!`,"s"); renderSBProjs(); render(S.view);
}

async function archiveProject(pid){
  const p = S.projects.find(x=>x.id===pid);
  if(!p) return;
  const isArchived = p.status==="archived";
  await api(`/api/projects/${pid}`,"PATCH",{status: isArchived?"active":"archived"});
  p.status = isArchived?"active":"archived";
  toast(isArchived?`"${p.name}" reativado!`:`"${p.name}" arquivado!`,"s");
  renderSBProjs(); render(S.view);
}

function openProjectSettings(pid){
  const p = S.projects.find(x=>x.id===pid);
  if(!p) return;
  const mo = document.createElement("div");
  mo.className="mo";
  const isArchived = p.status==="archived";
  mo.innerHTML=`<div class="modal" style="max-width:420px;padding:28px">
    <div class="mhd" style="margin-bottom:20px"><h3>${p.icon} ${p.name}</h3><button onclick="this.closest('.mo').remove()">✕</button></div>
    <div class="fg" style="margin-bottom:12px"><label>Nome</label><input class="fi" id="ep-name" value="${p.name}"/></div>
    <div class="fg" style="margin-bottom:12px"><label>Ícone</label><input class="fi" id="ep-icon" value="${p.icon}" style="width:80px"/></div>
    <div class="fg" style="margin-bottom:12px"><label>Descrição</label><textarea class="fi" id="ep-desc" rows="2">${p.description||""}</textarea></div>
    <div class="fg" style="margin-bottom:16px"><label>Prazo</label><input type="date" class="fi" id="ep-dl" value="${p.deadline||""}"/></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
      ${["#6366f1","#ec4899","#10b981","#f59e0b","#8b5cf6","#3b82f6","#ef4444","#06b6d4"].map(c=>`
        <div class="col-opt ${p.color===c?"on":""}" data-color="${c}" onclick="S.selColor='${c}';this.parentElement.querySelectorAll('.col-opt').forEach(x=>x.classList.remove('on'));this.classList.add('on')" style="background:${c};width:24px;height:24px;border-radius:6px;cursor:pointer;border:2px solid ${p.color===c?"#fff":"transparent"}"></div>
      `).join("")}
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between">
      <div style="display:flex;gap:8px">
        <button class="${isArchived?"btn-solid":"btn-ghost"}" onclick="archiveProject('${pid}');this.closest('.mo').remove()">${isArchived?"🔓 Reativar":"📦 Arquivar"}</button>
        <button class="btn-err" onclick="confirmDeleteProj('${pid}','${p.name}');this.closest('.mo').remove()">🗑️ Apagar</button>
      </div>
      <button class="btn-cta" onclick="saveProjectSettings('${pid}',this)">Guardar</button>
    </div>
  </div>`;
  S.selColor = p.color;
  document.body.appendChild(mo);
}

async function saveProjectSettings(pid, btn){
  const name=document.getElementById("ep-name").value.trim();
  if(!name){toast("Nome obrigatório","w");return;}
  btn.disabled=true; btn.textContent="A guardar...";
  const r=await api(`/api/projects/${pid}`,"PATCH",{name,icon:document.getElementById("ep-icon").value||"📁",description:document.getElementById("ep-desc").value,deadline:document.getElementById("ep-dl").value||null,color:S.selColor});
  const p=S.projects.find(x=>x.id===pid); if(p) Object.assign(p,r);
  document.querySelector(".mo")?.remove();
  toast(`"${r.name}" atualizado!`,"s"); renderSBProjs(); render(S.view);
}

function confirmDeleteProj(pid, name){
  const mo=document.createElement("div"); mo.className="mo";
  mo.innerHTML=`<div class="modal" style="max-width:380px;padding:28px">
    <div style="font-size:26px;margin-bottom:10px">🗑️</div>
    <h3 style="font-size:16px;font-weight:800;margin-bottom:8px">Apagar projeto?</h3>
    <p style="font-size:13px;color:var(--t3);margin-bottom:20px">Isto vai apagar <strong>"${name}"</strong> e todas as suas tarefas. Esta ação não pode ser desfeita.</p>
    <div style="display:flex;gap:10px">
      <button class="btn-ghost" style="flex:1" onclick="this.closest('.mo').remove()">Cancelar</button>
      <button class="btn-err" style="flex:1" onclick="doDeleteProj('${pid}',this)">Apagar tudo</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
}

async function doDeleteProj(pid, btn){
  btn.disabled=true; btn.textContent="A apagar...";
  await api(`/api/projects/${pid}`,"DELETE");
  S.projects=S.projects.filter(p=>p.id!==pid);
  S.tasks=S.tasks.filter(t=>t.project!==pid);
  document.querySelector(".mo")?.remove();
  toast("Projeto apagado","i"); renderSBProjs(); render(S.view);
}


function openPomodoro(){
  document.getElementById("pomo-task").innerHTML=S.tasks.filter(t=>t.status!=="Concluído").map(t=>`<option value="${t.id}">${t.title}</option>`).join("");
  renderPomoClock(); document.getElementById("mo-pomo").classList.remove("hidden");
}

function setPomoMode(mode,min,btn){
  stopPomo(); S.pomMode=mode; S.pomMin=min; S.pomSec=0; S.pomTotal=min*60;
  document.querySelectorAll(".ptab").forEach(b=>b.classList.remove("active")); btn.classList.add("active");
  document.getElementById("pomo-play").textContent="▶ Iniciar";
  renderPomoClock();
}

function renderPomoClock(){
  const t=`${String(S.pomMin).padStart(2,"0")}:${String(S.pomSec).padStart(2,"0")}`;
  document.getElementById("pomo-clock").textContent=t;
  const elapsed=(S.pomTotal-(S.pomMin*60+S.pomSec))/S.pomTotal;
  const circ=427, offset=circ-(elapsed*circ);
  document.getElementById("pomo-ring").setAttribute("stroke-dashoffset",offset.toString());
}

function togglePomo(){
  const btn=document.getElementById("pomo-play");
  if(S.pomRunning){stopPomo();btn.textContent="▶ Continuar";}
  else{startPomo();btn.textContent="⏸ Pausar";}
}

function startPomo(){
  S.pomRunning=true;
  S.pomTimer=setInterval(()=>{
    if(S.pomSec>0)S.pomSec--;
    else if(S.pomMin>0){S.pomMin--;S.pomSec=59;}
    else{
      clearInterval(S.pomTimer);S.pomRunning=false;S.pomSessions++;
      document.getElementById("pomo-count").textContent=`🍅 Sessões hoje: ${S.pomSessions}`;
      document.getElementById("pomo-play").textContent="▶ Iniciar";
      toast(S.pomMode==="work"?"🍅 Sessão de foco concluída! Faz uma pausa.":"☕ Pausa terminada! Hora de trabalhar.","s");
    }
    renderPomoClock();
  },1000);
}

function stopPomo(){ clearInterval(S.pomTimer); S.pomRunning=false; }
function resetPomo(){ stopPomo(); S.pomMin=S.pomMode==="work"?25:S.pomMode==="short"?5:15; S.pomSec=0; renderPomoClock(); document.getElementById("pomo-play").textContent="▶ Iniciar"; }

// ─────────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────────
function toggleNotif(){ document.getElementById("notif-panel").classList.toggle("hidden"); document.getElementById("notif-overlay").classList.toggle("hidden"); checkNotifs(); }
function closeNotif(){ document.getElementById("notif-panel").classList.add("hidden"); document.getElementById("notif-overlay").classList.add("hidden"); }

function renderNotifList(notifs){
  const el=document.getElementById("notif-list");
  if(!notifs.length){el.innerHTML=`<div class="empty-st" style="padding:24px"><div class="empty-i" style="font-size:26px">🔔</div><div class="empty-t">Sem notificações</div></div>`;return;}
  el.innerHTML=notifs.map(n=>`<div class="nitem ${!n.read?"unread":""}">
    <div class="nitem-ico">${{task:"📋",comment:"💬",deadline:"⏰",mention:"@"}[n.type]||"🔔"}</div>
    <div style="flex:1;min-width:0"><div class="nitem-title">${n.title}</div><div class="nitem-msg">${n.message}</div><div class="nitem-time">agora</div></div>
    ${!n.read?`<div class="nitem-dot"></div>`:""}
  </div>`).join("");
}

async function markAllRead(){
  await api("/api/notifications/read-all","PATCH");
  S.notifs = (S.notifs||[]).map(n=>({...n, read:true}));
  updateNotifBadge();
  checkNotifs();
  toast("Notificações lidas","i");
}

// ─────────────────────────────────────────────────
//  GEMINI AI
// ─────────────────────────────────────────────────
async function sendAIInput(){
  const i=document.getElementById("ai-inp");
  const msg=i.value.trim();
  if(!msg) return;
  i.value="";
  i.style.height="auto";
  if(!S.hasGemini){ appendAI("user",msg); appendAI("bot","🔑 Gemini não configurado. Vai a Definições → 🤖 IA."); return; }
  appendAI("user",msg);
  await smartAIDispatch(msg);
}

// ── Dispatcher inteligente — o Gemini decide a intenção ──────────────────
async function smartAIDispatch(msg){
  const btn=document.getElementById("ai-send");
  if(btn) btn.disabled=true;

  // Mostrar indicador de digitação
  const tid="ty"+Date.now();
  document.getElementById("ai-msgs").innerHTML+=`<div class="ai-msg bot" id="${tid}"><div class="ai-av">✦</div><div class="ai-bubble"><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`;
  scrollAI();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const tomorrow = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()+1).padStart(2,"0")}`;
  const todayFmt = now.toLocaleDateString("pt-PT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

  // Contexto rico mas compacto
  const projList = S.projects.filter(p=>p.status!=="archived").map(p=>`${p.id}=${p.name}(${S.tasks.filter(t=>t.project===p.id).length}tarefas)`).join("|");
  const userList = S.users.map(u=>`${u.id}=${u.name}(${u.role})`).join("|");
  const doneTasks = S.tasks.filter(t=>t.status==="Concluído").length;
  const overdue = S.tasks.filter(t=>t.deadline&&t.deadline<today&&t.status!=="Concluído").length;
  const inprog = S.tasks.filter(t=>t.status==="Em Progresso").length;
  const taskList = S.tasks.slice(0,30).map(t=>`${t.title}[${t.status}/${PRIO[t.priority]?.l||"?"}${t.assignee?"/"+S.users.find(u=>u.id===t.assignee)?.name?.split(" ")[0]:""}${t.deadline?"/"+t.deadline:""}]`).join("|");

  const systemPrompt = `És o assistente TaskFlow — útil, direto e em português de Portugal.

WORKSPACE HOJE (${today}):
- Utilizador: ${S.user?.name} (${ROLES[S.user?.role]?.l}, id:${S.user?.id})
- Projetos: ${projList||"nenhum"}
- Membros: ${userList}
- Estatísticas: ${S.tasks.length} tarefas total | ${doneTasks} concluídas | ${inprog} em progresso | ${overdue} em atraso
- Tarefas: ${taskList||"nenhuma"}
- Amanhã: ${tomorrow}

REGRAS:
1. Para CRIAR/ADICIONAR/AGENDAR/MARCAR/REGISTAR tarefa → responde APENAS com JSON:
{"action":"create_task","task":{"title":"...","description":"...","priority":"high/medium/low","assignee":"id_exato ou vazio","project":"id_exato ou vazio","deadline":"YYYY-MM-DD ou vazio","status":"A Fazer"},"message":"✅ mensagem de confirmação amigável"}

2. Para ANÁLISE/RESUMO/CONVERSA → responde em texto formatado, usa **negrito** para destaque, usa listas com •

3. Para ATUALIZAR/MOVER/ALTERAR tarefa existente → responde com sugestão clara de como fazê-lo

EXEMPLOS criar tarefa: "crie...", "adiciona...", "agenda...", "marca...", "quero uma tarefa...", "preciso que..."
EXEMPLOS chat: "resumo", "análise", "como está", "quais tarefas", "ajuda", "o que devo fazer"`;

  try {
    const r = await api("/api/ai/chat","POST",{
      message: msg,
      history: S.aiHistory.slice(-10),
      context: systemPrompt
    });

    document.getElementById(tid)?.remove();
    if(btn) btn.disabled=false;

    if(r.error){ appendAI("bot", r.error); return; }

    // Processar resposta do Gemini
    let parsed = null;
    let rawText = r.text.trim();

    // Limpar markdown code blocks
    rawText = rawText.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();

    try {
      // Tentar extrair JSON
      const match = rawText.match(/\{[\s\S]*\}/);
      if(match) parsed = JSON.parse(match[0]);
    } catch(e){ /* resposta de texto simples */ }

    if(parsed?.action==="create_task" && parsed.task){
      // Executar criação de tarefa
      await executeCreateTask(parsed.task, parsed.message||"✅ Tarefa criada!", msg);
    } else if(parsed?.action==="chat" && parsed.message){
      // Mostrar só a mensagem, não o JSON
      S.aiHistory.push({role:"user",text:msg},{role:"model",text:parsed.message});
      appendAI("bot", parsed.message);
    } else {
      // Resposta de texto simples (sem JSON) — mostrar diretamente
      // Remover qualquer JSON residual que possa ter ficado
      let displayText = parsed?.message || rawText;
      // Se ainda tiver aspeto de JSON, extrair só o campo message
      if(displayText.startsWith("{") || displayText.includes('"action"')){
        try {
          const j = JSON.parse(displayText.match(/\{[\s\S]*\}/)?.[0]||"{}");
          displayText = j.message || j.text || "Desculpa, não consegui processar a resposta.";
        } catch(e){ displayText = "Desculpa, tenta novamente."; }
      }
      S.aiHistory.push({role:"user",text:msg},{role:"model",text:displayText});
      appendAI("bot", displayText);
    }

  } catch(e){
    document.getElementById(tid)?.remove();
    if(btn) btn.disabled=false;
    appendAI("bot","⚠️ Erro de ligação. Verifica se o servidor está ativo.");
    console.error("[AI]",e);
  }
}

async function executeCreateTask(taskData, confirmMsg, originalMsg){
  const data = {
    title:       taskData.title       || "Nova Tarefa",
    description: taskData.description || "",
    priority:    ["high","medium","low"].includes(taskData.priority) ? taskData.priority : "medium",
    assignee:    taskData.assignee    || "",
    project:     taskData.project     || (S.projects.find(p=>p.status!=="archived")?.id || ""),
    deadline:    taskData.deadline    || "",
    status:      "A Fazer",
    tags:        []
  };

  // Validar que o projeto existe
  if(data.project && !S.projects.find(p=>p.id===data.project)) data.project="";
  // Validar que o membro existe
  if(data.assignee && !S.users.find(u=>u.id===data.assignee)) data.assignee="";

  const created = await api("/api/tasks","POST", data);
  if(created.error){
    appendAI("bot","❌ Erro ao criar a tarefa: "+created.error);
    return;
  }

  S.tasks.push(created);
  render(S.view);
  updateSB();

  const assigneeName = S.users.find(u=>u.id===created.assignee)?.name || "";
  const projName     = S.projects.find(p=>p.id===created.project)?.name  || "";
  const prioLabel    = PRIO[created.priority]?.l || "";

  const successMsg = `✅ **Tarefa criada com sucesso!**

📋 ${created.title}${projName?`\n📁 Projeto: ${projName}`:""}${assigneeName?`\n👤 Responsável: ${assigneeName}`:""}
🎯 Prioridade: ${prioLabel}${created.deadline?`\n📅 Prazo: ${fmtDate(created.deadline)}`:""}`;

  S.aiHistory.push({role:"user",text:originalMsg},{role:"model",text:successMsg});
  appendAI("bot", successMsg);
  toast(`✨ Tarefa "${created.title}" criada pela IA!`,"s");
}

async function sendAI(msg){
  if(!msg.trim()) return;
  // Redirecionar para o dispatcher inteligente
  appendAI("user",msg);
  await smartAIDispatch(msg);
}

function renderAIMarkdown(text){
  if(!text) return "";
  return text
    // Negrito **texto**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Itálico *texto*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Código `texto`
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:11px;font-family:var(--mono)">$1</code>')
    // Linhas com bullet • ou -
    .replace(/^[•\-]\s+(.+)$/gm, '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--a3);flex-shrink:0">▸</span><span>$1</span></div>')
    // Linhas numeradas 1. 2.
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--a3);flex-shrink:0;font-weight:700;min-width:14px">$1.</span><span>$2</span></div>')
    // Quebras de linha
    .replace(/\n\n/g, '<div style="margin:6px 0"></div>')
    .replace(/\n/g, '<br>');
}

function appendAI(role, text){
  const u = S.user;
  const isBot = role==="bot";
  const userPic = u?.picture
    ? `<img src="${u.picture}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
    : (u?.avatar||"?");
  const avH = isBot
    ? `<div class="ai-av">✦</div>`
    : `<div class="ai-av user-av" style="background:${u?.color||"var(--a)"}">${userPic}</div>`;
  const isTyping = text==="...";
  const bubbleContent = isTyping
    ? `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`
    : (isBot ? renderAIMarkdown(text) : text.replace(/\n/g,"<br>"));
  const el = document.getElementById("ai-msgs");
  const div = document.createElement("div");
  div.className = `ai-msg ${isBot?"bot":"user"}`;
  div.innerHTML = isBot
    ? `${avH}<div class="ai-bubble">${bubbleContent}</div>`
    : `<div class="ai-bubble">${bubbleContent}</div>${avH}`;
  el.appendChild(div);
  scrollAI();
}
function scrollAI(){ const el=document.getElementById("ai-msgs"); if(el) el.scrollTop=el.scrollHeight; }

// ─────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────
function closeMo(id){ document.getElementById(id)?.classList.add("hidden"); }

function toast(msg,type="i"){
  const a=document.getElementById("toasts"),id="t"+Date.now();
  const icons={s:"✅",e:"❌",i:"ℹ️",w:"⚠️"};
  a.innerHTML+=`<div class="toast ${type}" id="${id}">${icons[type]} ${msg}</div>`;
  setTimeout(()=>document.getElementById(id)?.remove(),3500);
}

function tday(){ return new Date().toISOString().slice(0,10); }
function dleft(dl){ if(!dl)return null; return Math.ceil((new Date(dl+"T12:00")-new Date())/86400000); }
function fmtDate(dt){ if(!dt)return"—"; return new Date(dt+"T12:00").toLocaleDateString("pt-PT",{day:"2-digit",month:"short"}); }
function fmtDT(dt){ if(!dt)return"—"; try{return new Date(dt).toLocaleDateString("pt-PT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});}catch{return dt;} }
function timeAgo(iso){ if(!iso)return"agora"; const d=Math.floor((Date.now()-new Date(iso))/60000); if(d<1)return"agora"; if(d<60)return d+"min"; if(d<1440)return Math.floor(d/60)+"h"; return Math.floor(d/1440)+"d"; }


// ═══════════════════════════════════════════════
//  QUICK COMPLETE
// ═══════════════════════════════════════════════
async function quickComplete(tid){
  const t = S.tasks.find(x=>x.id===tid);
  if(!t) return;
  const newStatus = t.status === "Concluído" ? "A Fazer" : "Concluído";
  const r = await api(`/api/tasks/${tid}`,"PATCH",{status: newStatus});
  if(!r.error){
    toast(newStatus === "Concluído" ? "✅ Tarefa concluída!" : "↩️ Tarefa reaberta", "s");
    await refreshAll();
  }
}

// ═══════════════════════════════════════════════
//  THEME — Dark / Light
// ═══════════════════════════════════════════════
function initTheme(){
  const saved = localStorage.getItem("tf_theme") || "dark";
  applyTheme(saved);
}
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t==="light" ? "light" : "");
  const btn = document.getElementById("theme-btn");
  if(btn) btn.textContent = t==="light" ? "☀️" : "🌙";
  localStorage.setItem("tf_theme", t);
}
function toggleTheme(){
  const cur = localStorage.getItem("tf_theme") || "dark";
  applyTheme(cur==="dark" ? "light" : "dark");
}

// ═══════════════════════════════════════════════
//  LANGUAGE — PT / EN
// ═══════════════════════════════════════════════
const LANGS = {
  pt: {
    // Topbar
    search:"Pesquisar tarefas, projetos...", newTask:"+ Tarefa", newEvent:"+ Evento",
    // Sidebar
    principal:"PRINCIPAL", projects:"PROJETOS", newProject:"+ Novo projeto",
    dashboard:"Dashboard", kanban:"Kanban", calendar:"Calendário",
    notes:"Notas", team:"Equipa", reports:"Relatórios",
    settings:"Definições", geminiAI:"Gemini AI",
    // Dashboard
    totalTasks:"Total de Tarefas", done:"Concluídas", inProgress:"Em Progresso",
    overdue:"Em Atraso", weeklyProgress:"Progresso Semanal", byStatus:"Por Estado",
    tasksTotal:"Tarefas totais", completionRate:"Taxa Conclusão", onlineNow:"Online agora",
    projectsTitle:"Projetos", teamActivity:"Atividade da Equipa", newProj:"+ Novo",
    // Kanban
    addTask:"+ Adicionar tarefa", allProjects: "Todos os projetos",
    noTasks: "Sem tarefas",
    // Reports
    reportsTitle:"Relatórios", exportPDF:"Exportar PDF", exportCSV:"Exportar CSV",
    byState:"Por Estado", byPriority:"Por Prioridade", byMember:"Por Membro",
    activityHistory:"Histórico de Atividade",
    // Team
    teamTitle:"Equipa", online:"online", tasks:"tarefas", completed:"concluídas",
    // Notes
    notesTitle:"Notas", newNote:"+ Nova nota", pinned:"Fixadas",
    // Calendar
    calendarTitle:"Calendário", today:"Hoje",
    // Settings
    profile:"Perfil", security:"Segurança", notifications:"Notificações",
    appearance:"Aparência", integrations:"Integrações",
    // Common
    save:"Guardar", cancel:"Cancelar", delete:"Apagar", edit:"Editar",
    create:"Criar", loading:"A carregar...", welcome:"Bem-vindo de volta",
    loginSubtitle:"Entra na tua conta para continuar",
    createAccount:"Criar conta", signIn:"Entrar", continueGoogle:"Continuar com Google",
    demoAccess:"Acesso demo",
    // Modal labels
    newTask:"+ Tarefa", newEvent:"+ Evento",
    taskTitle:"Título da tarefa", taskDesc:"Descrição", status:"Estado",
    priority:"Prioridade", assignee:"Responsável", deadline:"Prazo",
    project:"Projeto", tags:"Tags", subtasks:"Subtarefas",
    high:"Alta", medium:"Média", low:"Baixa",
    todo:"A Fazer", inProgress:"Em Progresso", review:"Revisão", done:"Concluído",
    // Reports extra
    byPriority:"Por Prioridade", member:"Membro", rate:"Taxa",
    total:"Total", completed:"Concluídas", inProg:"Em Progresso",
    // Team
    role:"Cargo", skills:"Skills", joinDate:"Membro desde",
    // Settings
    team:"Equipa", admin:"Admin",
    saveProfile:"Guardar perfil", changePassword:"Alterar password",
    // Kanban list
    allProjects:"Todos os projetos",
  },
  en: {
    // Topbar
    search:"Search tasks, projects...", newTask:"+ Task", newEvent:"+ Event",
    // Sidebar
    principal:"MAIN", projects:"PROJECTS", newProject:"+ New project",
    dashboard:"Dashboard", kanban:"Kanban", calendar:"Calendar",
    notes:"Notes", team:"Team", reports:"Reports",
    settings:"Settings", geminiAI:"Gemini AI",
    // Dashboard
    totalTasks:"Total Tasks", done:"Completed", inProgress:"In Progress",
    overdue:"Overdue", weeklyProgress:"Weekly Progress", byStatus:"By Status",
    tasksTotal:"Total tasks", completionRate:"Completion rate", onlineNow:"Online now",
    projectsTitle:"Projects", teamActivity:"Team Activity", newProj:"+ New",
    // Kanban
    addTask:"+ Add task", allProjects:"All projects",
    noTasks:"No tasks",
    // Reports
    reportsTitle:"Reports", exportPDF:"Export PDF", exportCSV:"Export CSV",
    byState:"By Status", byPriority:"By Priority", byMember:"By Member",
    activityHistory:"Activity History",
    // Team
    teamTitle:"Team", online:"online", tasks:"tasks", completed:"completed",
    // Notes
    notesTitle:"Notes", newNote:"+ New note", pinned:"Pinned",
    // Calendar
    calendarTitle:"Calendar", today:"Today",
    // Settings
    profile:"Profile", security:"Security", notifications:"Notifications",
    appearance:"Appearance", integrations:"Integrations",
    // Common
    save:"Save", cancel:"Cancel", delete:"Delete", edit:"Edit",
    create:"Create", loading:"Loading...", welcome:"Welcome back",
    loginSubtitle:"Sign in to your account to continue",
    createAccount:"Create account", signIn:"Sign in", continueGoogle:"Continue with Google",
    demoAccess:"Demo access",
    // Modal labels
    newTask:"+ Task", newEvent:"+ Event",
    taskTitle:"Task title", taskDesc:"Description", status:"Status",
    priority:"Priority", assignee:"Assignee", deadline:"Deadline",
    project:"Project", tags:"Tags", subtasks:"Subtasks",
    high:"High", medium:"Medium", low:"Low",
    todo:"To Do", inProgress:"In Progress", review:"Review", done:"Done",
    // Reports extra
    byPriority:"By Priority", member:"Member", rate:"Rate",
    total:"Total", completed:"Completed", inProg:"In Progress",
    // Team
    role:"Role", skills:"Skills", joinDate:"Member since",
    // Settings
    team:"Team", admin:"Admin",
    saveProfile:"Save profile", changePassword:"Change password",
    // Kanban list
    allProjects:"All projects",
  }
};

function T(key){ return LANGS[S.lang||"pt"]?.[key] || LANGS.pt[key] || key; }

function initLang(){
  S.lang = localStorage.getItem("tf_lang") || "pt";
  applyLang(S.lang);
}

function applyLang(l){
  S.lang = l;
  localStorage.setItem("tf_lang", l);

  // Botão de idioma
  const lbl = document.getElementById("lang-label");
  if(lbl) lbl.textContent = l.toUpperCase();

  // Topbar
  const srch = document.getElementById("srch");
  if(srch) srch.placeholder = LANGS[l].search;
  const btnTask = document.getElementById("btn-new-task");
  if(btnTask) btnTask.textContent = LANGS[l].newTask;
  const btnEv = document.getElementById("btn-new-event");
  if(btnEv) btnEv.textContent = LANGS[l].newEvent;

  // Sidebar nav
  const navMap = {
    dashboard: LANGS[l].dashboard, kanban: LANGS[l].kanban,
    calendar: LANGS[l].calendar,   notes: LANGS[l].notes,
    team: LANGS[l].team,           reports: LANGS[l].reports,
  };
  document.querySelectorAll(".sb-a[data-v]").forEach(el=>{
    const key = el.getAttribute("data-v");
    if(navMap[key]){
      const span = el.querySelector("span");
      if(span) span.textContent = navMap[key];
    }
  });

  // Sidebar groups
  document.querySelectorAll(".sb-group").forEach(el=>{
    const t = el.textContent.trim();
    if(t==="PRINCIPAL"||t==="MAIN") el.textContent = LANGS[l].principal;
    if(t==="PROJETOS"||t==="PROJECTS") el.textContent = LANGS[l].projects;
  });

  // Sidebar footer quick buttons
  document.querySelectorAll(".sb-quick-btn span").forEach(span=>{
    const p = span.parentElement;
    if(!p) return;
    const oc = p.getAttribute("onclick")||"";
    if(oc.includes("settings")) span.textContent = LANGS[l].settings;
    if(oc.includes("AI")||oc.includes("toggleAI")) span.textContent = LANGS[l].geminiAI;
  });

  // Login
  const lgHead = document.querySelector(".lg-head h2");
  if(lgHead) lgHead.textContent = LANGS[l].welcome;
  const lgSub = document.querySelector(".lg-head p");
  if(lgSub) lgSub.textContent = LANGS[l].loginSubtitle;
  const lgtabs = document.querySelectorAll(".lgtab");
  if(lgtabs[0]) lgtabs[0].textContent = LANGS[l].signIn;
  if(lgtabs[1]) lgtabs[1].textContent = LANGS[l].createAccount;

  // Nome do utilizador na sidebar mantém-se
  // Re-renderizar a view atual para aplicar traduções
  if(S.user) render(S.view);
}

function toggleLang(){
  const cur = localStorage.getItem("tf_lang") || "pt";
  applyLang(cur==="pt" ? "en" : "pt");
}

// ═══════════════════════════════════════════════
//  MOBILE SIDEBAR
// ═══════════════════════════════════════════════
function toggleSidebar(){
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("sb-overlay");
  const isMobile = window.innerWidth <= 768;
  if(isMobile){
    sb.classList.toggle("mobile-open");
    ov?.classList.toggle("on", sb.classList.contains("mobile-open"));
  } else {
    sb.classList.toggle("closed");
    localStorage.setItem("tf_sb_closed", sb.classList.contains("closed") ? "1" : "0");
    updateMenuBtn();
  }
}

function updateMenuBtn(){
  const sb = document.getElementById("sidebar");
  const btn = document.querySelector(".tb-menu");
  if(!btn) return;
  const isClosed = sb?.classList.contains("closed");
  const isMobile = window.innerWidth <= 768;
  if(isMobile){
    btn.style.display = "flex";
  } else {
    btn.style.display = isClosed ? "flex" : "none";
  }
}

function closeMobileSidebar(){
  document.getElementById("sidebar")?.classList.remove("mobile-open");
  document.getElementById("sb-overlay")?.classList.remove("on");
}

// Fechar sidebar ao clicar num item no mobile
document.addEventListener("click", (e)=>{
  if(window.innerWidth <= 768 && e.target.closest(".sb-a")){
    setTimeout(closeMobileSidebar, 150);
  }
});

// Abrir Gemini no mobile — abre em modal
function openMobileAI(){
  // No mobile, abrir o painel AI como modal bottom sheet
  const panel = document.getElementById("ai-panel");
  if(!panel) return;
  // Criar bottom sheet mobile
  const existing = document.getElementById("mo-mobile-ai");
  if(existing){ existing.remove(); return; }
  const mo = document.createElement("div");
  mo.id = "mo-mobile-ai";
  mo.style.cssText = "position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.5)";
  mo.innerHTML = `
  <div style="background:var(--bg1);border-radius:20px 20px 0 0;height:85vh;display:flex;flex-direction:column;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--b1)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4285f4,#6366f1);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff">✦</div>
        <div>
          <div style="font-size:14px;font-weight:800;background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Gemini AI</div>
          <div style="font-size:10px;color:var(--ok);font-weight:600">● pronto</div>
        </div>
      </div>
      <button onclick="document.getElementById('mo-mobile-ai').remove()" style="background:var(--bg3);border:1px solid var(--b1);border-radius:8px;width:30px;height:30px;color:var(--t3);cursor:pointer;font-size:14px">✕</button>
    </div>
    <div id="mobile-ai-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px">
      ${document.getElementById("ai-msgs")?.innerHTML || '<div style="padding:20px;text-align:center;color:var(--t3)">Inicia uma conversa com o Gemini!</div>'}
    </div>
    <div style="padding:12px;border-top:1px solid var(--b1);display:flex;gap:8px;align-items:flex-end">
      <textarea id="mobile-ai-inp" placeholder="Pergunta ao Gemini..." rows="1"
        style="flex:1;background:var(--bg3);border:1.5px solid var(--b1);border-radius:12px;padding:10px 14px;font-size:13px;color:var(--t);font-family:var(--font);resize:none;outline:none;max-height:90px"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMobileAI()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,90)+'px'"></textarea>
      <button onclick="sendMobileAI()" style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">↑</button>
    </div>
  </div>`;
  mo.onclick = (e)=>{ if(e.target===mo) mo.remove(); };
  document.body.appendChild(mo);
  setTimeout(()=>document.getElementById("mobile-ai-inp")?.focus(), 300);
}

async function sendMobileAI(){
  const inp = document.getElementById("mobile-ai-inp");
  const msgs = document.getElementById("mobile-ai-msgs");
  if(!inp || !msgs) return;
  const msg = inp.value.trim();
  if(!msg) return;
  inp.value = ""; inp.style.height = "auto";
  // Adicionar mensagem do user
  msgs.innerHTML += `<div style="display:flex;justify-content:flex-end"><div style="background:linear-gradient(135deg,var(--a),#818cf8);color:#fff;padding:10px 14px;border-radius:14px 4px 14px 14px;max-width:85%;font-size:13px">${msg}</div></div>`;
  msgs.scrollTop = msgs.scrollHeight;
  // Usar o mesmo dispatcher do AI principal
  const tid = "mob-ty-"+Date.now();
  msgs.innerHTML += `<div id="${tid}" style="display:flex;gap:8px;align-items:center"><div style="width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,#4285f4,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">✦</div><div style="color:var(--t3);font-size:13px">A pensar...</div></div>`;
  msgs.scrollTop = msgs.scrollHeight;
  // Sincronizar com AI principal
  document.getElementById("ai-inp").value = msg;
  appendAI("user", msg);
  await smartAIDispatch(msg);
  document.getElementById(tid)?.remove();
  // Copiar última resposta do AI
  const lastBot = document.getElementById("ai-msgs")?.querySelector(".ai-msg.bot:last-child .ai-bubble");
  if(lastBot){
    msgs.innerHTML += `<div style="display:flex;gap:8px"><div style="width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,#4285f4,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0">✦</div><div style="background:var(--bg3);border:1px solid var(--b1);padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:85%;font-size:13px;color:var(--t)">${lastBot.innerHTML}</div></div>`;
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ═══════════════════════════════════════════════
//  AI TASK CREATION
// ═══════════════════════════════════════════════
async function aiCreateTask(userMsg){
  if(!S.hasGemini){ toast("Gemini não configurado","w"); return; }
  // Data local correta (não UTC)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const todayFmt = now.toLocaleDateString("pt-PT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  const ctx = "Projetos disponíveis (usa o id exato): "+S.projects.filter(p=>p.status!=="archived").map(p=>`${p.id}=${p.name}`).join(", ")+
    ". Membros disponíveis (usa o id exato): "+S.users.map(u=>`${u.id}=${u.name}`).join(", ")+
    `. Data de hoje: ${todayFmt} (${today}). Usa esta data como referência para prazos como "amanhã", "esta semana", etc.`;
  const prompt = `Analisa este pedido e cria uma tarefa: "${userMsg}"

${ctx}

IMPORTANTE: A data de hoje é ${today}. "Amanhã" é ${`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()+1).padStart(2,"0")}`}.

Responde APENAS com JSON válido (sem texto, sem markdown, sem explicação):
{"title":"titulo da tarefa","description":"descrição","priority":"high ou medium ou low","assignee":"id do membro ou vazio","project":"id do projeto ou vazio","deadline":"YYYY-MM-DD ou vazio","status":"A Fazer"}`;
  try {
    appendAI("bot","⏳ A criar a tarefa...");
    const r = await api("/api/ai/chat","POST",{message:prompt,history:[],context:ctx});
    if(r.error){ 
      // Remove loading message
      const msgs = document.querySelectorAll(".ai-msg.bot");
      msgs[msgs.length-1]?.remove();
      appendAI("bot","❌ Erro: "+r.error); 
      return; 
    }
    let text = r.text.trim().split("```json").join("").split("```").join("").trim();
    // Try to extract JSON if there's extra text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if(jsonMatch) text = jsonMatch[0];
    const data = JSON.parse(text);
    
    // Create task directly via API
    const taskData = {
      title: data.title || "Nova Tarefa",
      description: data.description || "",
      priority: data.priority || "medium",
      assignee: data.assignee || "",
      project: data.project || (S.projects[0]?.id || ""),
      deadline: data.deadline || "",
      status: data.status || "A Fazer",
      tags: []
    };
    
    const created = await api("/api/tasks","POST", taskData);
    
    // Remove loading message
    const msgs = document.querySelectorAll(".ai-msg.bot");
    msgs[msgs.length-1]?.remove();
    
    if(created.error){
      appendAI("bot","❌ Erro ao criar: "+created.error);
      return;
    }
    
    S.tasks.push(created);
    render(S.view);
    
    const assigneeName = S.users.find(u=>u.id===created.assignee)?.name || "";
    const projName = S.projects.find(p=>p.id===created.project)?.name || "";
    appendAI("bot", `✅ Tarefa criada com sucesso!

**${created.title}**
📌 Projeto: ${projName}
👤 Responsável: ${assigneeName || "Nenhum"}
🔴 Prioridade: ${created.priority}
📅 Prazo: ${created.deadline || "Sem prazo"}`);
    toast(`✨ Tarefa "${created.title}" criada pela IA!`,"s");
  } catch(e){ 
    const msgs = document.querySelectorAll(".ai-msg.bot");
    msgs[msgs.length-1]?.remove();
    appendAI("bot","❌ Não consegui criar a tarefa. Tenta ser mais específico.");
    console.error(e);
  }
}

// ═══════════════════════════════════════════════
//  @MENTION AUTOCOMPLETE
// ═══════════════════════════════════════════════
function setupMentionAutocomplete(inputId){
  const inp = document.getElementById(inputId);
  if(!inp || inp._mentionSetup) return;
  inp._mentionSetup = true;
  inp.addEventListener("input", ()=>{
    const val = inp.value, atIdx = val.lastIndexOf("@");
    if(atIdx === -1){ hideMentionDd(); return; }
    const query = val.slice(atIdx+1).toLowerCase();
    const matches = S.users.filter(u=>u.name.toLowerCase().includes(query));
    if(matches.length) showMentionDd(matches, inp, atIdx);
    else hideMentionDd();
  });
  inp.addEventListener("blur", ()=>setTimeout(hideMentionDd, 200));
}
function showMentionDd(users, inp, atIdx){
  hideMentionDd();
  const rect = inp.getBoundingClientRect();
  const dd = document.createElement("div");
  dd.id = "mention-dd";
  dd.style.cssText = "position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:var(--bg2);border:1px solid var(--b2);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;min-width:180px;overflow:hidden";
  dd.innerHTML = users.slice(0,5).map(u=>`<div onclick="insertMention('${u.name.split(' ')[0]}','${inp.id}',${atIdx})" style="display:flex;align-items:center;gap:9px;padding:9px 13px;cursor:pointer" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''"><div class="av sm" style="background:${u.color}">${u.avatar}</div><span style="font-size:13px">${u.name}</span></div>`).join("");
  document.body.appendChild(dd);
}
function hideMentionDd(){ document.getElementById("mention-dd")?.remove(); }
function insertMention(name, inputId, atIdx){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  inp.value = inp.value.slice(0,atIdx) + "@"+name+" " + inp.value.slice(inp.selectionStart);
  inp.focus(); hideMentionDd();
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", ()=>{
  initTheme();
  initLang();
  S.lang = localStorage.getItem("tf_lang") || "pt";
});

// ═══════════════════════════════════════════════
//  NOTIFICATION BADGE COUNT
// ═══════════════════════════════════════════════
function updateNotifBadge(){
  const unread = (S.notifs||[]).filter(n=>!n.read).length;
  const btn = document.getElementById("nb");
  if(!btn) return;
  // Remove old badge
  btn.querySelector(".notif-count")?.remove();
  if(unread > 0){
    const badge = document.createElement("span");
    badge.className = "notif-count";
    badge.textContent = unread > 9 ? "9+" : unread;
    btn.style.position = "relative";
    btn.appendChild(badge);
  }
}

// Notifs loaded inside original loadAll via patch below

// ═══════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════
const SHORTCUTS = {
  "Escape": ()=>{ closeAllModals(); document.getElementById("search-results")?.remove(); },
};

document.addEventListener("keydown", (e)=>{
  // Don't trigger when typing in inputs
  if(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  if(!S.user) return;
  const fn = SHORTCUTS[e.key];
  if(fn){ e.preventDefault(); fn(); showShortcutHint(e.key); }
});

function showShortcutHint(key){
  document.querySelector(".shortcut-hint")?.remove();
  const labels = {"n":"Nova Tarefa","k":"Kanban","d":"Dashboard","c":"Calendário","e":"Equipa","r":"Relatórios","/":"Pesquisa"};
  if(!labels[key]) return;
  const el = document.createElement("div");
  el.className = "shortcut-hint";
  el.innerHTML = `<kbd style="background:var(--bg5);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:11px">${key}</kbd> ${labels[key]}`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1200);
}

function closeAllModals(){
  document.querySelectorAll(".mo-overlay").forEach(m=>m.classList.add("hidden"));
}

// ═══════════════════════════════════════════════
//  GLOBAL SEARCH
// ═══════════════════════════════════════════════
function setupGlobalSearch(){
  const inp = document.getElementById("srch");
  if(!inp || inp._searchSetup) return;
  inp._searchSetup = true;
  inp.addEventListener("input", ()=>{
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(()=>doGlobalSearch(inp.value), 200);
  });
  inp.addEventListener("focus", ()=>{ if(inp.value) doGlobalSearch(inp.value); });
  document.addEventListener("click", (e)=>{
    if(!e.target.closest("#search-results") && !e.target.closest("#srch")){
      document.getElementById("search-results")?.remove();
    }
  });
}

function doGlobalSearch(q){
  document.getElementById("search-results")?.remove();
  if(!q || q.length < 2) return;
  const ql = q.toLowerCase();
  const tasks = S.tasks.filter(t=>t.title.toLowerCase().includes(ql)||t.description?.toLowerCase().includes(ql));
  const projects = S.projects.filter(p=>p.name.toLowerCase().includes(ql));
  const users = S.users.filter(u=>u.name.toLowerCase().includes(ql));
  if(!tasks.length && !projects.length && !users.length) return;
  const el = document.createElement("div");
  el.id = "search-results";
  let html = "";
  if(tasks.length){ html+=`<div class="sr-section">Tarefas</div>${tasks.slice(0,5).map(t=>`<div class="sr-item" onclick="openDetail('${t.id}');document.getElementById('search-results')?.remove()"><span class="sr-icon">📋</span><span class="sr-name">${t.title}</span><span class="sr-sub">${t.status}</span></div>`).join("")}`; }
  if(projects.length){ html+=`<div class="sr-section">Projetos</div>${projects.slice(0,3).map(p=>`<div class="sr-item" onclick="S.search='proj:'+p.id;nav('kanban');document.getElementById('search-results')?.remove()"><span class="sr-icon">${p.icon}</span><span class="sr-name">${p.name}</span><span class="sr-sub">${p.status}</span></div>`).join("")}`; }
  if(users.length){ html+=`<div class="sr-section">Membros</div>${users.slice(0,3).map(u=>`<div class="sr-item" onclick="openProfile('${u.id}');document.getElementById('search-results')?.remove()"><div class="av sm" style="background:${u.color};flex-shrink:0">${u.avatar}</div><span class="sr-name">${u.name}</span><span class="sr-sub">${u.role}</span></div>`).join("")}`; }
  el.innerHTML = html;
  document.body.appendChild(el);
  const inp = document.getElementById("srch");
  if(inp){
    const rect = inp.getBoundingClientRect();
    el.style.left = rect.left + "px";
    el.style.top = (rect.bottom + 6) + "px";
    el.style.transform = "none";
    el.style.width = "400px";
  }
}

// ═══════════════════════════════════════════════
//  LIST VIEW (alternativa ao Kanban)
// ═══════════════════════════════════════════════
S.kanbanView = "board"; // "board" or "list"

function renderListView(){
  const kf = S.kf;
  let tasks = S.tasks;
  if(kf.proj)     tasks=tasks.filter(t=>t.project===kf.proj);
  if(kf.assignee) tasks=tasks.filter(t=>t.assignee===kf.assignee);
  if(kf.priority) tasks=tasks.filter(t=>t.priority===kf.priority);
  if(kf.deadline==="hoje")   tasks=tasks.filter(t=>t.deadline===tday());
  if(kf.deadline==="atraso") tasks=tasks.filter(t=>t.deadline&&t.deadline<tday()&&t.status!=="Concluído");
  if(kf.deadline==="semana"){ const w=new Date(); w.setDate(w.getDate()+7); const ws=w.toISOString().slice(0,10); tasks=tasks.filter(t=>t.deadline&&t.deadline>=tday()&&t.deadline<=ws); }
  if(S.search&&!S.search.startsWith("proj:")) tasks=tasks.filter(t=>t.title.toLowerCase().includes(S.search)||t.description?.toLowerCase().includes(S.search));

  // Sort
  const sortKey = S.listSort||"priority";
  const sortDir = S.listSortDir||1;
  tasks = [...tasks].sort((a,b)=>{
    if(sortKey==="priority"){ const po={high:0,medium:1,low:2}; return ((po[a.priority]||1)-(po[b.priority]||1))*sortDir; }
    if(sortKey==="deadline"){ if(!a.deadline) return 1; if(!b.deadline) return -1; return a.deadline.localeCompare(b.deadline)*sortDir; }
    if(sortKey==="title") return a.title.localeCompare(b.title)*sortDir;
    if(sortKey==="status") return COLS.indexOf(a.status)-COLS.indexOf(b.status);
    return 0;
  });

  const grouped = {};
  COLS.forEach(c=>{ grouped[c]=tasks.filter(t=>t.status===c); });
  const activeFilters = kfActive();

  function sortBtn(key, label){
    const active = sortKey===key;
    const arrow = active ? (sortDir===1?"↑":"↓") : "";
    return `<button onclick="S.listSort='${key}';S.listSortDir=S.listSort==='${key}'?-S.listSortDir:1;renderListView()" style="padding:4px 10px;border-radius:6px;border:1px solid ${active?"var(--a)":"var(--b1)"};background:${active?"rgba(99,102,241,.1)":"transparent"};color:${active?"var(--a3)":"var(--t3)"};font-size:11px;cursor:pointer;font-weight:600">${label}${arrow}</button>`;
  }

  let html = `
  <!-- Filtros -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.proj=this.value;renderListView()">
      <option value="">📁 ${T("allProjects")}</option>
      ${S.projects.map(p=>`<option value="${p.id}" ${kf.proj===p.id?"selected":""}>${p.icon} ${p.name}</option>`).join("")}
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.assignee=this.value;renderListView()">
      <option value="">👤 Todos</option>
      ${S.users.map(u=>`<option value="${u.id}" ${kf.assignee===u.id?"selected":""}>${u.avatar} ${u.name}</option>`).join("")}
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.priority=this.value;renderListView()">
      <option value="">🎯 Prioridade</option>
      <option value="high" ${kf.priority==="high"?"selected":""}>🔴 Alta</option>
      <option value="medium" ${kf.priority==="medium"?"selected":""}>🟡 Média</option>
      <option value="low" ${kf.priority==="low"?"selected":""}>🟢 Baixa</option>
    </select>
    <select class="fi" style="width:auto;padding:6px 10px;font-size:12.5px" onchange="S.kf.deadline=this.value;renderListView()">
      <option value="">📅 Prazo</option>
      <option value="hoje" ${kf.deadline==="hoje"?"selected":""}>Hoje</option>
      <option value="semana" ${kf.deadline==="semana"?"selected":""}>Esta semana</option>
      <option value="atraso" ${kf.deadline==="atraso"?"selected":""}>⚠️ Em atraso</option>
    </select>
    ${activeFilters?`<button onclick="S.kf={proj:'',assignee:'',priority:'',deadline:''};renderListView()" style="padding:6px 12px;background:rgba(239,68,68,.1);color:var(--err);border:1px solid rgba(239,68,68,.2);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">✕ Limpar</button>`:""}
    <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
      <span style="font-size:11px;color:var(--t3)">${tasks.length} tarefa${tasks.length!==1?"s":""}</span>
      <div class="view-toggle">
        <button class="vt-btn" onclick="S.kanbanView='board';render('kanban')">⊞ Board</button>
        <button class="vt-btn active">≡ Lista</button>
      </div>
    </div>
  </div>

  <!-- Cabeçalho da tabela com ordenação -->
  <div style="display:grid;grid-template-columns:28px 1fr 110px 120px 100px 90px 36px;gap:8px;padding:6px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:8px 8px 0 0;margin-bottom:0">
    <div></div>
    ${sortBtn("title","Tarefa")}
    ${sortBtn("status","Estado")}
    ${sortBtn("priority","Prioridade")}
    <span style="font-size:11px;color:var(--t3);font-weight:600;padding:4px 0">Responsável</span>
    ${sortBtn("deadline","Prazo")}
    <div></div>
  </div>
  <div style="border:1px solid var(--b1);border-top:none;border-radius:0 0 10px 10px;overflow:hidden">`;

  if(!tasks.length){
    html += `<div class="empty-st" style="padding:32px"><div class="empty-i">🔍</div><div class="empty-t">Nenhuma tarefa encontrada</div></div>`;
  } else {
    tasks.forEach((t,i)=>{
      const u=S.users.find(x=>x.id===t.assignee);
      const proj=S.projects.find(x=>x.id===t.project);
      const dl=dleft(t.deadline);
      const isDone=t.status==="Concluído";
      html+=`<div style="display:grid;grid-template-columns:28px 1fr 110px 120px 100px 90px 36px;gap:8px;padding:10px 12px;align-items:center;border-bottom:${i<tasks.length-1?"1px solid var(--b1)":"none"};background:${isDone?"rgba(34,197,94,.03)":"var(--bg)"};transition:background .12s;cursor:pointer" onclick="openDetail('${t.id}')" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='${isDone?"rgba(34,197,94,.03)":"var(--bg)"}'">
        <button class="lv-check ${isDone?"done":""}" onclick="event.stopPropagation();quickComplete('${t.id}')" style="flex-shrink:0">${isDone?"✓":""}</button>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600;${isDone?"text-decoration:line-through;color:var(--t3)":"color:var(--t)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
          ${proj?`<div style="font-size:10px;color:${proj.color};margin-top:2px">${proj.icon} ${proj.name}</div>`:""}
        </div>
        <div><span style="font-size:11px;padding:3px 8px;border-radius:6px;background:${SC[t.status]}22;color:${SC[t.status]};font-weight:600;white-space:nowrap">${t.status}</span></div>
        <div><span style="font-size:11px;padding:3px 8px;border-radius:6px;background:${PRIO[t.priority]?.bg};color:${PRIO[t.priority]?.c};font-weight:600">${PRIO[t.priority]?.l}</span></div>
        <div>${u?`<div style="display:flex;align-items:center;gap:6px"><div class="av sm" style="background:${u.color}">${u.avatar}</div><span style="font-size:11.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name.split(" ")[0]}</span></div>`:`<span style="font-size:11px;color:var(--t3)">—</span>`}</div>
        <div>${t.deadline?`<span style="font-size:11px;font-family:var(--mono);color:${dl!==null&&dl<0?"var(--err)":dl!==null&&dl<=2?"#f59e0b":"var(--t3)"}${isDone?";text-decoration:line-through":""}">${dl===0?"Hoje":dl!==null&&dl<0?Math.abs(dl)+"d atraso":t.deadline}</span>`:`<span style="color:var(--t3);font-size:11px">—</span>`}</div>
        <div><button onclick="event.stopPropagation();delTask('${t.id}')" style="padding:4px 6px;background:none;border:none;color:var(--t3);cursor:pointer;border-radius:6px;font-size:13px" title="Eliminar" onmouseover="this.style.color='var(--err)'" onmouseout="this.style.color='var(--t3)'">🗑</button></div>
      </div>`;
    });
  }

  html += `</div>`;
  document.getElementById("v-kanban").innerHTML = html;
}


// ═══════════════════════════════════════════════
//  HISTORY — Histórico de alterações
// ═══════════════════════════════════════════════
function renderHistory(){
  const act = S.activity || [];
  return act.length ? act.map(a=>{
    const u = S.users.find(x=>x.id===a.user);
    return `<div class="hist-item">
      <div class="hist-dot" style="background:${u?.color||"var(--a)"}"></div>
      <div class="hist-info">
        <div class="hist-action"><strong>${u?.name||"Sistema"}</strong> ${a.action} <strong>"${a.target}"</strong></div>
        <div class="hist-time">${a.time} atrás · ${a.icon}</div>
      </div>
    </div>`;
  }).join("") : `<div class="empty-st"><div class="empty-i">📋</div><div class="empty-t">Sem histórico</div></div>`;
}

// Kanban list view handled inside render()

// Search setup called after login

// ═══════════════════════════════════════════════
//  CHAT INTERNO
// ═══════════════════════════════════════════════
let lastChatCount = 0;

async function renderChat(){
  const msgs = await api("/api/chat");
  if(!Array.isArray(msgs)) return;
  lastChatCount = msgs.length;

  document.getElementById("v-chat").innerHTML=`
  <div style="display:flex;flex-direction:column;height:calc(100vh - 100px);max-width:800px;margin:0 auto">
    <div class="shd" style="margin-bottom:16px;flex-shrink:0">
      <div class="stitle">💬 Chat da Equipa</div>
      <span style="font-size:12px;color:var(--t3)">${S.users.filter(u=>u.online).length} online agora</span>
    </div>
    <div id="chat-msgs" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding:4px 0;margin-bottom:12px">
      ${msgs.length ? msgs.map(m=>renderChatMsg(m)).join("") : `<div class="empty-st"><div class="empty-i">💬</div><div class="empty-t">Sem mensagens ainda. Começa a conversa!</div></div>`}
    </div>
    <div style="flex-shrink:0;background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-end">
      <textarea id="chat-input" class="ai-inp" style="flex:1;min-height:40px;max-height:120px;resize:none" placeholder="Escreve uma mensagem... (Enter para enviar)" rows="1"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg()}"></textarea>
      <button class="ai-send" onclick="sendChatMsg()" title="Enviar">↑</button>
    </div>
  </div>`;
  // Scroll to bottom
  const el=document.getElementById("chat-msgs");
  if(el) el.scrollTop=el.scrollHeight;
  // Start polling
  if(chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval=setInterval(pollChat,5000);
}

function renderChatMsg(m){
  const u=S.users.find(x=>x.id===m.user_id);
  const isMe=m.user_id===S.user?.id;
  const time=new Date(m.created).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
  return`<div style="display:flex;gap:8px;align-items:flex-end;${isMe?"flex-direction:row-reverse":""};padding:2px 0" class="chat-msg" id="cm-${m.id}">
    ${!isMe?`<div class="av sm" style="background:${u?.color||"#666"};flex-shrink:0" title="${u?.name||"?"}">${u?.avatar||"?"}</div>`:""}
    <div style="max-width:70%">
      ${!isMe?`<div style="font-size:10.5px;color:var(--t3);margin-bottom:3px;padding-left:4px">${u?.name||"?"}</div>`:""}
      <div style="background:${isMe?"var(--a)":"var(--bg2)"};color:${isMe?"#fff":"var(--t)"};padding:9px 13px;border-radius:${isMe?"14px 14px 4px 14px":"14px 14px 14px 4px"};font-size:13px;line-height:1.5;border:${isMe?"none":"1px solid var(--b1)"};word-break:break-word">
        ${escHtml(m.text)}
      </div>
      <div style="font-size:10px;color:var(--t3);margin-top:3px;${isMe?"text-align:right":"padding-left:4px"};display:flex;gap:8px;${isMe?"justify-content:flex-end":""}">
        <span>${time}</span>
        ${isMe||S.user?.role==="admin"?`<span onclick="deleteChatMsg('${m.id}')" style="cursor:pointer;color:var(--t3)" title="Apagar">✕</span>`:""}
      </div>
    </div>
  </div>`;
}

function escHtml(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function sendChatMsg(){
  const inp=document.getElementById("chat-input");
  const text=inp?.value?.trim();
  if(!text) return;
  inp.value=""; inp.style.height="auto";
  const r=await api("/api/chat","POST",{text});
  if(r.error){ toast(r.error,"e"); return; }
  S.chatMsgs=(S.chatMsgs||[]);
  const el=document.getElementById("chat-msgs");
  if(el){
    const div=document.createElement("div");
    div.innerHTML=renderChatMsg(r);
    el.appendChild(div.firstChild);
    el.scrollTop=el.scrollHeight;
    lastChatCount++;
  }
}

async function deleteChatMsg(mid){
  const r=await api(`/api/chat/${mid}`,"DELETE");
  if(r.ok) document.getElementById("cm-"+mid)?.remove();
  else toast(r.error||"Erro","e");
}

async function pollChat(){
  if(S.view!=="chat") return;
  const msgs=await api("/api/chat");
  if(!Array.isArray(msgs)) return;
  if(msgs.length>lastChatCount){
    const el=document.getElementById("chat-msgs");
    if(el){
      const newMsgs=msgs.slice(lastChatCount);
      newMsgs.forEach(m=>{
        if(!document.getElementById("cm-"+m.id)){
          const div=document.createElement("div");
          div.innerHTML=renderChatMsg(m);
          el.appendChild(div.firstChild);
        }
      });
      el.scrollTop=el.scrollHeight;
      lastChatCount=msgs.length;
    }
  }
}


// ═══════════════════════════════════════════════
//  TEMPORIZADOR POR TAREFA
// ═══════════════════════════════════════════════
let activeTimers = {}; // taskId -> { startTime, interval }

async function startTaskTimer(tid){
  const r = await api(`/api/tasks/${tid}/timer/start`,"POST");
  if(r.error){ toast(r.error,"e"); return; }
  activeTimers[tid] = { startTime: Date.now(), timerId: r.id };
  toast("⏱️ Temporizador iniciado!","s");
  updateTimerUI(tid);
}

async function stopTaskTimer(tid){
  const note = prompt("Nota sobre o trabalho feito (opcional):") || "";
  const r = await api(`/api/tasks/${tid}/timer/stop`,"POST",{note});
  if(r.error){ toast(r.error,"e"); return; }
  delete activeTimers[tid];
  const mins = Math.round(r.duration/60);
  toast(`⏱️ ${mins} min registados!`,"s");
  // Refresh detail if open
  const t=S.tasks.find(x=>x.id===tid);
  if(t) renderDetail(t);
}

function updateTimerUI(tid){
  const btn=document.getElementById(`timer-btn-${tid}`);
  const display=document.getElementById(`timer-display-${tid}`);
  if(!btn||!display) return;
  if(activeTimers[tid]){
    btn.textContent="⏹ Parar";
    btn.onclick=()=>stopTaskTimer(tid);
    btn.style.background="rgba(239,68,68,.15)";
    btn.style.color="var(--err)";
    // Update display
    const interval=setInterval(()=>{
      if(!activeTimers[tid]){ clearInterval(interval); return; }
      const elapsed=Math.floor((Date.now()-activeTimers[tid].startTime)/1000);
      const h=Math.floor(elapsed/3600),m=Math.floor((elapsed%3600)/60),s=elapsed%60;
      if(display) display.textContent=`${h?h+"h ":""}${m}m ${s}s`;
    },1000);
  } else {
    btn.textContent="▶ Iniciar timer";
    btn.onclick=()=>startTaskTimer(tid);
    btn.style.background="";
    btn.style.color="";
    display.textContent="";
  }
}

function fmtDuration(secs){
  if(!secs) return "0min";
  const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60);
  return h ? `${h}h ${m}min` : `${m}min`;
}

async function renderTimerSection(tid){
  const timers = await api(`/api/tasks/${tid}/timers`);
  const totalSecs = (timers||[]).reduce((s,t)=>s+(t.duration||0),0);
  const isActive = !!activeTimers[tid];

  return`<div style="border-top:1px solid var(--b1);padding-top:14px;margin-top:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:12.5px;font-weight:700;color:var(--t2)">⏱️ Tempo Registado</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span id="timer-display-${tid}" style="font-size:12px;font-family:var(--mono);color:var(--a3)"></span>
        <button id="timer-btn-${tid}" class="btn-ghost" style="padding:5px 12px;font-size:12px" onclick="${isActive?`stopTaskTimer('${tid}')`:`startTaskTimer('${tid}')`}">
          ${isActive?"⏹ Parar":"▶ Iniciar timer"}
        </button>
      </div>
    </div>
    ${totalSecs?`<div style="font-size:12px;color:var(--t3);margin-bottom:8px">Total: <strong style="color:var(--t)">${fmtDuration(totalSecs)}</strong></div>`:""}
    ${(timers||[]).slice(0,5).map(t=>{
      const u=S.users.find(x=>x.id===t.user_id);
      return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--b1);font-size:11.5px">
        <div class="av sm" style="background:${u?.color||"#666"}">${u?.avatar||"?"}</div>
        <span style="color:var(--t2)">${fmtDuration(t.duration)}</span>
        ${t.note?`<span style="color:var(--t3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.note}</span>`:"<span style='flex:1'></span>"}
        <span style="color:var(--t3);font-family:var(--mono)">${new Date(t.created).toLocaleDateString("pt-PT",{day:"2-digit",month:"short"})}</span>
      </div>`;
    }).join("")}
  </div>`;
}

// ═══════════════════════════════════════════════
//  HISTÓRICO DE ALTERAÇÕES
// ═══════════════════════════════════════════════
async function renderTaskHistory(tid){
  const history = await api(`/api/tasks/${tid}/history`);
  if(!Array.isArray(history)||!history.length) return `<div style="font-size:12px;color:var(--t3);padding:8px 0">Sem histórico de alterações.</div>`;

  const fieldLabels={status:"Estado",priority:"Prioridade",assignee:"Responsável",deadline:"Prazo",title:"Título"};
  return`<div style="border-top:1px solid var(--b1);padding-top:14px;margin-top:14px">
    <div style="font-size:12.5px;font-weight:700;color:var(--t2);margin-bottom:10px">📋 Histórico de Alterações</div>
    ${history.slice(0,10).map(h=>{
      const time=new Date(h.created).toLocaleString("pt-PT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
      const oldV=h.field==="assignee"?S.users.find(u=>u.id===h.old_value)?.name||h.old_value:h.old_value;
      const newV=h.field==="assignee"?S.users.find(u=>u.id===h.new_value)?.name||h.new_value:h.new_value;
      return`<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--b1)">
        <div class="av sm" style="background:${h.user_color||"#666"};flex-shrink:0">${h.user_avatar||"?"}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px"><strong>${h.user_name||"Sistema"}</strong> alterou <span style="color:var(--a3)">${fieldLabels[h.field]||h.field}</span></div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">
            ${oldV?`<span style="text-decoration:line-through">${oldV}</span> → `:""}<span style="color:var(--t)">${newV||"—"}</span>
          </div>
        </div>
        <span style="font-size:10.5px;color:var(--t3);white-space:nowrap;flex-shrink:0">${time}</span>
      </div>`;
    }).join("")}
  </div>`;
}

// ═══════════════════════════════════════════════
//  ANEXOS
// ═══════════════════════════════════════════════
async function renderAttachments(tid){
  const attachments = await api(`/api/tasks/${tid}/attachments`);
  return`<div style="border-top:1px solid var(--b1);padding-top:14px;margin-top:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:12.5px;font-weight:700;color:var(--t2)">📎 Anexos ${attachments?.length?`(${attachments.length})`:""}</div>
      <label style="padding:5px 12px;border-radius:8px;background:var(--bg3);border:1px solid var(--b1);font-size:12px;cursor:pointer;color:var(--t2);font-weight:600">
        + Adicionar
        <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" style="display:none" onchange="uploadAttachment('${tid}',this)"/>
      </label>
    </div>
    <div id="att-list-${tid}">
      ${(attachments||[]).length?attachments.map(a=>renderAttachmentItem(a,tid)).join(""):`<div style="font-size:12px;color:var(--t3)">Sem anexos.</div>`}
    </div>
  </div>`;
}

function renderAttachmentItem(a, tid){
  const icon = a.mimetype?.startsWith("image/")?"🖼️":a.mimetype?.includes("pdf")?"📄":"📎";
  const size = a.size>1000000?`${(a.size/1000000).toFixed(1)}MB`:a.size>1000?`${Math.round(a.size/1000)}KB`:`${a.size}B`;
  return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--b1)" id="att-${a.id}">
    <span style="font-size:18px">${icon}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.filename}</div>
      <div style="font-size:10.5px;color:var(--t3)">${size} · ${new Date(a.created).toLocaleDateString("pt-PT")}</div>
    </div>
    <button onclick="downloadAttachment('${a.id}','${tid}','${a.filename}')" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--b1);border-radius:7px;cursor:pointer;font-size:11.5px;color:var(--t2)">↓ Download</button>
    <button onclick="deleteAttachment('${a.id}','${tid}')" style="padding:4px 8px;background:none;border:none;color:var(--t3);cursor:pointer;font-size:13px" title="Remover">✕</button>
  </div>`;
}

async function uploadAttachment(tid, input){
  const file=input.files[0]; if(!file) return;
  if(file.size>1500000){ toast("Ficheiro demasiado grande (máx 1.5MB)","e"); return; }
  toast("A carregar...","i");
  const reader=new FileReader();
  reader.onload=async(e)=>{
    const r=await api(`/api/tasks/${tid}/attachments`,"POST",{
      filename:file.name, mimetype:file.type, data:e.target.result
    });
    if(r.error){ toast(r.error,"e"); return; }
    toast(`"${file.name}" anexado!`,"s");
    const el=document.getElementById(`att-list-${tid}`);
    if(el){
      const noAtt=el.querySelector("div");
      if(noAtt&&noAtt.textContent.includes("Sem anexos")) el.innerHTML="";
      el.insertAdjacentHTML("afterbegin",renderAttachmentItem(r,tid));
    }
  };
  reader.readAsDataURL(file);
}

async function downloadAttachment(aid, tid, filename){
  const r=await api(`/api/tasks/${tid}/attachments/${aid}`);
  if(r.error){ toast(r.error,"e"); return; }
  const a=document.createElement("a");
  a.href=r.data; a.download=filename; a.click();
}

async function deleteAttachment(aid, tid){
  const r=await api(`/api/tasks/${tid}/attachments/${aid}`,"DELETE");
  if(r.ok){ document.getElementById(`att-${aid}`)?.remove(); toast("Anexo removido","i"); }
  else toast(r.error||"Erro","e");
}

// ═══════════════════════════════════════════════
//  DETAIL TABS — Timer, Histórico, Anexos
// ═══════════════════════════════════════════════
async function loadDetailTab(tid, tab){
  // Highlight active tab
  ["timer","history","attachments"].forEach(t=>{
    const btn=document.getElementById(`dtab-${tid}-${t}`);
    if(btn){
      btn.style.color = t===tab?"var(--a3)":"var(--t3)";
      btn.style.borderBottomColor = t===tab?"var(--a)":"transparent";
    }
  });
  const el=document.getElementById(`detail-tab-content-${tid}`);
  if(!el) return;
  el.innerHTML=`<div style="font-size:12px;color:var(--t3);padding:8px 0">A carregar...</div>`;
  if(tab==="timer")       el.innerHTML = await renderTimerSection(tid);
  else if(tab==="history") el.innerHTML = await renderTaskHistory(tid);
  else if(tab==="attachments") el.innerHTML = await renderAttachments(tid);
  // Re-bind timer UI if needed
  if(tab==="timer") updateTimerUI(tid);
}

// ═══════════════════════════════════════════════
//  NOTIFICAÇÕES PUSH NO BROWSER
// ═══════════════════════════════════════════════
const PUSH_KEY = "tf_push_enabled";

async function requestPushPermission(){
  if(!("Notification" in window)){
    toast("O teu browser não suporta notificações push","w"); return;
  }
  if(Notification.permission==="granted"){
    toast("Notificações push já estão ativas! ✅","s");
    localStorage.setItem(PUSH_KEY,"1");
    renderSettings(); return;
  }
  if(Notification.permission==="denied"){
    toast("Notificações bloqueadas. Permite nas definições do browser.","w"); return;
  }
  const perm = await Notification.requestPermission();
  if(perm==="granted"){
    localStorage.setItem(PUSH_KEY,"1");
    toast("Notificações push ativadas! 🔔","s");
    // Mostrar notificação de teste
    new Notification("TaskFlow", {
      body:"Notificações ativas! Vais receber alertas de prazos e menções.",
      icon:"/static/icons/icon-192.png",
      badge:"/static/icons/icon-192.png",
      tag:"taskflow-welcome"
    });
    renderSettings();
  } else {
    toast("Permissão negada","w");
  }
}

function disablePush(){
  localStorage.removeItem(PUSH_KEY);
  toast("Notificações push desativadas","i");
  renderSettings();
}

function sendPushNotification(title, body, tag="taskflow"){
  if(Notification.permission!=="granted") return;
  if(!localStorage.getItem(PUSH_KEY)) return;
  // Só envia se o documento estiver oculto (utilizador não está na página)
  if(!document.hidden) return;
  new Notification(title, { body, tag, icon:"/favicon.ico" });
}

// Verificar notificações não lidas e enviar push se necessário
async function checkPushNotifs(){
  if(Notification.permission!=="granted") return;
  if(!localStorage.getItem(PUSH_KEY)) return;
  if(!S.user) return;
  const notifs = await api("/api/notifications");
  if(!Array.isArray(notifs)) return;
  const unread = notifs.filter(n=>!n.read);
  if(unread.length>0 && document.hidden){
    const first = unread[0];
    sendPushNotification(
      first.title || "Nova notificação — TaskFlow",
      first.message || "",
      "taskflow-notif-"+first.id
    );
  }
  // Verificar tarefas com prazo hoje
  const today = tday();
  const urgente = S.tasks?.filter(t=>t.deadline===today && t.status!=="Concluído" && t.assignee===S.user?.id);
  if(urgente?.length>0 && document.hidden){
    sendPushNotification(
      `⏰ ${urgente.length} tarefa${urgente.length>1?"s":""} com prazo hoje!`,
      urgente.map(t=>t.title).join(", "),
      "taskflow-deadline-today"
    );
  }
}

// Verificar push a cada 2 minutos quando a página está oculta
setInterval(checkPushNotifs, 120000);
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden) checkPushNotifs();
});

// ═══════════════════════════════════════════════
//  TOUR GUIADO INTERATIVO
// ═══════════════════════════════════════════════
const TOUR_KEY = "tf_tour_done";

const TOUR_STEPS = [
  {
    target: ".sb-a[data-v='dashboard']",
    title: "📊 Dashboard",
    text: "Aqui tens uma visão geral de todas as tuas tarefas, projetos e atividade da equipa. Os widgets são personalizáveis!",
    pos: "right"
  },
  {
    target: ".sb-a[data-v='kanban']",
    title: "📋 Kanban",
    text: "Organiza as tuas tarefas em colunas. Arrasta e larga entre colunas, e usa os filtros avançados para focar no que importa.",
    pos: "right"
  },
  {
    target: ".sb-a[data-v='calendar']",
    title: "📅 Calendário",
    text: "Vê todos os eventos e prazos em formato de calendário. Clica num dia para criar um evento.",
    pos: "right"
  },
  {
    target: ".sb-a[data-v='chat']",
    title: "💬 Chat",
    text: "Comunica com a tua equipa em tempo real sem sair do TaskFlow.",
    pos: "right"
  },
  {
    target: "#btn-new-task",
    title: "✨ Nova Tarefa",
    text: "Cria uma nova tarefa rapidamente. Podes também pedir ao Gemini AI para criar tarefas por linguagem natural!",
    pos: "bottom"
  },
  {
    target: "#nb",
    title: "🔔 Notificações",
    text: "Aqui aparecem as tuas notificações — menções, tarefas atribuídas e alertas de prazo.",
    pos: "bottom"
  },
  {
    target: ".sb-quick-btn[onclick*='toggleAI']",
    title: "🤖 Gemini AI",
    text: "O assistente inteligente do TaskFlow. Pede resumos, insights ou cria tarefas com linguagem natural.",
    pos: "top"
  },
  {
    target: ".sb-user-card",
    title: "👤 O teu perfil",
    text: "Clica aqui para ver e editar o teu perfil, alterar foto e gerir as tuas definições.",
    pos: "top"
  },
];

let tourStep = 0;
let tourOverlay = null;

function startTour(force=false){
  if(!force && localStorage.getItem(TOUR_KEY)) return;
  tourStep = 0;
  showTourStep();
}

function showTourStep(){
  removeTourOverlay();
  if(tourStep >= TOUR_STEPS.length){ endTour(); return; }

  const step = TOUR_STEPS[tourStep];
  const el = document.querySelector(step.target);
  if(!el){ tourStep++; showTourStep(); return; }

  // Scroll elemento para vista
  el.scrollIntoView({ behavior:"smooth", block:"center" });

  // Overlay escurecido
  const ov = document.createElement("div");
  ov.id = "tour-overlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9990;pointer-events:none";
  document.body.appendChild(ov);

  // Highlight do elemento
  const rect = el.getBoundingClientRect();
  const highlight = document.createElement("div");
  highlight.style.cssText = `position:fixed;left:${rect.left-6}px;top:${rect.top-6}px;width:${rect.width+12}px;height:${rect.height+12}px;border:2.5px solid #6366f1;border-radius:10px;z-index:9991;pointer-events:none;box-shadow:0 0 0 4px rgba(99,102,241,.25);animation:tourPulse 1.5s ease infinite`;
  document.body.appendChild(highlight);

  // Tooltip
  const tip = document.createElement("div");
  tip.id = "tour-tip";
  tip.style.cssText = `position:fixed;z-index:9992;background:#1a1a35;border:1.5px solid #6366f1;border-radius:14px;padding:18px 20px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,.5)`;

  // Posicionar tooltip
  let tipLeft = rect.right + 16;
  let tipTop  = rect.top + rect.height/2 - 80;
  if(step.pos==="bottom"){ tipLeft=rect.left; tipTop=rect.bottom+12; }
  if(step.pos==="top")   { tipLeft=rect.left; tipTop=rect.top-180; }
  if(step.pos==="right" && rect.right+300 > window.innerWidth){ tipLeft=rect.left-300; }

  tip.style.left = Math.max(10, Math.min(tipLeft, window.innerWidth-300)) + "px";
  tip.style.top  = Math.max(10, tipTop) + "px";

  tip.innerHTML = `
    <div style="font-size:10px;color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">
      Passo ${tourStep+1} de ${TOUR_STEPS.length}
    </div>
    <div style="font-size:14.5px;font-weight:800;color:#fff;margin-bottom:8px">${step.title}</div>
    <div style="font-size:12.5px;color:#ccccdd;line-height:1.6;margin-bottom:16px">${step.text}</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="display:flex;gap:4px;flex:1">
        ${TOUR_STEPS.map((_,i)=>`<div style="width:${i===tourStep?18:6}px;height:6px;border-radius:3px;background:${i===tourStep?"#6366f1":"#333355"};transition:all .25s"></div>`).join("")}
      </div>
      <button onclick="skipTour()" style="padding:5px 10px;background:none;border:1px solid #333355;border-radius:7px;color:#8888aa;font-size:11.5px;cursor:pointer">Saltar</button>
      <button onclick="nextTourStep()" style="padding:6px 16px;background:#6366f1;border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:700;cursor:pointer">
        ${tourStep===TOUR_STEPS.length-1?"Concluir ✓":"Próximo →"}
      </button>
    </div>`;

  document.body.appendChild(tip);
  tourOverlay = { ov, highlight, tip };
}

function nextTourStep(){
  tourStep++;
  showTourStep();
}

function skipTour(){
  endTour();
  toast("Tour ignorado. Podes reiniciá-lo em Definições → Perfil","i");
}

function endTour(){
  removeTourOverlay();
  localStorage.setItem(TOUR_KEY,"1");
  toast("🎉 Tour concluído! Já conheces o TaskFlow.","s");
}

function removeTourOverlay(){
  document.getElementById("tour-overlay")?.remove();
  document.getElementById("tour-tip")?.remove();
  if(tourOverlay?.highlight) tourOverlay.highlight.remove();
  tourOverlay = null;
}

// CSS do tour
document.head.insertAdjacentHTML("beforeend",`<style>
@keyframes tourPulse {
  0%,100%{ box-shadow:0 0 0 4px rgba(99,102,241,.25); }
  50%{ box-shadow:0 0 0 8px rgba(99,102,241,.1); }
}
</style>`);

// ═══════════════════════════════════════════════
//  DEPENDÊNCIAS ENTRE TAREFAS
// ═══════════════════════════════════════════════
function isTaskBlocked(task){
  if(!task.dependencies?.length) return false;
  return task.dependencies.some(depId=>{
    const dep = S.tasks.find(t=>t.id===depId);
    return dep && dep.status!=="Concluído";
  });
}

function getBlockedBy(task){
  if(!task.dependencies?.length) return [];
  return task.dependencies
    .map(id=>S.tasks.find(t=>t.id===id))
    .filter(t=>t && t.status!=="Concluído");
}

function openDepsModal(taskId){
  const task = S.tasks.find(t=>t.id===taskId);
  if(!task) return;
  const deps = task.dependencies||[];
  const others = S.tasks.filter(t=>t.id!==taskId && t.status!=="Concluído");

  const mo = document.createElement("div");
  mo.className="mo";
  mo.innerHTML=`<div class="modal" style="max-width:480px;padding:28px">
    <div class="mhd" style="margin-bottom:18px">
      <h3>🔗 Dependências — "${task.title}"</h3>
      <button onclick="this.closest('.mo').remove()">✕</button>
    </div>
    <p style="font-size:12.5px;color:var(--t3);margin-bottom:16px;line-height:1.6">
      Esta tarefa só pode ser iniciada após as tarefas selecionadas estarem <strong style="color:var(--ok)">Concluídas</strong>.
    </p>
    <div style="margin-bottom:16px;max-height:260px;overflow-y:auto">
      ${others.length ? others.map(t=>{
        const checked = deps.includes(t.id);
        const proj = S.projects.find(p=>p.id===t.project);
        return`<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;border:1px solid ${checked?"var(--a)":"var(--b1)"};background:${checked?"rgba(99,102,241,.07)":"var(--bg3)"};margin-bottom:6px;transition:all .15s">
          <input type="checkbox" ${checked?"checked":""} data-tid="${t.id}" style="accent-color:var(--a);width:15px;height:15px"/>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</div>
            <div style="font-size:11px;color:var(--t3)">${proj?proj.icon+" "+proj.name:""} · ${PRIO[t.priority]?.l}</div>
          </div>
          <div class="pri" style="background:${PRIO[t.priority]?.bg};color:${PRIO[t.priority]?.c};flex-shrink:0">${PRIO[t.priority]?.l}</div>
        </label>`;
      }).join("") : `<div style="font-size:12.5px;color:var(--t3);text-align:center;padding:20px">Sem outras tarefas disponíveis.</div>`}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-ghost" onclick="this.closest('.mo').remove()">Cancelar</button>
      <button class="btn-cta" onclick="saveDeps('${taskId}',this)">💾 Guardar</button>
    </div>
  </div>`;

  // Highlight ao clicar label
  mo.querySelectorAll("label").forEach(lbl=>{
    lbl.addEventListener("change",()=>{
      const cb=lbl.querySelector("input");
      lbl.style.border=`1px solid ${cb.checked?"var(--a)":"var(--b1)"}`;
      lbl.style.background=cb.checked?"rgba(99,102,241,.07)":"var(--bg3)";
    });
  });
  document.body.appendChild(mo);
}

async function saveDeps(taskId, btn){
  const mo = btn.closest(".mo");
  const checked = [...mo.querySelectorAll("input[type=checkbox]:checked")].map(cb=>cb.dataset.tid);
  btn.disabled=true; btn.textContent="A guardar...";
  await api(`/api/tasks/${taskId}`,"PATCH",{dependencies:checked});
  const t=S.tasks.find(x=>x.id===taskId); if(t) t.dependencies=checked;
  mo.remove();
  toast(checked.length?`${checked.length} dependência${checked.length>1?"s":""} definida${checked.length>1?"s":""}!`:"Dependências removidas","s");
  renderKanban();
}

// ═══════════════════════════════════════════════
//  GOOGLE CALENDAR SYNC
// ═══════════════════════════════════════════════
const GCAL_CLIENT_ID = "196981053682-28hre629rjctqs5v977j68u4h9l2aitb.apps.googleusercontent.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
let gcalToken = localStorage.getItem("tf_gcal_token") || null;
let gcalTokenExpiry = parseInt(localStorage.getItem("tf_gcal_expiry")||"0");

function isGcalConnected(){
  return gcalToken && Date.now() < gcalTokenExpiry;
}

async function connectGcal(){
  const params = new URLSearchParams({
    client_id: GCAL_CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: "token",
    scope: GCAL_SCOPE,
    prompt: "consent"
  });
  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params;
}

function disconnectGcal(){
  gcalToken=null; gcalTokenExpiry=0;
  localStorage.removeItem("tf_gcal_token");
  localStorage.removeItem("tf_gcal_expiry");
  toast("Google Calendar desligado","i");
  renderSettings();
}

// Interceptar callback OAuth na URL
function checkGcalCallback(){
  const hash = window.location.hash;
  if(!hash.includes("access_token")) return;
  const params = new URLSearchParams(hash.replace("#","?"));
  const token = params.get("access_token");
  const expiresIn = parseInt(params.get("expires_in")||"3600");
  if(token){
    gcalToken = token;
    gcalTokenExpiry = Date.now() + expiresIn*1000;
    localStorage.setItem("tf_gcal_token", token);
    localStorage.setItem("tf_gcal_expiry", gcalTokenExpiry);
    window.location.hash = "";
    toast("✅ Google Calendar ligado!","s");
    renderSettings();
  }
}
checkGcalCallback();

async function syncEventToGcal(ev){
  if(!isGcalConnected()){ toast("Liga o Google Calendar primeiro","w"); return; }
  try {
    const body = {
      summary: ev.title,
      description: ev.description||"",
      start: ev.all_day
        ? { date: ev.start_time?.slice(0,10) }
        : { dateTime: ev.start_time, timeZone:"Europe/Lisbon" },
      end: ev.all_day
        ? { date: ev.end_time?.slice(0,10)||ev.start_time?.slice(0,10) }
        : { dateTime: ev.end_time||ev.start_time, timeZone:"Europe/Lisbon" },
      colorId: ev.color ? colorToGcalId(ev.color) : "1"
    };
    const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events",{
      method:"POST",
      headers:{ Authorization:`Bearer ${gcalToken}`, "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    if(resp.ok){
      toast(`"${ev.title}" exportado para o Google Calendar! 📅`,"s");
    } else {
      const err = await resp.json();
      if(err.error?.code===401){ disconnectGcal(); toast("Sessão expirada. Liga novamente.","w"); }
      else toast("Erro ao exportar evento","e");
    }
  } catch(e){ toast("Erro de ligação","e"); }
}

async function syncAllEventsToGcal(){
  if(!isGcalConnected()){ toast("Liga o Google Calendar primeiro","w"); return; }
  if(!S.events?.length){ toast("Sem eventos para exportar","i"); return; }
  let ok=0, fail=0;
  toast("A exportar eventos...","i");
  for(const ev of S.events){
    try{
      const body = {
        summary: ev.title,
        description: ev.description||"",
        start: ev.all_day ? {date:ev.start_time?.slice(0,10)} : {dateTime:ev.start_time, timeZone:"Europe/Lisbon"},
        end:   ev.all_day ? {date:ev.end_time?.slice(0,10)||ev.start_time?.slice(0,10)} : {dateTime:ev.end_time||ev.start_time, timeZone:"Europe/Lisbon"},
      };
      const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events",{
        method:"POST", headers:{Authorization:`Bearer ${gcalToken}`,"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      r.ok ? ok++ : fail++;
    } catch(e){ fail++; }
  }
  toast(`✅ ${ok} evento${ok!==1?"s":""} exportado${ok!==1?"s":""}${fail?` (${fail} falharam)`:""}!`, ok>0?"s":"e");
}

async function importGcalEvents(){
  if(!isGcalConnected()){ toast("Liga o Google Calendar primeiro","w"); return; }
  try {
    const now = new Date().toISOString();
    const end = new Date(Date.now()+30*24*3600000).toISOString();
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${end}&maxResults=20&singleEvents=true&orderBy=startTime`,{
      headers:{ Authorization:`Bearer ${gcalToken}` }
    });
    if(!resp.ok){ toast("Erro ao importar eventos","e"); return; }
    const data = await resp.json();
    const items = data.items||[];
    let imported=0;
    for(const item of items){
      const start = item.start?.dateTime||item.start?.date;
      const end   = item.end?.dateTime||item.end?.date;
      if(!start) continue;
      const r = await api("/api/events","POST",{
        title: item.summary||"Evento Google",
        description: item.description||"",
        start_time: start,
        end_time: end||start,
        color: "#4285F4",
        type: "meeting",
        all_day: !!item.start?.date
      });
      if(!r.error){ S.events.push(r); imported++; }
    }
    toast(`📅 ${imported} evento${imported!==1?"s":""} importado${imported!==1?"s":""}!`, imported>0?"s":"i");
    if(S.view==="calendar") renderCal();
  } catch(e){ toast("Erro ao importar","e"); }
}

function colorToGcalId(hex){
  const map = {"#ef4444":"11","#f97316":"6","#f59e0b":"5","#22c55e":"10","#3b82f6":"9","#6366f1":"9","#8b5cf6":"3","#ec4899":"4"};
  return map[hex]||"1";
}

// Botão exportar num evento do calendário
function exportEventToGcal(evId){
  const ev = S.events.find(e=>e.id===evId);
  if(ev) syncEventToGcal(ev);
}

// ═══════════════════════════════════════════════
//  RECONHECIMENTO DE VOZ
// ═══════════════════════════════════════════════
let voiceRecognition = null;
let isListening = false;

function initVoice(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    toast("O teu browser não suporta reconhecimento de voz. Usa o Chrome.","w");
    return null;
  }
  const r = new SpeechRecognition();
  r.lang = "pt-PT";
  r.continuous = false;
  r.interimResults = false; // só resultado final — evita envio prematuro
  r.maxAlternatives = 3;
  return r;
}

function toggleVoiceInput(targetInputId){
  if(isListening){ stopVoice(); return; }

  const rec = initVoice();
  if(!rec) return;

  // Verificar permissão do microfone
  if(navigator.permissions){
    navigator.permissions.query({name:"microphone"}).then(status=>{
      if(status.state==="denied"){
        toast("🎤 Microfone bloqueado! Clica no cadeado 🔒 na barra de endereço e permite o microfone.","e");
        return;
      }
      _startVoice(rec, targetInputId);
    }).catch(()=>_startVoice(rec, targetInputId));
  } else {
    _startVoice(rec, targetInputId);
  }
}

function _startVoice(rec, targetInputId){
  voiceRecognition = rec;
  isListening = true;
  let gotResult = false;

  const btn = document.getElementById("voice-btn");
  if(btn){
    btn.textContent="🔴";
    btn.title="A ouvir... (clica para parar)";
    btn.style.color="var(--err)";
    btn.style.animation="voicePulse 0.8s ease infinite";
  }

  // Toast com countdown visual
  toast("🎤 A ouvir... fala agora!","i");

  rec.onstart = ()=>{
  };

  rec.onresult = (e)=>{
    gotResult = true;
    // Pegar o melhor resultado
    let best = "";
    for(let i=0; i<e.results[0].length; i++){
      if(e.results[0][i].confidence > (e.results[0][best?0:i]?.confidence||0)){
        best = e.results[0][i].transcript;
      }
    }
    if(!best) best = e.results[0][0].transcript;
    best = best.trim();


    const inp = document.getElementById(targetInputId||"ai-inp");
    if(inp){
      inp.value = best;
      // Disparar evento input para o textarea crescer
      inp.dispatchEvent(new Event("input"));
    }

    stopVoice();
    toast(`🎤 Captado: "${best}"`, "s");

    // Enviar automaticamente para o Gemini AI
    if((targetInputId||"ai-inp")==="ai-inp" && best){
      setTimeout(()=>sendAIInput(), 500);
    }
  };

  rec.onerror = (e)=>{
    console.error("[Voice] Erro:", e.error);
    stopVoice();
    const msgs = {
      "not-allowed": "🎤 Microfone bloqueado! Clica no 🔒 na barra de endereço → Permite microfone → Recarrega a página.",
      "no-speech":   "🎤 Nenhuma fala detetada. Fala mais perto do microfone e tenta novamente.",
      "audio-capture":"🎤 Microfone não encontrado. Verifica se está ligado.",
      "network":     "🎤 Erro de rede no reconhecimento de voz.",
      "aborted":     "🎤 Cancelado.",
    };
    toast(msgs[e.error]||`🎤 Erro: ${e.error}`, e.error==="aborted"?"i":"e");
  };

  rec.onend = ()=>{
    if(!gotResult && isListening){
      stopVoice();
      toast("🎤 Nenhuma fala detetada. Tenta novamente.","w");
    }
    isListening = false;
  };

  try {
    rec.start();
  } catch(e){
    console.error("[Voice] Erro ao iniciar:", e);
    stopVoice();
    toast("Erro ao iniciar microfone: "+e.message,"e");
  }
}

function stopVoice(){
  isListening = false;
  try { voiceRecognition?.stop(); } catch(e){}
  voiceRecognition = null;
  const btn = document.getElementById("voice-btn");
  if(btn){
    btn.textContent="🎤";
    btn.title="Criar tarefa por voz";
    btn.style.color="";
    btn.style.animation="";
  }
}

// CSS do botão de voz
document.head.insertAdjacentHTML("beforeend",`<style>
@keyframes voicePulse {
  0%,100%{ transform:scale(1); opacity:1; }
  50%{ transform:scale(1.2); opacity:.7; }
}
.voice-btn-wrap {
  position:relative; display:inline-flex; align-items:center;
}
.voice-btn-wrap::before {
  content:''; position:absolute; inset:-4px; border-radius:50%;
  border:2px solid var(--err); opacity:0; transition:opacity .2s;
}
.voice-btn-wrap.listening::before { opacity:1; animation:voicePulse .8s ease infinite; }
</style>`);

// ═══════════════════════════════════════════════
//  EXPORTAR KANBAN COMO PNG
// ═══════════════════════════════════════════════
async function exportKanbanPNG(){
  const kanbanEl = document.querySelector(".kanban");
  if(!kanbanEl){ toast("Abre o Kanban primeiro","w"); return; }

  toast("📸 A capturar Kanban...","i");

  // Carregar html2canvas se necessário
  if(!window.html2canvas){
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  try {
    // Guardar scroll position e temporariamente expandir
    const scrollX = window.scrollX, scrollY = window.scrollY;

    const canvas = await html2canvas(kanbanEl, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0d0d1a",
      scale: 2, // alta resolução
      useCORS: true,
      logging: false,
      scrollX: 0, scrollY: 0,
      windowWidth: kanbanEl.scrollWidth + 40,
      windowHeight: kanbanEl.scrollHeight + 40,
    });

    // Adicionar header com título e data
    const finalCanvas = document.createElement("canvas");
    const headerH = 60;
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height + headerH * 2;
    const ctx = finalCanvas.getContext("2d");

    // Fundo header
    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Header text
    ctx.fillStyle = "#6366f1";
    ctx.font = `bold ${headerH * 0.5}px Arial`;
    ctx.fillText("⚡ TaskFlow — Kanban", 30, headerH * 0.65);

    ctx.fillStyle = "#8888aa";
    ctx.font = `${headerH * 0.3}px Arial`;
    const dateStr = new Date().toLocaleDateString("pt-PT",{day:"2-digit",month:"long",year:"numeric"});
    ctx.fillText(dateStr, 30, headerH * 0.9);

    // Kanban image
    ctx.drawImage(canvas, 0, headerH);

    // Download
    const link = document.createElement("a");
    link.download = `TaskFlow_Kanban_${new Date().toISOString().slice(0,10)}.png`;
    link.href = finalCanvas.toDataURL("image/png", 0.95);
    link.click();

    toast("✅ Kanban exportado como PNG!","s");
  } catch(e){
    console.error(e);
    toast("Erro ao exportar: "+e.message,"e");
  }
}

// ═══════════════════════════════════════════════
//  CHECKLIST DE ONBOARDING NO DASHBOARD
// ═══════════════════════════════════════════════
const SETUP_KEY = "tf_setup_done";
const SETUP_DISMISSED_KEY = "tf_setup_dismissed";

function getSetupSteps(){
  const hasProject    = S.projects.filter(p=>p.status!=="archived").length > 0;
  const hasTask       = S.tasks.length > 0;
  const hasDoneTask   = S.tasks.some(t=>t.status==="Concluído");
  const hasTeamMember = S.users.length > 1;
  const hasGemini     = S.hasGemini;
  const hasPicture    = !!S.user?.picture;
  const hasPush       = Notification?.permission==="granted" && localStorage.getItem(PUSH_KEY);
  const hasChat       = false; // sempre mostra para incentivar

  return [
    { id:"project",   done:hasProject,    icon:"📁", title:"Criar o primeiro projeto",     desc:"Organiza o teu trabalho em projetos",           action:()=>openNewProj() },
    { id:"task",      done:hasTask,       icon:"✅", title:"Criar a primeira tarefa",      desc:"Adiciona uma tarefa ao teu projeto",            action:()=>document.getElementById("btn-new-task")?.click() },
    { id:"done",      done:hasDoneTask,   icon:"🎉", title:"Concluir uma tarefa",          desc:"Marca uma tarefa como Concluída",               action:()=>nav("kanban") },
    { id:"team",      done:hasTeamMember, icon:"👥", title:"Convidar um membro",           desc:"Convida alguém para a tua equipa",              action:()=>{ S.stab="equipa"; nav("settings"); } },
    { id:"ai",        done:hasGemini,     icon:"🤖", title:"Configurar Gemini AI",         desc:"Ativa a IA para criar tarefas por voz",        action:()=>{ S.stab="ia"; nav("settings"); } },
    { id:"picture",   done:hasPicture,    icon:"🖼️", title:"Adicionar foto de perfil",     desc:"Personaliza o teu perfil",                     action:()=>{ S.stab="perfil"; nav("settings"); } },
    { id:"push",      done:hasPush,       icon:"🔔", title:"Ativar notificações push",     desc:"Recebe alertas mesmo sem a página aberta",     action:()=>requestPushPermission() },
    { id:"chat",      done:false,         icon:"💬", title:"Enviar mensagem no chat",      desc:"Fala com a tua equipa no chat interno",        action:()=>nav("chat") },
  ];
}

function buildSetupWidget(){
  if(localStorage.getItem(SETUP_DISMISSED_KEY)) return "";

  const steps = getSetupSteps();
  const done  = steps.filter(s=>s.done).length;
  const total = steps.length;
  const pct   = Math.round(done/total*100);

  if(pct===100){
    localStorage.setItem(SETUP_KEY,"1");
    return "";
  }

  return`<div class="card" style="margin-bottom:16px;border:1.5px solid rgba(99,102,241,.3);position:relative">
    <button onclick="localStorage.setItem('${SETUP_DISMISSED_KEY}','1');renderDash()" style="position:absolute;top:10px;right:12px;background:none;border:none;color:var(--t3);cursor:pointer;font-size:16px" title="Dispensar">✕</button>
    <div class="shd" style="margin-bottom:14px">
      <div>
        <div class="stitle">🚀 Configura o teu TaskFlow</div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:2px">${done} de ${total} passos concluídos</div>
      </div>
    </div>
    <!-- Barra de progresso geral -->
    <div style="background:var(--bg3);border-radius:6px;height:8px;margin-bottom:16px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#6366f1,#a78bfa);border-radius:6px;transition:width .5s ease"></div>
    </div>
    <!-- Grid de passos -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${steps.map(step=>`
        <div onclick="${step.done?"":"("+step.action.toString()+")()"}" style="display:flex;align-items:center;gap:9px;padding:9px 11px;background:${step.done?"rgba(34,197,94,.06)":"var(--bg3)"};border:1px solid ${step.done?"rgba(34,197,94,.2)":"var(--b1)"};border-radius:9px;cursor:${step.done?"default":"pointer"};transition:all .15s" ${step.done?"":' onmouseenter="this.style.borderColor=\'var(--a)\'" onmouseleave="this.style.borderColor=\'var(--b1)\'"'}>
          <div style="width:22px;height:22px;border-radius:50%;background:${step.done?"var(--ok)":"var(--bg2)"};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;border:1.5px solid ${step.done?"var(--ok)":"var(--b1)"}">
            ${step.done?"✓":step.icon}
          </div>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:${step.done?"500":"700"};color:${step.done?"var(--t3)":"var(--t)"};text-decoration:${step.done?"line-through":"none"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${step.title}</div>
            ${!step.done?`<div style="font-size:10.5px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${step.desc}</div>`:""}
          </div>
        </div>
      `).join("")}
    </div>
    ${pct>=75?`<div style="margin-top:12px;padding:8px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;font-size:12px;color:#f59e0b">🎉 Quase lá! Só mais ${total-done} passo${total-done>1?"s":""}!</div>`:""}
  </div>`;
}
