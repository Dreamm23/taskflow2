# TaskFlow v5
### Gestor de Tarefas com Gemini AI · Google OAuth · Kanban · Calendário

---

## 🚀 Instalação Rápida (Windows)

1. Instala **Python** em [python.org](https://www.python.org/downloads/) *(marca "Add to PATH")*
2. Extrai esta pasta
3. Duplo clique em **`iniciar.bat`**
4. Abre **http://localhost:5000** no browser

---

## 🤖 Ativar Gemini AI (grátis)

1. Vai a [aistudio.google.com](https://aistudio.google.com)
2. Clica **Get API Key** → **Create API key**
3. Na app: **Definições → Gemini AI** → cola a chave → Guardar

---

## 🔐 Ativar Login com Google

1. Vai a [console.cloud.google.com](https://console.cloud.google.com)
2. Cria projeto → **APIs & Services** → **OAuth 2.0 Client IDs**
3. Authorized origins: `http://localhost:5000`
4. Na app: **Definições → Integrações** → cola o Client ID

---

## 👤 Contas Demo

| Email                   | Password    | Cargo   |
|-------------------------|-------------|---------|
| ana@taskflow.io         | admin123    | Admin   |
| bruno@taskflow.io       | manager123  | Manager |
| carla@taskflow.io       | membro123   | Member  |
| david@taskflow.io       | membro123   | Member  |
| eva@taskflow.io         | viewer123   | Viewer  |

---

## ✨ Funcionalidades

- **Dashboard** — Estatísticas, gráfico semanal, projetos, eventos, atividade
- **Kanban** — Drag & drop entre colunas, filtro por projeto
- **Calendário** — Vistas Mês / Semana / Dia estilo Google Calendar
- **Relatórios** — Analytics completos, exportação PDF
- **Gemini AI** — Chatbot com contexto completo das tarefas
- **Google OAuth** — Login com conta Google
- **Pomodoro** — Timer com anel animado e contador de sessões
- **Notas** — Editor inline com auto-save e cores
- **Equipa** — Perfis, skills, produtividade, sistema de cargos
- **Definições** — Perfil, segurança, notificações, integrações

---

## 📁 Estrutura

```
tf5/
├── app.py              ← Backend Flask + API + Gemini proxy
├── requirements.txt    ← Dependências (só Flask)
├── iniciar.bat         ← Instalador Windows
├── README.md
├── templates/
│   └── index.html      ← SPA com todos os modais
└── static/
    ├── css/style.css   ← Dark mode clean design system
    └── js/app.js       ← Toda a lógica frontend
```

---

*TaskFlow v5 · PAP Informática*
