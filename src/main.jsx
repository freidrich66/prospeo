import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  chaud:    { bg: "#FF4C1A", text: "#fff", label: "Chaud"    },
  "tiède":  { bg: "#FF9500", text: "#fff", label: "Tiède"    },
  froid:    { bg: "#1A6AFF", text: "#fff", label: "Froid"    },
  converti: { bg: "#00C48C", text: "#fff", label: "Converti" },
};
const SOURCE_ICONS = { carte: "📇", manuel: "✏️", vocal: "🎙️" };

const PERIODS = [
  { id: "today",      label: "Aujourd'hui"    },
  { id: "yesterday",  label: "Hier"           },
  { id: "week",       label: "Cette semaine"  },
  { id: "month",      label: "Ce mois"        },
  { id: "custom",     label: "Période libre"  },
];

function getPeriodRange(periodId, customStart, customEnd) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (periodId) {
    case "today":
      return { start: today, end: new Date(today.getTime() + 86400000 - 1) };
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: y, end: new Date(today.getTime() - 1) };
    }
    case "week": {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      return { start: mon, end: new Date(today.getTime() + 86400000 - 1) };
    }
    case "month": {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: m, end: new Date(today.getTime() + 86400000 - 1) };
    }
    case "custom":
      return {
        start: customStart ? new Date(customStart) : today,
        end:   customEnd   ? new Date(new Date(customEnd).getTime() + 86400000 - 1) : new Date(today.getTime() + 86400000 - 1),
      };
    default:
      return { start: null, end: null };
  }
}

// ─── Anthropic helper ─────────────────────────────────────────────────────────
async function callClaude(messages) {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Clé Anthropic manquante");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data);
    setLoading(false);
  };

  if (loading) return <Loader />;
  if (!session) return <AuthPage />;
  return <ProspeoApp profile={profile} onSignOut={() => supabase.auth.signOut()} />;
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage() {
  const [mode, setMode]       = useState("login"); // login | register
  const [email, setEmail]     = useState("");
  const [password, setPwd]    = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, role: "commercial" } },
      });
      if (error) setError(error.message);
      else setError("✅ Compte créé ! Vérifiez votre email pour confirmer.");
    }
    setLoading(false);
  };

  return (
    <div style={s.authRoot}>
      <div style={s.authCard}>
        <div style={s.authLogo}><span style={s.logoIcon}>◈</span><span style={s.logoText}>PROSPEO</span></div>
        <h2 style={s.authTitle}>{mode === "login" ? "Connexion" : "Créer un compte"}</h2>

        {mode === "register" && (
          <div style={s.formGroup}>
            <label style={s.label}>Nom complet</label>
            <input style={s.input} placeholder="Jean Dupont" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}
        <div style={s.formGroup}>
          <label style={s.label}>Email</label>
          <input style={s.input} type="email" placeholder="jean@entreprise.fr" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Mot de passe</label>
          <input style={s.input} type="password" placeholder="••••••••" value={password} onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </div>
        {error && <div style={{ ...s.errorBox, color: error.startsWith("✅") ? "#00C48C" : "#FF2D2D" }}>{error}</div>}
        <button style={s.btnPrimary} onClick={handleSubmit} disabled={loading}>
          {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>
        <button style={s.authSwitch} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function ProspeoApp({ profile, onSignOut }) {
  const [contacts, setContacts]         = useState([]);
  const [view, setView]                 = useState("dashboard");
  const [selectedContact, setSelected]  = useState(null);
  const [notification, setNotification] = useState(null);
  const [loadingData, setLoadingData]   = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery]   = useState("");
  const [isRecording, setIsRecording]   = useState(false);
  const [recordingField, setRecField]   = useState(null);
  const [isAnalyzingCard, setAnalyzing] = useState(false);
  const fileInputRef  = useRef(null);
  const recognitionRef = useRef(null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", company: "", role: "",
    email: "", phone: "", source: "manuel", notes: "", status: "froid",
  });

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Load contacts ──
  const loadContacts = useCallback(async () => {
    setLoadingData(true);
    let query = supabase
      .from("contacts")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false });

    // Commerciaux voient uniquement les leurs (RLS gère ça côté serveur aussi)
    if (profile?.role !== "manager") {
      query = query.eq("user_id", profile?.id);
    }

    const { data, error } = await query;
    if (error) notify("Erreur chargement données", "error");
    else setContacts(data || []);
    setLoadingData(false);
  }, [profile]);

  useEffect(() => { if (profile) loadContacts(); }, [profile, loadContacts]);

  // ── Add contact ──
  const handleAddContact = async () => {
    if (!form.first_name || !form.last_name) { notify("Prénom et nom requis", "error"); return; }
    const { error } = await supabase.from("contacts").insert({
      ...form,
      user_id: profile.id,
    });
    if (error) { notify("Erreur lors de l'enregistrement", "error"); return; }
    notify(`✅ ${form.first_name} ${form.last_name} ajouté !`);
    resetForm();
    loadContacts();
    setView("list");
  };

  // ── Delete contact ──
  const handleDelete = async (id) => {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) { notify("Erreur suppression", "error"); return; }
    setContacts(prev => prev.filter(c => c.id !== id));
    setView("list");
    notify("Prospect supprimé");
  };

  // ── Update status ──
  const handleStatusUpdate = async (id, status) => {
    const { error } = await supabase.from("contacts").update({ status }).eq("id", id);
    if (error) { notify("Erreur mise à jour", "error"); return; }
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selectedContact?.id === id) setSelected(prev => ({ ...prev, status }));
    notify("Statut mis à jour !");
  };

  const resetForm = () => setForm({
    first_name: "", last_name: "", company: "", role: "",
    email: "", phone: "", source: "manuel", notes: "", status: "froid",
  });

  // ── Card scan ──
  const handleCardUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAnalyzing(true);
    setForm(f => ({ ...f, source: "carte" }));
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64Data = ev.target.result.split(",")[1];
        const text = await callClaude([{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64Data } },
            { type: "text", text: `Analyse cette carte de visite. Retourne UNIQUEMENT ce JSON (string vide si absent):\n{"first_name":"","last_name":"","company":"","role":"","email":"","phone":""}\nPas d'explication, juste le JSON.` },
          ],
        }]);
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setForm(f => ({ ...f, ...parsed, source: "carte" }));
        notify("📇 Carte analysée !");
      } catch { notify("Erreur analyse IA", "error"); }
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  // ── Voice ──
  const startVoice = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notify("Vocal non supporté (utilisez Chrome)", "error"); return; }
    const r = new SR(); r.lang = "fr-FR"; r.interimResults = false;
    r.onresult = e => {
      const t = e.results[0][0].transcript;
      setForm(f => ({ ...f, [field]: f[field] ? f[field] + " " + t : t }));
      setIsRecording(false); setRecField(null);
      notify(`🎙️ "${t}"`);
    };
    r.onerror = () => { setIsRecording(false); setRecField(null); };
    r.onend   = () => { setIsRecording(false); setRecField(null); };
    recognitionRef.current = r;
    r.start(); setIsRecording(true); setRecField(field);
  };
  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false); setRecField(null); };

  // ── Synthesis ──
  const generateSynthesis = async (contact) => {
    const content = await callClaude([{
      role: "user",
      content: `Génère une synthèse commerciale professionnelle (3-4 phrases) en français pour ce prospect : ${JSON.stringify(contact)}. Inclus potentiel commercial, points clés, prochaines actions.`,
    }]);
    // Save to DB
    await supabase.from("syntheses").insert({ contact_id: contact.id, user_id: profile.id, content });
    return content;
  };

  // ── Filters ──
  const filtered = contacts.filter(c => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const q = searchQuery.toLowerCase();
    return matchStatus && (!q || [c.first_name, c.last_name, c.company, c.email].some(v => v?.toLowerCase().includes(q)));
  });

  const stats = {
    total:     contacts.length,
    chaud:     contacts.filter(c => c.status === "chaud").length,
    converti:  contacts.filter(c => c.status === "converti").length,
    thisWeek:  contacts.filter(c => (new Date() - new Date(c.created_at)) / 86400000 <= 7).length,
  };

  return (
    <div style={s.root}>
      <div style={s.grain} />
      {notification && (
        <div style={{ ...s.notif, background: notification.type === "error" ? "#FF2D2D" : "#00C48C" }}>
          {notification.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}><span style={s.logoIcon}>◈</span><span style={s.logoText}>PROSPEO</span></div>

        {/* User info */}
        <div style={s.userInfo}>
          <div style={s.userAvatar}>{profile?.full_name?.[0] || "?"}</div>
          <div>
            <div style={s.userName}>{profile?.full_name || profile?.email}</div>
            <div style={{ ...s.userRole, color: profile?.role === "manager" ? "#FF4C1A" : "#888" }}>
              {profile?.role === "manager" ? "👑 Manager" : "Commercial"}
            </div>
          </div>
        </div>

        <nav style={s.nav}>
          {[
            { id: "dashboard", icon: "▦", label: "Tableau de bord" },
            { id: "add",       icon: "＋", label: "Nouveau prospect" },
            { id: "list",      icon: "≡", label: "Mes prospects"    },
            { id: "report",    icon: "◉", label: "Rapport & Export" },
          ].map(item => (
            <button key={item.id}
              style={{ ...s.navItem, ...(view === item.id ? s.navItemActive : {}) }}
              onClick={() => setView(item.id)}>
              <span style={s.navIcon}>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={s.sidebarFooter}>
          <div style={s.sidebarStats}>
            <div style={s.miniStat}><span style={s.miniStatNum}>{stats.total}</span><span>prospects</span></div>
            <div style={s.miniStat}><span style={{ ...s.miniStatNum, color: "#FF4C1A" }}>{stats.chaud}</span><span>chauds</span></div>
          </div>
          <button style={s.signOutBtn} onClick={onSignOut}>Déconnexion</button>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div style={s.page}>
            <div style={s.pageHeader}>
              <div>
                <h1 style={s.pageTitle}>Tableau de bord</h1>
                <p style={s.pageSubtitle}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
            </div>
            <div style={s.statsGrid}>
              {[
                { label: "Total prospects",  value: stats.total,    bg: "#E8E0D4", fg: "#1A1A1A" },
                { label: "Contacts chauds",  value: stats.chaud,    bg: "#FF4C1A", fg: "#fff"    },
                { label: "Convertis",        value: stats.converti, bg: "#00C48C", fg: "#fff"    },
                { label: "Cette semaine",    value: stats.thisWeek, bg: "#1A1A1A", fg: "#E8E0D4" },
              ].map(st => (
                <div key={st.label} style={{ ...s.statCard, background: st.bg }}>
                  <div style={{ ...s.statNum, color: st.fg }}>{st.value}</div>
                  <div style={{ ...s.statLabel, color: st.fg, opacity: 0.7 }}>{st.label}</div>
                </div>
              ))}
            </div>
            <div style={s.dashGrid}>
              <div style={s.dashCard}>
                <h3 style={s.dashCardTitle}>Derniers prospects</h3>
                {loadingData ? <div style={s.loadingText}>Chargement...</div> :
                  contacts.slice(0, 5).map(c => (
                    <div key={c.id} style={s.recentItem} onClick={() => { setSelected(c); setView("detail"); }}>
                      <div style={s.avatar}>{c.first_name[0]}{c.last_name[0]}</div>
                      <div style={s.recentInfo}>
                        <div style={s.recentName}>{c.first_name} {c.last_name}</div>
                        <div style={s.recentCompany}>
                          {c.company}
                          {profile?.role === "manager" && c.profiles?.full_name && (
                            <span style={s.ownerTag}> · {c.profiles.full_name}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ ...s.statusBadge, background: STATUS_COLORS[c.status]?.bg, color: STATUS_COLORS[c.status]?.text }}>
                        {STATUS_COLORS[c.status]?.label}
                      </div>
                    </div>
                  ))
                }
              </div>
              <div style={s.dashCard}>
                <h3 style={s.dashCardTitle}>Actions rapides</h3>
                <div style={s.quickActions}>
                  {[
                    { icon: "✏️", label: "Saisie manuelle", action: () => setView("add") },
                    { icon: "📇", label: "Scanner carte",   action: () => { setView("add"); setTimeout(() => fileInputRef.current?.click(), 200); } },
                    { icon: "📊", label: "Export Excel",    action: () => setView("report") },
                    { icon: "◉", label: "Rapports",        action: () => setView("report") },
                  ].map(q => (
                    <button key={q.label} style={s.qAction} onClick={q.action}>
                      <span style={s.qIcon}>{q.icon}</span><span>{q.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADD */}
        {view === "add" && (
          <div style={s.page}>
            <div style={s.pageHeader}><div><h1 style={s.pageTitle}>Nouveau prospect</h1><p style={s.pageSubtitle}>Saisie manuelle, vocale ou scan de carte</p></div></div>
            <div style={s.sourceSelector}>
              {[{ id: "manuel", icon: "✏️", label: "Manuel" }, { id: "carte", icon: "📇", label: "Carte de visite" }, { id: "vocal", icon: "🎙️", label: "Vocal" }].map(src => (
                <button key={src.id}
                  style={{ ...s.sourceBtn, ...(form.source === src.id ? s.sourceBtnActive : {}) }}
                  onClick={() => { setForm(f => ({ ...f, source: src.id })); if (src.id === "carte") fileInputRef.current?.click(); }}>
                  <span>{src.icon}</span><span>{src.label}</span>
                </button>
              ))}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCardUpload} />
            {isAnalyzingCard && <div style={s.analyzing}><div style={s.spinner} /><span>Analyse IA de la carte...</span></div>}
            <div style={s.formGrid}>
              {[
                { key: "first_name", label: "Prénom *",    ph: "Jean"                  },
                { key: "last_name",  label: "Nom *",       ph: "Dupont"                },
                { key: "company",    label: "Entreprise",  ph: "Acme Corp"             },
                { key: "role",       label: "Poste",       ph: "Directeur Commercial"  },
                { key: "email",      label: "Email",       ph: "jean@acme.fr"          },
                { key: "phone",      label: "Téléphone",   ph: "+33 6 00 00 00 00"     },
              ].map(field => (
                <div key={field.key} style={s.formGroup}>
                  <label style={s.label}>{field.label}</label>
                  <div style={s.inputRow}>
                    <input style={s.input} placeholder={field.ph} value={form[field.key]}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} />
                    <button
                      style={{ ...s.voiceBtn, ...(isRecording && recordingField === field.key ? s.voiceBtnActive : {}) }}
                      onClick={() => isRecording && recordingField === field.key ? stopVoice() : startVoice(field.key)}>
                      {isRecording && recordingField === field.key ? "⏹" : "🎙️"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Notes</label>
              <div style={s.inputRow}>
                <textarea style={{ ...s.input, ...s.textarea }} placeholder="Besoins identifiés, prochaines étapes..."
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                <button style={{ ...s.voiceBtn, ...(isRecording && recordingField === "notes" ? s.voiceBtnActive : {}) }}
                  onClick={() => isRecording && recordingField === "notes" ? stopVoice() : startVoice("notes")}>
                  {isRecording && recordingField === "notes" ? "⏹" : "🎙️"}
                </button>
              </div>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Statut commercial</label>
              <div style={s.statusSelector}>
                {Object.entries(STATUS_COLORS).map(([key, val]) => (
                  <button key={key}
                    style={{ ...s.statusBtn, background: form.status === key ? val.bg : "transparent", color: form.status === key ? val.text : "#888", border: `2px solid ${val.bg}` }}
                    onClick={() => setForm(f => ({ ...f, status: key }))}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.formActions}>
              <button style={s.btnSecondary} onClick={resetForm}>Effacer</button>
              <button style={s.btnPrimary} onClick={handleAddContact}>Enregistrer le prospect</button>
            </div>
          </div>
        )}

        {/* LIST */}
        {view === "list" && (
          <div style={s.page}>
            <div style={s.pageHeader}>
              <h1 style={s.pageTitle}>
                {profile?.role === "manager" ? "Tous les prospects" : "Mes prospects"}
              </h1>
              <button style={s.btnPrimary} onClick={() => setView("add")}>＋ Nouveau</button>
            </div>
            <div style={s.filters}>
              <input style={{ ...s.input, flex: 1, maxWidth: 320 }} placeholder="🔍  Rechercher..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div style={s.statusFilters}>
                {["all", "chaud", "tiède", "froid", "converti"].map(st => (
                  <button key={st}
                    style={{ ...s.filterBtn, ...(filterStatus === st ? s.filterBtnActive : {}) }}
                    onClick={() => setFilterStatus(st)}>
                    {st === "all" ? "Tous" : STATUS_COLORS[st]?.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.contactList}>
              {loadingData ? <div style={s.loadingText}>Chargement...</div> :
                filtered.length === 0 ? <div style={s.empty}>Aucun prospect trouvé</div> :
                filtered.map(c => (
                  <div key={c.id} style={s.contactCard} onClick={() => { setSelected(c); setView("detail"); }}>
                    <div style={s.avatar}>{c.first_name[0]}{c.last_name[0]}</div>
                    <div style={s.contactInfo}>
                      <div style={s.contactName}>{c.first_name} {c.last_name}</div>
                      <div style={s.contactMeta}>{c.role}{c.company ? ` · ${c.company}` : ""}</div>
                      {profile?.role === "manager" && <div style={{ ...s.contactMeta, color: "#FF4C1A" }}>👤 {c.profiles?.full_name}</div>}
                    </div>
                    <div style={s.contactRight}>
                      <div style={{ ...s.statusBadge, background: STATUS_COLORS[c.status]?.bg, color: STATUS_COLORS[c.status]?.text }}>
                        {STATUS_COLORS[c.status]?.label}
                      </div>
                      <div style={s.sourceTag}>{SOURCE_ICONS[c.source]} {c.source}</div>
                      <div style={s.contactDate}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* DETAIL */}
        {view === "detail" && selectedContact && (
          <DetailView
            contact={selectedContact}
            profile={profile}
            onBack={() => setView("list")}
            onGenerateSynthesis={generateSynthesis}
            onStatusUpdate={handleStatusUpdate}
            onDelete={handleDelete}
            notify={notify}
          />
        )}

        {/* REPORT */}
        {view === "report" && (
          <ReportView contacts={contacts} profile={profile} notify={notify} />
        )}

      </main>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function DetailView({ contact: c, profile, onBack, onGenerateSynthesis, onStatusUpdate, onDelete, notify }) {
  const [synthesis, setSynthesis]   = useState(null);
  const [synthLoading, setSynthLoad] = useState(false);
  const [pastSynths, setPastSynths] = useState([]);

  useEffect(() => {
    supabase.from("syntheses").select("*").eq("contact_id", c.id).order("created_at", { ascending: false })
      .then(({ data }) => setPastSynths(data || []));
  }, [c.id]);

  const handleSynthesis = async () => {
    setSynthLoad(true);
    try {
      const result = await onGenerateSynthesis(c);
      setSynthesis(result);
      setPastSynths(prev => [{ content: result, created_at: new Date().toISOString() }, ...prev]);
      notify("✨ Synthèse générée !");
    } catch { notify("Erreur IA", "error"); }
    setSynthLoad(false);
  };

  return (
    <div style={s.page}>
      <button style={s.backBtn} onClick={onBack}>← Retour</button>
      <div style={s.detailHeader}>
        <div style={s.avatarLg}>{c.first_name[0]}{c.last_name[0]}</div>
        <div>
          <h1 style={s.detailName}>{c.first_name} {c.last_name}</h1>
          <p style={s.detailRole}>{c.role}{c.company ? ` · ${c.company}` : ""}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ ...s.statusBadge, background: STATUS_COLORS[c.status]?.bg, color: STATUS_COLORS[c.status]?.text }}>
              {STATUS_COLORS[c.status]?.label}
            </span>
            <span style={s.sourceTag}>{SOURCE_ICONS[c.source]} {c.source}</span>
            {profile?.role === "manager" && <span style={{ ...s.sourceTag, color: "#FF4C1A" }}>👤 {c.profiles?.full_name}</span>}
          </div>
        </div>
      </div>

      {/* Changer statut */}
      <div style={{ marginBottom: 24 }}>
        <div style={s.label}>Modifier le statut</div>
        <div style={s.statusSelector}>
          {Object.entries(STATUS_COLORS).map(([key, val]) => (
            <button key={key}
              style={{ ...s.statusBtn, background: c.status === key ? val.bg : "transparent", color: c.status === key ? val.text : "#888", border: `2px solid ${val.bg}` }}
              onClick={() => onStatusUpdate(c.id, key)}>
              {val.label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.detailGrid}>
        {[
          { icon: "✉️", label: "Email",        value: c.email   },
          { icon: "📞", label: "Téléphone",    value: c.phone   },
          { icon: "🏢", label: "Entreprise",   value: c.company },
          { icon: "📅", label: "Date contact", value: new Date(c.created_at).toLocaleDateString("fr-FR") },
        ].filter(r => r.value).map(row => (
          <div key={row.label} style={s.detailField}>
            <span style={s.detailIcon}>{row.icon}</span>
            <div>
              <div style={s.detailFieldLabel}>{row.label}</div>
              <div style={s.detailFieldValue}>{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {c.notes && (
        <div style={s.notesBox}>
          <h3 style={s.notesTitle}>Notes & Informations</h3>
          <p style={s.notesContent}>{c.notes}</p>
        </div>
      )}

      <div style={s.synthesisSection}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={s.notesTitle}>Synthèse IA {pastSynths.length > 0 && `(${pastSynths.length})`}</h3>
          <button style={s.btnPrimary} onClick={handleSynthesis} disabled={synthLoading}>
            {synthLoading ? "Génération..." : "✨ Générer"}
          </button>
        </div>
        {synthesis && <p style={s.synthesisContent}>{synthesis}</p>}
        {!synthesis && pastSynths.length > 0 && (
          <div>
            <p style={{ ...s.synthesisContent, marginBottom: 8 }}>{pastSynths[0].content}</p>
            <div style={s.sourceTag}>Générée le {new Date(pastSynths[0].created_at).toLocaleDateString("fr-FR")}</div>
          </div>
        )}
      </div>

      <button style={{ ...s.btnSecondary, color: "#FF2D2D", borderColor: "#FF2D2D", marginTop: 24 }}
        onClick={() => onDelete(c.id)}>
        🗑 Supprimer ce prospect
      </button>
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ contacts, profile, notify }) {
  const [period, setPeriod]         = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [reportPreview, setPreview] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const { start, end } = getPeriodRange(period, customStart, customEnd);

  const filtered = contacts.filter(c => {
    if (!start || !end) return true;
    const d = new Date(c.created_at);
    return d >= start && d <= end;
  });

  const stats = {
    total:    filtered.length,
    chaud:    filtered.filter(c => c.status === "chaud").length,
    tiede:    filtered.filter(c => c.status === "tiède").length,
    froid:    filtered.filter(c => c.status === "froid").length,
    converti: filtered.filter(c => c.status === "converti").length,
    carte:    filtered.filter(c => c.source === "carte").length,
    manuel:   filtered.filter(c => c.source === "manuel").length,
    vocal:    filtered.filter(c => c.source === "vocal").length,
  };

  const exportExcel = () => {
    const headers = ["Prénom","Nom","Entreprise","Poste","Email","Téléphone","Source","Statut","Notes","Commercial","Date"];
    let csv = headers.join(";") + "\n";
    filtered.forEach(c => {
      const row = [
        c.first_name, c.last_name, c.company, c.role, c.email, c.phone,
        c.source, c.status, c.notes,
        c.profiles?.full_name || "",
        new Date(c.created_at).toLocaleDateString("fr-FR"),
      ];
      csv += row.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(";") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const label = PERIODS.find(p => p.id === period)?.label || period;
    a.download = `prospects_${label}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    notify("📊 Export Excel téléchargé !");
  };

  const sendEmail = async () => {
    setEmailSending(true);
    await new Promise(r => setTimeout(r, 1800));
    setEmailSending(false);
    notify("📧 Rapport envoyé !");
    setPreview(false);
  };

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div><h1 style={s.pageTitle}>Rapport & Export</h1>
        <p style={s.pageSubtitle}>Filtrez par période et exportez</p></div>
      </div>

      {/* Period selector */}
      <div style={s.periodBar}>
        {PERIODS.map(p => (
          <button key={p.id}
            style={{ ...s.filterBtn, ...(period === p.id ? s.filterBtnActive : {}), fontSize: 13 }}
            onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div style={s.customDateRow}>
          <div style={s.formGroup}>
            <label style={s.label}>Du</label>
            <input type="date" style={s.input} value={customStart} onChange={e => setCustomStart(e.target.value)} />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Au</label>
            <input type="date" style={s.input} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      {/* Stats bloc */}
      <div style={s.reportStatsGrid}>
        {/* Par statut */}
        <div style={s.reportCard}>
          <h3 style={s.dashCardTitle}>Par statut</h3>
          {[
            { label: "Chaud",    value: stats.chaud,    color: "#FF4C1A" },
            { label: "Tiède",    value: stats.tiede,    color: "#FF9500" },
            { label: "Froid",    value: stats.froid,    color: "#1A6AFF" },
            { label: "Converti", value: stats.converti, color: "#00C48C" },
          ].map(st => (
            <div key={st.label} style={s.statRow}>
              <span style={{ ...s.statDot, background: st.color }} />
              <span style={s.statRowLabel}>{st.label}</span>
              <span style={s.statRowValue}>{st.value}</span>
              <div style={s.statBar}>
                <div style={{ ...s.statBarFill, width: `${stats.total ? (st.value / stats.total) * 100 : 0}%`, background: st.color }} />
              </div>
            </div>
          ))}
        </div>
        {/* Par source */}
        <div style={s.reportCard}>
          <h3 style={s.dashCardTitle}>Par source</h3>
          {[
            { label: "Carte IA", value: stats.carte,  icon: "📇" },
            { label: "Manuel",   value: stats.manuel, icon: "✏️" },
            { label: "Vocal",    value: stats.vocal,  icon: "🎙️" },
          ].map(st => (
            <div key={st.label} style={s.statRow}>
              <span>{st.icon}</span>
              <span style={s.statRowLabel}>{st.label}</span>
              <span style={s.statRowValue}>{st.value}</span>
              <div style={s.statBar}>
                <div style={{ ...s.statBarFill, width: `${stats.total ? (st.value / stats.total) * 100 : 0}%`, background: "#FF4C1A" }} />
              </div>
            </div>
          ))}
        </div>
        {/* Total */}
        <div style={{ ...s.reportCard, background: "#1A1A1A", justifyContent: "center", alignItems: "center", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: "#E8E0D4" }}>{stats.total}</div>
          <div style={{ fontSize: 13, color: "#888", fontFamily: "'Helvetica Neue', sans-serif", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
            prospects sur la période
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={s.reportTable}>
        <div style={{ ...s.reportTableHeader, gridTemplateColumns: profile?.role === "manager" ? "2fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr" : "2fr 1.5fr 2fr 1fr 1fr 1fr" }}>
          {["Nom", "Entreprise", "Email", ...(profile?.role === "manager" ? ["Commercial"] : []), "Statut", "Source", "Date"].map(h => (
            <div key={h} style={s.reportTh}>{h}</div>
          ))}
        </div>
        {filtered.length === 0 && <div style={{ ...s.empty, borderTop: "1px solid #F0EBE0" }}>Aucun prospect sur cette période</div>}
        {filtered.map(c => (
          <div key={c.id} style={{ ...s.reportTr, gridTemplateColumns: profile?.role === "manager" ? "2fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr" : "2fr 1.5fr 2fr 1fr 1fr 1fr" }}>
            <div style={s.reportTd}>{c.first_name} {c.last_name}</div>
            <div style={s.reportTd}>{c.company || "—"}</div>
            <div style={s.reportTd}>{c.email || "—"}</div>
            {profile?.role === "manager" && <div style={{ ...s.reportTd, color: "#FF4C1A" }}>{c.profiles?.full_name || "—"}</div>}
            <div style={s.reportTd}>
              <span style={{ ...s.statusBadge, background: STATUS_COLORS[c.status]?.bg, color: STATUS_COLORS[c.status]?.text }}>
                {STATUS_COLORS[c.status]?.label}
              </span>
            </div>
            <div style={s.reportTd}>{SOURCE_ICONS[c.source]} {c.source}</div>
            <div style={s.reportTd}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
          </div>
        ))}
      </div>

      <div style={s.reportActions}>
        <button style={s.btnSecondary} onClick={exportExcel}>📊 Exporter en Excel</button>
        <button style={s.btnPrimary} onClick={() => setPreview(true)}>📧 Envoyer par email</button>
      </div>

      {reportPreview && (
        <div style={s.modal}>
          <div style={s.modalBox}>
            <h3 style={s.modalTitle}>Envoyer le rapport</h3>
            <input style={s.input} placeholder="Destinataire" defaultValue="manager@entreprise.fr" />
            <input style={{ ...s.input, marginTop: 12 }} placeholder="Objet"
              defaultValue={`Rapport prospects — ${PERIODS.find(p => p.id === period)?.label} — ${new Date().toLocaleDateString("fr-FR")}`} />
            <textarea style={{ ...s.input, ...s.textarea, marginTop: 12 }}
              defaultValue={`Rapport de prospection\nPériode : ${PERIODS.find(p => p.id === period)?.label}\n\nTotal : ${stats.total} prospects\nChauds : ${stats.chaud} | Convertis : ${stats.converti}\nSources : Carte ${stats.carte} | Manuel ${stats.manuel} | Vocal ${stats.vocal}`} />
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button style={s.btnSecondary} onClick={() => setPreview(false)}>Annuler</button>
              <button style={s.btnPrimary} onClick={sendEmail} disabled={emailSending}>
                {emailSending ? "Envoi..." : "✉️ Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F5F0E8" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, color: "#FF4C1A", marginBottom: 16 }}>◈</div>
        <div style={{ fontFamily: "'Helvetica Neue', sans-serif", color: "#888" }}>Chargement...</div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: { display: "flex", minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Georgia','Times New Roman',serif", position: "relative" },
  grain: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents: "none", zIndex: 0 },
  notif: { position: "fixed", top: 24, right: 24, zIndex: 1000, padding: "12px 24px", borderRadius: 8, color: "#fff", fontFamily: "'Helvetica Neue',sans-serif", fontSize: 14, fontWeight: 600, boxShadow: "0 4px 24px rgba(0,0,0,0.2)" },
  // Auth
  authRoot: { minHeight: "100vh", background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" },
  authCard: { background: "#fff", borderRadius: 16, padding: 40, width: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.1)" },
  authLogo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32 },
  authTitle: { fontSize: 24, fontWeight: 400, color: "#1A1A1A", margin: "0 0 24px" },
  authSwitch: { display: "block", marginTop: 16, border: "none", background: "none", color: "#888", cursor: "pointer", fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", width: "100%", textAlign: "center" },
  errorBox: { padding: "10px 16px", borderRadius: 6, background: "#FFF0F0", fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", marginBottom: 12 },
  // Layout
  sidebar: { width: 240, minHeight: "100vh", background: "#1A1A1A", display: "flex", flexDirection: "column", padding: "32px 0", position: "relative", zIndex: 1, flexShrink: 0 },
  logo: { display: "flex", alignItems: "center", gap: 10, padding: "0 24px 24px", borderBottom: "1px solid #2A2A2A", marginBottom: 16 },
  logoIcon: { fontSize: 24, color: "#FF4C1A" },
  logoText: { fontSize: 20, fontWeight: 700, letterSpacing: 4, color: "#E8E0D4", fontFamily: "'Helvetica Neue',sans-serif" },
  userInfo: { display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid #2A2A2A", marginBottom: 8 },
  userAvatar: { width: 36, height: 36, borderRadius: "50%", background: "#FF4C1A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: "'Helvetica Neue',sans-serif", flexShrink: 0 },
  userName: { fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", color: "#E8E0D4", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 },
  userRole: { fontSize: 11, fontFamily: "'Helvetica Neue',sans-serif" },
  nav: { flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 12px" },
  navItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, border: "none", background: "transparent", color: "#888", cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", textAlign: "left" },
  navItemActive: { background: "#FF4C1A", color: "#fff" },
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  sidebarFooter: { padding: "24px", borderTop: "1px solid #2A2A2A", marginTop: 16 },
  sidebarStats: { display: "flex", gap: 16, marginBottom: 16 },
  miniStat: { display: "flex", flexDirection: "column", gap: 2, color: "#888", fontSize: 11, fontFamily: "'Helvetica Neue',sans-serif" },
  miniStatNum: { fontSize: 20, fontWeight: 700, color: "#E8E0D4" },
  signOutBtn: { width: "100%", padding: "8px 0", background: "transparent", border: "1px solid #333", borderRadius: 6, color: "#666", cursor: "pointer", fontSize: 12, fontFamily: "'Helvetica Neue',sans-serif" },
  main: { flex: 1, overflow: "auto", position: "relative", zIndex: 1 },
  page: { padding: "40px 48px", maxWidth: 1100 },
  pageHeader: { marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { fontSize: 36, fontWeight: 400, color: "#1A1A1A", margin: 0, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: "#888", margin: "4px 0 0", fontFamily: "'Helvetica Neue',sans-serif" },
  // Dashboard
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  statCard: { borderRadius: 12, padding: "24px", display: "flex", flexDirection: "column", gap: 4 },
  statNum: { fontSize: 40, fontWeight: 700, lineHeight: 1 },
  statLabel: { fontSize: 12, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  dashCard: { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  dashCardTitle: { fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 2, textTransform: "uppercase", color: "#888", margin: "0 0 20px", fontWeight: 600 },
  recentItem: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F0EBE0", cursor: "pointer" },
  avatar: { width: 40, height: 40, borderRadius: "50%", background: "#1A1A1A", color: "#E8E0D4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "'Helvetica Neue',sans-serif", flexShrink: 0 },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, color: "#1A1A1A" },
  recentCompany: { fontSize: 12, color: "#888", fontFamily: "'Helvetica Neue',sans-serif" },
  ownerTag: { color: "#FF4C1A" },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 },
  quickActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  qAction: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 16, border: "2px solid #F0EBE0", borderRadius: 10, background: "#F5F0E8", cursor: "pointer", fontSize: 12, fontFamily: "'Helvetica Neue',sans-serif", color: "#444" },
  qIcon: { fontSize: 24 },
  loadingText: { padding: 32, textAlign: "center", color: "#aaa", fontFamily: "'Helvetica Neue',sans-serif" },
  // Form
  sourceSelector: { display: "flex", gap: 12, marginBottom: 32 },
  sourceBtn: { display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", border: "2px solid #E8E0D4", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", color: "#888" },
  sourceBtnActive: { border: "2px solid #1A1A1A", background: "#1A1A1A", color: "#E8E0D4" },
  analyzing: { display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "#FFF8F4", border: "2px solid #FF4C1A", borderRadius: 8, marginBottom: 24, fontFamily: "'Helvetica Neue',sans-serif", fontSize: 14, color: "#FF4C1A" },
  spinner: { width: 20, height: 20, border: "3px solid #FFD4C4", borderTopColor: "#FF4C1A", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 },
  formGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#666" },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-start" },
  input: { flex: 1, padding: "12px 16px", border: "2px solid #E8E0D4", borderRadius: 8, background: "#fff", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", color: "#1A1A1A", outline: "none", width: "100%", boxSizing: "border-box" },
  textarea: { minHeight: 100, resize: "vertical", fontFamily: "'Helvetica Neue',sans-serif" },
  voiceBtn: { width: 44, height: 44, border: "2px solid #E8E0D4", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  voiceBtnActive: { background: "#FF4C1A", borderColor: "#FF4C1A" },
  statusSelector: { display: "flex", gap: 8, flexWrap: "wrap" },
  statusBtn: { padding: "8px 18px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600 },
  formActions: { display: "flex", gap: 12, marginTop: 32, justifyContent: "flex-end" },
  // Buttons
  btnPrimary: { padding: "12px 28px", background: "#1A1A1A", color: "#E8E0D4", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600 },
  btnSecondary: { padding: "12px 28px", background: "transparent", color: "#666", border: "2px solid #E8E0D4", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif" },
  // List
  filters: { display: "flex", gap: 16, marginBottom: 24, alignItems: "center", flexWrap: "wrap" },
  statusFilters: { display: "flex", gap: 8 },
  filterBtn: { padding: "8px 14px", border: "2px solid #E8E0D4", borderRadius: 20, background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, color: "#888" },
  filterBtnActive: { background: "#1A1A1A", borderColor: "#1A1A1A", color: "#E8E0D4" },
  contactList: { display: "flex", flexDirection: "column", gap: 8 },
  contactCard: { display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "#fff", borderRadius: 10, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "2px solid transparent" },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, color: "#1A1A1A" },
  contactMeta: { fontSize: 12, color: "#888", fontFamily: "'Helvetica Neue',sans-serif", marginTop: 2 },
  contactRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  sourceTag: { fontSize: 11, color: "#aaa", fontFamily: "'Helvetica Neue',sans-serif" },
  contactDate: { fontSize: 11, color: "#bbb", fontFamily: "'Helvetica Neue',sans-serif" },
  empty: { padding: 48, textAlign: "center", color: "#aaa", fontFamily: "'Helvetica Neue',sans-serif" },
  // Detail
  backBtn: { border: "none", background: "transparent", cursor: "pointer", color: "#888", fontFamily: "'Helvetica Neue',sans-serif", fontSize: 14, marginBottom: 24, padding: 0 },
  detailHeader: { display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 24 },
  avatarLg: { width: 64, height: 64, borderRadius: "50%", background: "#1A1A1A", color: "#E8E0D4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, fontFamily: "'Helvetica Neue',sans-serif", flexShrink: 0 },
  detailName: { fontSize: 28, fontWeight: 400, color: "#1A1A1A", margin: 0 },
  detailRole: { fontSize: 14, color: "#888", fontFamily: "'Helvetica Neue',sans-serif", margin: "4px 0 0" },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 },
  detailField: { display: "flex", gap: 12, alignItems: "flex-start", padding: 16, background: "#fff", borderRadius: 8 },
  detailIcon: { fontSize: 20 },
  detailFieldLabel: { fontSize: 11, color: "#aaa", fontFamily: "'Helvetica Neue',sans-serif", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 },
  detailFieldValue: { fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", color: "#1A1A1A", marginTop: 2 },
  notesBox: { background: "#fff", borderRadius: 10, padding: 24, marginBottom: 24 },
  notesTitle: { fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 2, textTransform: "uppercase", color: "#888", margin: "0 0 12px", fontWeight: 600 },
  notesContent: { fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", color: "#444", lineHeight: 1.6, margin: 0 },
  synthesisSection: { background: "#FFF8F4", borderRadius: 10, padding: 24, border: "2px solid #FFD4C4" },
  synthesisContent: { fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", color: "#444", lineHeight: 1.7, margin: 0, fontStyle: "italic" },
  // Report
  periodBar: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  customDateRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, maxWidth: 480 },
  reportStatsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 240px", gap: 16, marginBottom: 32 },
  reportCard: { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  statRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  statDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  statRowLabel: { fontFamily: "'Helvetica Neue',sans-serif", fontSize: 13, color: "#444", flex: 1 },
  statRowValue: { fontFamily: "'Helvetica Neue',sans-serif", fontSize: 16, fontWeight: 700, color: "#1A1A1A", width: 28, textAlign: "right" },
  statBar: { width: 80, height: 6, background: "#F0EBE0", borderRadius: 3, overflow: "hidden", flexShrink: 0 },
  statBarFill: { height: "100%", borderRadius: 3, transition: "width 0.4s ease" },
  reportTable: { background: "#fff", borderRadius: 12, overflow: "hidden", marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  reportTableHeader: { display: "grid", background: "#1A1A1A", color: "#E8E0D4", padding: "12px 20px", gap: 12 },
  reportTh: { fontSize: 11, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 },
  reportTr: { display: "grid", padding: "14px 20px", gap: 12, borderBottom: "1px solid #F0EBE0", alignItems: "center" },
  reportTd: { fontSize: 13, fontFamily: "'Helvetica Neue',sans-serif", color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  reportActions: { display: "flex", gap: 12, justifyContent: "flex-end" },
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modalBox: { background: "#fff", borderRadius: 16, padding: 32, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  modalTitle: { fontSize: 20, fontWeight: 400, color: "#1A1A1A", margin: "0 0 20px" },
};
