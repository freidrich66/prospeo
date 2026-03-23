import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import { LANGUAGES, t, detectBrowserLang, getSavedLang, saveLang } from "./i18n.js";

const STATUS_COLORS_BASE = {
  chaud:    { bg: "#FF4C1A", text: "#fff", key: "status_chaud"    },
  tiede:    { bg: "#FF9500", text: "#fff", key: "status_tiede"    },
  froid:    { bg: "#E8E0D4", text: "#888", key: "status_froid"    },
  converti: { bg: "#00C48C", text: "#fff", key: "status_converti" },
};
const getStatusColors = (lang="fr") => Object.fromEntries(
  Object.entries(STATUS_COLORS_BASE).map(([k,v]) => [k, {...v, label: t(v.key, lang)}])
);
const STATUS_COLORS = getStatusColors("fr");
const SOURCE_ICONS = { carte: "📇", manuel: "✏️", vocal: "🎙️" };
const getPeriods = (lang="fr") => [
  { id: "today",     label: t("today",lang)          },
  { id: "yesterday", label: t("yesterday",lang)       },
  { id: "week",      label: t("this_week_label",lang) },
  { id: "month",     label: t("this_month",lang)      },
  { id: "custom",    label: t("custom",lang)          },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isIOSChrome() {
  // CriOS = Chrome iOS user agent
  return /CriOS/.test(navigator.userAgent);
}

function isIOSSafari() {
  // iOS Safari = iOS but NOT Chrome, NOT Firefox
  return isIOS() && !isIOSChrome() && !/FxiOS/.test(navigator.userAgent);
}

function isPWA() {
  return window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

function isIOSPWA() {
  // PWA mode = Safari WebView = no speech recognition
  return isIOS() && isPWA();
}

function openInChrome() {
  const url = window.location.href;
  const chromeUrl = url.replace(/^https/, "googlechromes").replace(/^http:/, "googlechrome:");
  window.location.href = chromeUrl;
  setTimeout(() => {
    window.open("https://apps.apple.com/app/google-chrome/id559886823", "_blank");
  }, 500);
}

function hasSpeechRecognition() {
  // Chrome iOS supporte la Web Speech API
  // Safari iOS et PWA ne la supportent pas
  if (isIOSPWA()) return false;
  if (isIOSChrome()) return true;
  if (isIOSSafari()) return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

const SUPER_EMAIL = "fanne@lafitel.eu";
function isSuperManager(profile) {
  return profile?.email === SUPER_EMAIL;
}

function displayName(p) {
  if (!p) return "Inconnu";
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  if (p.full_name) return p.full_name;
  if (p.email) return p.email;
  return "Commercial";
}

function getPeriodRange(periodId, customStart, customEnd) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (periodId) {
    case "today":     return { start: today, end: new Date(today.getTime() + 86399999) };
    case "yesterday": { const y = new Date(today); y.setDate(y.getDate()-1); return { start: y, end: new Date(today.getTime()-1) }; }
    case "week":      { const m = new Date(today); m.setDate(today.getDate()-((today.getDay()+6)%7)); return { start: m, end: new Date(today.getTime()+86399999) }; }
    case "month":     return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getTime()+86399999) };
    case "custom":    return { start: customStart ? new Date(customStart) : today, end: customEnd ? new Date(new Date(customEnd).getTime()+86399999) : new Date(today.getTime()+86399999) };
    default:          return { start: null, end: null };
  }
}

async function callClaude(messages) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Erreur serveur /api/claude:", res.status, err);
    throw new Error("Erreur serveur " + res.status + " : " + err);
  }
  const data = await res.json();
  if (data.error) {
    console.error("Erreur API Anthropic:", data.error);
    throw new Error(data.error);
  }
  return data.content?.[0]?.text || "";
}

async function scanCardAI(base64, mediaType) {
  const res = await fetch("/api/claude-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mediaType }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content?.[0]?.text || "";
}

const globalCSS = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; padding: 0; overscroll-behavior: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  input, textarea { -webkit-appearance: none; appearance: none; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
`;

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang]       = useState(getSavedLang() || detectBrowserLang());

  const changeLang = (code) => { saveLang(code); setLang(code); };

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = globalCSS;
    document.head.appendChild(style);
    const vp = document.querySelector("meta[name=viewport]");
    if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");

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
  if (!session) return <AuthPage lang={lang} changeLang={changeLang} />;
  return <ProspeoApp profile={profile} onSignOut={() => supabase.auth.signOut()} lang={lang} changeLang={changeLang} />;
}

function AuthPage({ lang="fr", changeLang }) {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPwd]    = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState(false);
  const isMobile = useIsMobile();

  const submit = async () => {
    setError(""); setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, role: "commercial" } } });
      if (error) setError(error.message);
      else setError("✅ Compte créé ! Vérifiez votre email.");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F5F0E8", display:"flex", alignItems:"center", justifyContent:"center", padding: isMobile ? "20px 16px" : "20px" }}>
      <div style={{ background:"#fff", borderRadius:20, padding: isMobile ? "32px 24px" : "40px", width:"100%", maxWidth:420, boxShadow:"0 8px 40px rgba(0,0,0,0.1)", animation:"slideUp 0.3s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
          <span style={{ fontSize:26, color:"#FF4C1A" }}>◈</span>
          <span style={{ fontSize:20, fontWeight:700, letterSpacing:3, color:"#1A1A1A", fontFamily:"'Helvetica Neue',sans-serif" }}>PROSPEO</span>
        </div>
        <h2 style={{ fontSize:22, fontWeight:400, color:"#1A1A1A", margin:"0 0 24px", fontFamily:"Georgia,serif" }}>{mode === "login" ? t("login",lang) : t("register",lang)}</h2>
        {mode === "register" && <div style={{ marginBottom:14 }}><label style={L}>{t("first_name",lang)+" "+t("last_name",lang)}</label><input style={I} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)} /></div>}
        <div style={{ marginBottom:14 }}><label style={L}>{t("email",lang)}</label><input style={I} type="email" placeholder="jean@entreprise.fr" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div style={{ marginBottom:14 }}><label style={L}>Mot de passe</label><input style={I} type="password" placeholder="••••••••" value={password} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} /></div>
        {error && <div style={{ padding:"10px 14px", borderRadius:8, background:error.startsWith("✅")?"#EBF8F4":"#FFF0F0", color:error.startsWith("✅")?"#00875A":"#FF2D2D", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", marginBottom:14 }}>{error}</div>}
        <button style={{ width:"100%", padding:"14px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:10, cursor:"pointer", fontSize:15, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }} onClick={submit} disabled={busy}>{busy?"Chargement...":mode==="login"?t("login",lang):t("register",lang)}</button>
        <button style={{ display:"block", marginTop:14, border:"none", background:"none", color:"#888", cursor:"pointer", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", width:"100%", textAlign:"center", padding:"8px" }} onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}>
          {mode==="login"?"Pas encore de compte ? S'inscrire":"Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

function ProspeoApp({ profile, onSignOut, lang, changeLang }) {
  const [contacts, setContacts]         = useState([]);
  const [view, setView]                 = useState("dashboard");
  const [selected, setSelected]         = useState(null);
  const [notif, setNotif]               = useState(null);
  const [loadingData, setLoadingData]   = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const isMobile = useIsMobile();

  const notify = (msg, type="success") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); };

  const loadSubscription = useCallback(async () => {
    if (!profile || profile.role === "manager") return;
    try {
      const res = await fetch("/api/subscription-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id }),
      });
      const data = await res.json();
      if (data.subscription) setSubscription(data.subscription);
    } catch (err) {
      console.error("Erreur chargement abonnement:", err);
    }
  }, [profile]);

  useEffect(() => { if (profile) loadSubscription(); }, [profile, loadSubscription]);

  const loadContacts = useCallback(async () => {
    setLoadingData(true);
    let q = supabase.from("contacts").select("*, profiles:user_id(full_name,email)").order("created_at",{ascending:false});
    if (profile?.role !== "manager") q = q.eq("user_id", profile?.id);
    const { data } = await q;
    setContacts(data || []);
    setLoadingData(false);
  }, [profile]);

  useEffect(() => { if (profile) loadContacts(); }, [profile, loadContacts]);

  const handleDelete = async (id) => {
    await supabase.from("contacts").delete().eq("id", id);
    setContacts(p => p.filter(c => c.id !== id));
    setView("list"); notify("Prospect supprimé");
  };

  const handleStatusUpdate = async (id, status) => {
    await supabase.from("contacts").update({status}).eq("id", id);
    setContacts(p => p.map(c => c.id===id ? {...c, status} : c));
    if (selected?.id===id) setSelected(p => ({...p, status}));
    notify("✅ " + t("status",lang));
  };

  const stats = {
    total:    contacts.length,
    chaud:    contacts.filter(c=>c.status==="chaud").length,
    converti: contacts.filter(c=>c.status==="converti").length,
    thisWeek: contacts.filter(c=>(new Date()-new Date(c.created_at))/86400000<=7).length,
  };

  const NAV = [
    { id:"dashboard",     icon:"▦", label:t("nav_home",lang)         },
    { id:"add",           icon:"＋", label:t("nav_add",lang)          },
    { id:"list",          icon:"≡", label:t("nav_prospects",lang)     },
    { id:"report",        icon:"◉", label:t("nav_reports",lang)       },
    { id:"profile",       icon:"👤", label:t("nav_profile",lang)      },
    { id:"crm", icon:"🔗", label:t("nav_crm",lang) },
    ...(profile?.role !== "manager" ? [{ id:"subscription", icon:"⭐", label:t("nav_subscription",lang) }] : []),
    ...(isSuperManager(profile) ? [{ id:"superadmin", icon:"🔐", label:t("nav_superadmin",lang) }] : []),
  ];

  const go = (id) => setView(id);

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F5F0E8", fontFamily:"Georgia,serif" }}>

      {notif && (
        <div style={{ position:"fixed", top:isMobile?64:24, left:"50%", transform:"translateX(-50%)", zIndex:2000, padding:"11px 22px", borderRadius:30, color:"#fff", background:notif.type==="error"?"#FF2D2D":"#00C48C", fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,0.2)", whiteSpace:"nowrap", animation:"slideUp 0.2s ease" }}>
          {notif.msg}
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside style={{ width:240, minHeight:"100vh", background:"#1A1A1A", display:"flex", flexDirection:"column", padding:"28px 0", flexShrink:0, position:"sticky", top:0, height:"100vh" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 24px 22px", borderBottom:"1px solid #2A2A2A", marginBottom:14 }}>
            <span style={{ fontSize:22, color:"#FF4C1A" }}>◈</span>
            <span style={{ fontSize:17, fontWeight:700, letterSpacing:4, color:"#E8E0D4", fontFamily:"'Helvetica Neue',sans-serif" }}>PROSPEO</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 24px 14px", borderBottom:"1px solid #2A2A2A", marginBottom:8 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:"#FF4C1A", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }}>{profile?.full_name?.[0]||"?"}</div>
            <div>
              <div style={{ fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#E8E0D4", fontWeight:600, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{displayName(profile)}</div>
              <div style={{ fontSize:10, color:profile?.role==="manager"?"#FF4C1A":"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{profile?.role==="manager"?"👑 Manager":"Commercial"}</div>
            </div>
          </div>
          <nav style={{ flex:1, display:"flex", flexDirection:"column", gap:2, padding:"0 12px" }}>
            {NAV.map(item => (
              <button key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderRadius:8, border:"none", background:view===item.id?"#FF4C1A":"transparent", color:view===item.id?"#fff":"#888", cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", textAlign:"left" }} onClick={()=>go(item.id)}>
                <span style={{ fontSize:16, width:20, textAlign:"center" }}>{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ padding:"20px 24px", borderTop:"1px solid #2A2A2A" }}>
            <div style={{ display:"flex", gap:16, marginBottom:14 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:2, color:"#888", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif" }}><span style={{ fontSize:19, fontWeight:700, color:"#E8E0D4" }}>{stats.total}</span><span>prospects</span></div>
              <div style={{ display:"flex", flexDirection:"column", gap:2, color:"#888", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif" }}><span style={{ fontSize:19, fontWeight:700, color:"#FF4C1A" }}>{stats.chaud}</span><span>chauds</span></div>
            </div>
            <select value={lang} onChange={e=>changeLang(e.target.value)}
              style={{ width:"100%", padding:"6px 8px", background:"#1E1E1E", border:"1px solid #333", borderRadius:6, color:"#E8E0D4", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>
              {LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
            <button style={{ width:"100%", padding:"8px 0", background:"transparent", border:"1px solid #333", borderRadius:6, color:"#E8E0D4", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif" }} onClick={onSignOut}>{t("signout",lang)}</button>
          </div>
        </aside>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, background:"#1A1A1A", padding:"0 16px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:17, color:"#FF4C1A" }}>◈</span>
            <span style={{ fontSize:15, fontWeight:700, letterSpacing:3, color:"#E8E0D4", fontFamily:"'Helvetica Neue',sans-serif" }}>PROSPEO</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:profile?.role==="manager"?"#FF4C1A":"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{profile?.role==="manager"?"👑 ":""}{profile?.first_name || profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0]}</span>
            <button style={{ background:"transparent", border:"none", color:"#888", cursor:"pointer", fontSize:18, padding:"4px 6px" }} onClick={onSignOut}>⎋</button>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{ flex:1, overflow:"auto", paddingTop:isMobile?54:0, paddingBottom:isMobile?68:0 }}>
        {view==="dashboard" && <DashboardView contacts={contacts} stats={stats} loadingData={loadingData} profile={profile} isMobile={isMobile} go={go} lang={lang} subscription={subscription} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} onSelect={c=>{setSelected(c);setView("detail");}} />}
        {view==="add"       && <AddView profile={profile} isMobile={isMobile} notify={notify} onAdded={()=>{loadContacts();setView("list");}} />}
        {view==="list"      && <ListView contacts={contacts} profile={profile} loadingData={loadingData} isMobile={isMobile} lang={lang} onSelect={c=>{setSelected(c);setView("detail");}} onAdd={()=>go("add")} />}
        {view==="detail" && selected && <DetailView contact={selected} profile={profile} isMobile={isMobile} lang={lang} onBack={()=>setView("list")} onStatusUpdate={handleStatusUpdate} onDelete={handleDelete} notify={notify} />}
        {view==="report"    && <ReportView contacts={contacts} profile={profile} isMobile={isMobile} lang={lang} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} notify={notify} onSelectContact={c=>{setSelected(c);setView("detail");}} />}
        {view==="profile"       && <ProfileView profile={profile} isMobile={isMobile} notify={notify} lang={lang} changeLang={changeLang} onUpdated={(p)=>{ setProfile(p); }} />}
        {view==="subscription"  && <SubscriptionView profile={profile} subscription={subscription} isMobile={isMobile} lang={lang} notify={notify} onActivated={loadSubscription} />}
        {view==="activate"      && <ActivateKeyView profile={profile} isMobile={isMobile} notify={notify} onActivated={()=>{ loadSubscription(); setView("dashboard"); }} />}
        {view==="superadmin" && isSuperManager(profile) && <SuperAdminView profile={profile} isMobile={isMobile} lang={lang} notify={notify} />}
        {view==="crm"         && (
          isSuperManager(profile) || profile?.crm_enabled
            ? <CRMConfigView profile={profile} isMobile={isMobile} lang={lang} notify={notify} />
            : <CRMLockedView isMobile={isMobile} lang={lang} />
        )}
      </main>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100, background:"#1A1A1A", display:"flex", borderTop:"1px solid #222", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
          {NAV.map(item => (
            <button key={item.id} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"9px 4px 7px", border:"none", background:"transparent", cursor:"pointer", color:view===item.id?"#FF4C1A":"#555" }} onClick={()=>go(item.id)}>
              <span style={{ fontSize:20 }}>{item.icon}</span>
              <span style={{ fontSize:10, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:view===item.id?700:400 }}>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function DashboardView({ contacts, stats, loadingData, profile, isMobile, go, lang="fr", subscription=null, globalSearch="", setGlobalSearch, onSelect }) {
  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:22 }}>
        <h1 style={T(isMobile)}>{t("dashboard_title",lang)}</h1>
        <p style={Sub}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
      </div>

      {profile?.role !== "manager" && subscription && subscription.status !== "lifetime" && !(subscription.current_period_end && new Date(subscription.current_period_end) > new Date("2099-01-01")) && (() => {
        const now = new Date();
        const trialEnd = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
        const daysLeft = trialEnd ? Math.ceil((trialEnd - now) / 86400000) : 0;
        if (subscription.status === "expired") return (
          <div style={{ background:"#FF2D2D", borderRadius:12, padding:16, marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#fff", fontFamily:"'Helvetica Neue',sans-serif" }}>⚠️ Abonnement expiré</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontFamily:"'Helvetica Neue',sans-serif", marginTop:2 }}>Abonnez-vous pour continuer à utiliser Prospeo</div>
            </div>
            <button style={{ padding:"8px 16px", background:"#fff", color:"#FF2D2D", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }} onClick={()=>go("subscription")}>S'abonner</button>
          </div>
        );
        if (subscription.status === "trial" && daysLeft <= 3) return (
          <div style={{ background:"#FF9500", borderRadius:12, padding:16, marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#fff", fontFamily:"'Helvetica Neue',sans-serif" }}>⏳ Essai : {daysLeft} jour{daysLeft > 1?"s":""} restant{daysLeft > 1?"s":""}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontFamily:"'Helvetica Neue',sans-serif", marginTop:2 }}>Activez votre abonnement pour ne pas perdre vos données</div>
            </div>
            <button style={{ padding:"8px 16px", background:"#fff", color:"#FF9500", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }} onClick={()=>go("subscription")}>Voir les offres</button>
          </div>
        );
        if (subscription.status === "trial") return (
          <div style={{ background:"#E8F4FF", borderRadius:12, padding:14, marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>🎁</span>
            <div style={{ fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, color:"#1A6AFF" }}>{t("trial_active",lang)} — {daysLeft} jour{daysLeft>1?"s":""} restant{daysLeft>1?"s":""}</div>
          </div>
        );
        return null;
      })()}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:12, marginBottom:22 }}>
        {[{label:t("total",lang),value:stats.total,bg:"#E8E0D4",fg:"#1A1A1A"},{label:t("hot",lang),value:stats.chaud,bg:"#FF4C1A",fg:"#fff"},{label:t("converted",lang),value:stats.converti,bg:"#00C48C",fg:"#fff"},{label:t("this_week",lang),value:stats.thisWeek,bg:"#1A1A1A",fg:"#E8E0D4"}].map(st=>(
          <div key={st.label} style={{ background:st.bg, borderRadius:14, padding:isMobile?"15px":"20px" }}>
            <div style={{ fontSize:isMobile?30:36, fontWeight:700, color:st.fg, lineHeight:1 }}>{st.value}</div>
            <div style={{ fontSize:10, color:"#FFFFFF", opacity:0.85, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5, marginTop:4 }}>{st.label}</div>
          </div>
        ))}
      </div>
      {/* ── BARRE DE RECHERCHE GLOBALE ── */}
      {(() => {
        const q = globalSearch.trim().toLowerCase();
        const statusMap = {
          chaud: ["chaud","hot","caliente","quente","caldo","heiß","varm","het"],
          tiede: ["tiede","tiede","warm","tibio","morno","tiepido","lunken","ljummen","lauw"],
          froid: ["froid","cold","frío","frio","freddo","kalt","kald","kall","koud"],
          converti: ["converti","converted","convertido","convertito","konvertiert","konvertert","konverterad","geconverteerd"],
        };
        const matchStatus = (status, q) => {
          const aliases = statusMap[status] || [status];
          return aliases.some(a => a.includes(q));
        };
        const results = q.length >= 2 ? contacts.filter(c => {
          const name = `${c.first_name||""} ${c.last_name||""}`.toLowerCase();
          const rep  = (c.profiles?.full_name||c.profiles?.email||"").toLowerCase();
          return name.includes(q)
            || (c.company||"").toLowerCase().includes(q)
            || (c.email||"").toLowerCase().includes(q)
            || (c.phone||"").toLowerCase().includes(q)
            || matchStatus(c.status, q)
            || rep.includes(q);
        }) : [];
        return (
          <div style={{ ...C, marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>🔍</span>
                <input
                  style={{ ...I, paddingLeft:38 }}
                  placeholder={t("search",lang) + " — nom, entreprise, email, statut..."}
                  value={globalSearch}
                  onChange={e=>setGlobalSearch(e.target.value)}
                />
              </div>
              {globalSearch && (
                <button style={{ border:"none", background:"#F0EBE0", borderRadius:8, padding:"10px 12px", cursor:"pointer", fontSize:13, color:"#888" }}
                  onClick={()=>setGlobalSearch("")}>✕</button>
              )}
            </div>

            {q.length >= 2 && (
              <div style={{ marginTop:10 }}>
                {results.length === 0 ? (
                  <div style={{ padding:"12px 0", color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, textAlign:"center" }}>
                    Aucun résultat pour « {globalSearch} »
                  </div>
                ) : results.length === 1 ? (
                  // Un seul résultat → ouvre directement la fiche
                  <div>
                    <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>1 résultat — cliquez pour ouvrir la fiche</div>
                    {results.map(c => (
                      <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px", background:"#FFF8F4", borderRadius:10, cursor:"pointer", border:"1.5px solid #FFD4C4" }} onClick={()=>{ onSelect(c); setGlobalSearch(""); }}>
                        <div style={AV}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A" }}>{c.first_name} {c.last_name}</div>
                          <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{c.company||"—"} · {c.email||c.phone||""}</div>
                          {profile?.role==="manager" && c.profiles?.full_name && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>👤 {c.profiles.full_name}</div>}
                        </div>
                        <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text, flexShrink:0 }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Plusieurs résultats → liste cliquable
                  <div>
                    <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>{results.length} résultats</div>
                    {results.map(c => (
                      <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:"1px solid #F0EBE0", cursor:"pointer" }} onClick={()=>{ onSelect(c); setGlobalSearch(""); }}>
                        <div style={AV}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.first_name} {c.last_name}</div>
                          <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.company||"—"} · {c.email||c.phone||""}</div>
                          {profile?.role==="manager" && c.profiles?.full_name && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>👤 {c.profiles.full_name}</div>}
                        </div>
                        <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text, flexShrink:0 }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div style={C}>
        <h3 style={CT}>{t("last_prospects",lang)}</h3>
        {loadingData ? <div style={LT}>Chargement...</div> :
          contacts.slice(0,5).map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:"1px solid #F0EBE0", cursor:"pointer" }} onClick={()=>onSelect(c)}>
              <div style={AV}>{c.first_name[0]}{c.last_name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.company||c.role}</div>
                {profile?.role==="manager" && (
                  <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}>
                    👤 {displayName(c.profiles)}
                  </div>
                )}
              </div>
              <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text, flexShrink:0 }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
            </div>
          ))
        }
      </div>
      {profile?.role==="manager" && (
        <div style={{ ...C, marginTop:14 }}>
          <h3 style={CT}>{t("by_sales_rep",lang)}</h3>
          {(() => {
            const byUser = contacts.reduce((acc, c) => {
              const name = displayName(c.profiles);
              if (!acc[name]) acc[name] = { total:0, chaud:0, converti:0 };
              acc[name].total++;
              if (c.status==="chaud") acc[name].chaud++;
              if (c.status==="converti") acc[name].converti++;
              return acc;
            }, {});
            return Object.entries(byUser).map(([name, s]) => (
              <div key={name} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #F0EBE0" }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:"#FF4C1A", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }}>{name[0]}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A" }}>{name}</div>
                  <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{s.total} prospect{s.total>1?"s":""} · {s.chaud} chaud{s.chaud>1?"s":""} · {s.converti} converti{s.converti>1?"s":""}</div>
                </div>
                <div style={{ fontSize:18, fontWeight:700, color:"#1A1A1A", fontFamily:"'Helvetica Neue',sans-serif" }}>{s.total}</div>
              </div>
            ));
          })()}
        </div>
      )}

      <div style={{ ...C, marginTop:14 }}>
        <h3 style={CT}>{t("quick_actions",lang)}</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[{icon:"✏️",label:t("manual",lang),to:"add"},{icon:"📇",label:t("card_ai",lang),to:"add"},{icon:"📊",label:t("export_excel",lang),to:"report"},{icon:"◉",label:"Rapports",to:"report"}].map(q=>(
            <button key={q.label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:isMobile?13:15, border:"2px solid #F0EBE0", borderRadius:12, background:"#F5F0E8", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }} onClick={()=>go(q.to)}>
              <span style={{ fontSize:22 }}>{q.icon}</span><span>{q.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddView({ profile, isMobile, notify, lang="fr", onAdded }) {
  const [form, setForm] = useState({ first_name:"", last_name:"", company:"", role:"", email:"", phone:"", source:"manuel", notes:"", status:"froid" });
  const [analyzing, setAnalyzing] = useState(false);
  const [rec, setRec]             = useState(false);
  const [recF, setRecF]           = useState(null);
  const [vocalFull, setVocalFull] = useState(false);
  const [vocalText, setVocalText] = useState("");
  const [vocalAnalyzing, setVocalAnalyzing] = useState(false);
  const [showPWABanner, setShowPWABanner] = useState(false);
  const [duplicate, setDuplicate]         = useState(null);
  const STATUS_COLORS = getStatusColors(lang);
  const fileRef = useRef(null);
  const recRef  = useRef(null);
  const vocalRecRef = useRef(null);
  const f = (k,v) => {
    setForm(p => {
      const updated = {...p,[k]:v};
      // Check for duplicates when name or company changes
      if (["first_name","last_name","company"].includes(k)) {
        checkDuplicate(updated);
      }
      return updated;
    });
  };

  const checkDuplicate = async (formData) => {
    const { first_name, last_name, company } = formData;
    if (!first_name || !last_name) { setDuplicate(null); return; }
    try {
      // Search all contacts (manager sees all, commercial sees own but we query all for duplicate check)
      const { data } = await supabase
        .from("contacts")
        .select("*, profiles:user_id(full_name, first_name, last_name, email, role)")
        .ilike("first_name", first_name.trim())
        .ilike("last_name", last_name.trim());

      if (!data || data.length === 0) { setDuplicate(null); return; }

      // Filter by company if provided
      const matches = company
        ? data.filter(c => c.company?.toLowerCase().includes(company.toLowerCase().trim()))
        : data;

      if (matches.length === 0) { setDuplicate(null); return; }

      // Found duplicate
      const dup = matches[0];
      const owner = dup.profiles;
      const ownerName = owner?.first_name && owner?.last_name
        ? `${owner.first_name} ${owner.last_name}`
        : owner?.full_name || owner?.email || "un autre utilisateur";
      const ownerRole = owner?.role === "manager" ? "Manager" : "Commercial";

      setDuplicate({
        contact: dup,
        ownerName,
        ownerRole,
        isOwn: dup.user_id === profile.id,
      });
    } catch { setDuplicate(null); }
  };

  const submit = async () => {
    if (!form.first_name||!form.last_name) { notify("First name and last name required","error"); return; }

    // Block if duplicate detected (except for managers who can override)
    if (duplicate && profile?.role !== "manager") {
      notify("⚠️ Ce prospect existe déjà dans la base", "error");
      return;
    }

    const { data: newContact, error } = await supabase
      .from("contacts").insert({...form, user_id:profile.id}).select().single();
    if (error) { notify("Erreur enregistrement","error"); return; }
    notify(`✅ ${form.first_name} ${form.last_name} ${t("prospect_added",lang)}`);

    // Sync CRM automatique en arrière-plan
    if (newContact?.id) {
      fetch("/api/crm-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: newContact.id, user_id: profile.id }),
      }).then(r => r.json()).then(data => {
        if (data.synced > 0) notify(`🔗 Synchronisé avec ${data.synced} CRM`);
      }).catch(() => {});
    }

    setForm({ first_name:"", last_name:"", company:"", role:"", email:"", phone:"", source:"manuel", notes:"", status:"froid" });
    setDuplicate(null);
    onAdded();
  };

  const scanCard = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setAnalyzing(true); f("source","carte");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const b64 = ev.target.result.split(",")[1];
        const text = await scanCardAI(b64, file.type);
        const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
        setForm(p=>({...p,...parsed,source:"carte"}));
        notify("📇 Carte analysée !");
      } catch { notify(t("error",lang),"error"); }
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  const inputRefs = useRef({});

  const startVoice = (field) => {
    if (isIOSPWA()) {
      setShowPWABanner(true);
      return;
    }
    if (isIOSSafari()) {
      const inputEl = inputRefs.current[field];
      if (inputEl) {
        inputEl.focus();
        notify("🎙️ Appuyez sur le micro de votre clavier iOS");
      }
      return;
    }
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { notify(t("vocal_not_supported",lang),"error"); return; }
    const r = new SR(); r.lang="fr-FR"; r.interimResults=false;
    r.onresult = e => { const t=e.results[0][0].transcript; f(field, form[field]?form[field]+" "+t:t); setRec(false); setRecF(null); notify(`🎙️ "${t}"`); };
    r.onerror = ()=>{ setRec(false); setRecF(null); notify("Erreur micro","error"); };
    r.onend   = ()=>{ setRec(false); setRecF(null); };
    recRef.current=r; r.start(); setRec(true); setRecF(field);
  };
  const stopVoice = () => { recRef.current?.stop(); setRec(false); setRecF(null); };

  const startVocalFull = () => {
    f("source","vocal");
    if (isIOSPWA()) {
      setShowPWABanner(true);
      return;
    }
    if (isIOSSafari()) {
      setVocalFull(true);
      setVocalText("");
      return;
    }
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { setVocalFull(true); setVocalText(""); return; }
    const r = new SR(); r.lang="fr-FR"; r.interimResults=true; r.continuous=false;
    r.onresult = e => {
      const transcript = Array.from(e.results).map(res=>res[0].transcript).join(" ");
      setVocalText(transcript);
    };
    r.onend = () => { vocalRecRef.current = null; };
    r.onerror = () => { vocalRecRef.current = null; notify("Erreur micro","error"); };
    vocalRecRef.current = r;
    r.start();
    setVocalFull(true);
    setVocalText("");
  };

  const stopVocalFull = () => {
    if (vocalRecRef.current) { vocalRecRef.current.stop(); vocalRecRef.current = null; }
  };

  const startRecording = () => {
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { notify(t("vocal_not_supported",lang),"error"); return; }
    const r = new SR(); r.lang="fr-FR"; r.interimResults=true; r.continuous=false;
    r.onresult = e => {
      const transcript = Array.from(e.results).map(res=>res[0].transcript).join(" ");
      setVocalText(transcript);
    };
    r.onend = () => { vocalRecRef.current = null; };
    r.onerror = (err) => {
      vocalRecRef.current = null;
      if (err.error === "not-allowed") notify("Autorisez le micro dans Chrome","error");
      else notify("Erreur micro : "+err.error,"error");
    };
    vocalRecRef.current = r;
    r.start();
  };

  const analyzeVocalText = async (text) => {
    if (!text.trim()) { notify(t("no_text_analyze",lang),"error"); return; }
    setVocalAnalyzing(true);
    try {
      const result = await callClaude([{
        role:"user",
        content:`Tu es un assistant qui extrait des informations de contact.
Texte dicté : "${text}"
Retourne ce JSON complété (string vide si info absente), RIEN D'AUTRE :
{"first_name":"","last_name":"","company":"","role":"","email":"","phone":"","notes":""}`
      }]);

      console.log("Réponse IA brute:", result);

      // Parsing ultra-robuste
      let parsed = {};
      const clean = result
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      // Essai 1 : parsing direct
      try { parsed = JSON.parse(clean); }
      catch {
        // Essai 2 : extraire le premier objet JSON trouvé
        const start = clean.indexOf("{");
        const end   = clean.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          try { parsed = JSON.parse(clean.slice(start, end + 1)); }
          catch { parsed = {}; }
        }
      }

      // Appliquer les champs trouvés (même si partiels)
      const fields = ["first_name","last_name","company","role","email","phone","notes"];
      const update = {};
      fields.forEach(k => { if (parsed[k] !== undefined) update[k] = parsed[k]; });

      if (Object.keys(update).length === 0) {
        notify("IA n'a pas trouvé d'informations dans le texte","error");
      } else {
        setForm(p=>({...p,...update,source:"vocal"}));
        setVocalFull(false);
        setVocalText("");
        notify("🎙️ Contact extrait avec succès !");
      }
    } catch(err) {
      console.error("Erreur analyse vocale:", err.message);
      notify("Erreur : " + err.message, "error");
    }
    setVocalAnalyzing(false);
  };

  const FIELDS = [
    { k:"first_name", l:t("first_name",lang)+" *", ph:"Jean" },
    { k:"last_name",  l:t("last_name",lang)+" *", ph:"Dupont" },
    { k:"company",    l:t("company",lang), ph:"Acme Corp" },
    { k:"role",       l:t("role",lang), ph:"Director" },
    { k:"email",      l:t("email",lang), ph:"jean@acme.fr" },
    { k:"phone",      l:t("phone",lang), ph:"+33 6 00 00 00 00" },
  ];

  return (
    <div style={P(isMobile)}>
      <h1 style={T(isMobile)}>{t("add_title",lang)}</h1>
      {showPWABanner && (
        <div style={{ background:"#1A1A1A", borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>🎙️</span>
              <span style={{ fontSize:14, fontWeight:600, color:"#E8E0D4", fontFamily:"'Helvetica Neue',sans-serif" }}>{t("vocal_unavailable",lang)}</span>
            </div>
            <button style={{ border:"none", background:"transparent", color:"#888", cursor:"pointer", fontSize:18, padding:"0 0 0 8px" }} onClick={()=>setShowPWABanner(false)}>✕</button>
          </div>
          <p style={{ fontSize:13, color:"#CCCCCC", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 16px", lineHeight:1.6 }}>
            {t("vocal_pwa_msg",lang)} <strong style={{ color:"#E8E0D4" }}>Google Chrome</strong>.
          </p>
          <button
            style={{ width:"100%", padding:"13px", background:"#FF4C1A", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
            onClick={openInChrome}>
            <span>🌐</span>
            <span>{t("open_in_chrome",lang)}</span>
          </button>
          <p style={{ fontSize:11, color:"#AAAAAA", fontFamily:"'Helvetica Neue',sans-serif", margin:"10px 0 0", textAlign:"center", lineHeight:1.5 }}>
            Si Chrome n'est pas installé, téléchargez-le depuis l'App Store
          </p>
        </div>
      )}

      <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
        {[{id:"manuel",icon:"✏️",label:t("manual",lang)},{id:"carte",icon:"📇",label:t("card_ai",lang)},{id:"vocal",icon:"🎙️",label:t("vocal",lang)}].map(src=>(
          <button key={src.id} style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"9px 13px":"10px 18px", border:`2px solid ${form.source===src.id?"#1A1A1A":"#E8E0D4"}`, borderRadius:30, background:form.source===src.id?"#1A1A1A":"transparent", color:form.source===src.id?"#E8E0D4":"#888", cursor:"pointer", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif" }}
            onClick={()=>{
              if(src.id==="carte") { f("source","carte"); fileRef.current?.click(); }
              else if(src.id==="vocal") { startVocalFull(); }
              else { f("source","manuel"); }
            }}>
            <span>{src.icon}</span><span>{src.label}</span>
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={scanCard} />
      {analyzing && <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 18px", background:"#FFF8F4", border:"2px solid #FF4C1A", borderRadius:10, marginBottom:18, fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, color:"#FF4C1A" }}><div style={{ width:16, height:16, border:"3px solid #FFD4C4", borderTopColor:"#FF4C1A", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} /><span>{t("analyzing",lang)}</span></div>}

      {duplicate && (
        <div style={{ background: duplicate.isOwn ? "#FFF8F4" : "#FFF3F3", border:`2px solid ${duplicate.isOwn?"#FF9500":"#FF2D2D"}`, borderRadius:12, padding:16, marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
            <span style={{ fontSize:20, flexShrink:0 }}>{duplicate.isOwn ? "⚠️" : "🚫"}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color: duplicate.isOwn?"#FF9500":"#FF2D2D", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:4 }}>
                {duplicate.isOwn ? t("duplicate_own",lang) : t("duplicate_other",lang)}
              </div>
              <div style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.5 }}>
                <strong>{duplicate.contact.first_name} {duplicate.contact.last_name}</strong>
                {duplicate.contact.company ? ` · ${duplicate.contact.company}` : ""}
                {" "}est déjà dans la base, affilié à{" "}
                <strong>{duplicate.isOwn ? t("yourself",lang) : `${duplicate.ownerRole} ${duplicate.ownerName}`}</strong>.
              </div>
              {duplicate.contact.status && (
                <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ ...SB, background:STATUS_COLORS[duplicate.contact.status]?.bg, color:STATUS_COLORS[duplicate.contact.status]?.text, fontSize:10 }}>
                    {STATUS_COLORS[duplicate.contact.status]?.label}
                  </div>
                  <span style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>
                    Ajouté le {new Date(duplicate.contact.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              )}
              {profile?.role === "manager" && (
                <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginTop:6, fontStyle:"italic" }}>
                  En tant que Manager, vous pouvez quand même enregistrer ce prospect.
                </div>
              )}
            </div>
            <button style={{ border:"none", background:"transparent", color:"#aaa", cursor:"pointer", fontSize:16, flexShrink:0, padding:0 }}
              onClick={()=>setDuplicate(null)}>✕</button>
          </div>
        </div>
      )}

      {vocalFull && (
        <div style={{ background:"#1A1A1A", borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background: vocalRecRef.current ? "#FF4C1A" : "#555", animation: vocalRecRef.current ? "pulse 1s infinite" : "none" }} />
              <span style={{ fontSize:13, fontWeight:600, color:"#FFFFFF", fontFamily:"'Helvetica Neue',sans-serif" }}>
                {isIOSSafari() ? "Dictée vocale" : vocalRecRef.current ? t("listening",lang) : t("ready_to_listen",lang)}
              </span>
            </div>
            <button style={{ border:"none", background:"transparent", color:"#888", cursor:"pointer", fontSize:18, padding:"4px" }} onClick={()=>{ stopVocalFull(); setVocalFull(false); setVocalText(""); f("source","manuel"); }}>✕</button>
          </div>

          {isIOSSafari() ? (
            <div style={{ marginBottom:14 }}>
              <p style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 10px", lineHeight:1.5 }}>
                Dictez votre contact en une phrase, puis collez le texte ci-dessous :
              </p>
              <p style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 10px", lineHeight:1.5, fontStyle:"italic" }}>
                Exemple : "Jean Dupont, directeur commercial chez Acme, jean@acme.fr, 06 12 34 56 78"
              </p>
              <textarea
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #333", borderRadius:10, background:"#2A2A2A", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", color:"#E8E0D4", minHeight:70, resize:"none", boxSizing:"border-box", outline:"none" }}
                placeholder=t("paste_or_type",lang)
                value={vocalText}
                onChange={e=>setVocalText(e.target.value)}
              />
            </div>
          ) : (
            <div style={{ marginBottom:14 }}>
              <p style={{ fontSize:11, color:"#CCCCCC", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 8px", fontStyle:"italic" }}>
                Exemple : "Jean Dupont, directeur commercial chez Acme, jean@acme.fr, 06 12 34 56 78"
              </p>
              {!vocalRecRef.current ? (
                <button style={{ width:"100%", padding:"12px", background:"#FF4C1A", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, marginBottom:8 }}
                  onClick={startRecording}>
                  🎙️ Appuyer pour dicter
                </button>
              ) : (
                <button style={{ width:"100%", padding:"12px", background:"#333", color:"#E8E0D4", border:"2px solid #FF4C1A", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, marginBottom:8 }}
                  onClick={stopVocalFull}>
                  ⏹ Arrêter la dictée
                </button>
              )}
              {vocalText && (
                <div style={{ padding:"10px 12px", background:"#2A2A2A", borderRadius:8, fontSize:13, color:"#E8E0D4", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.5 }}>
                  "{vocalText}"
                </div>
              )}
            </div>
          )}

          <button
            style={{ width:"100%", padding:"12px", background: vocalText.trim() ? "#FF4C1A" : "#333", color: vocalText.trim() ? "#fff" : "#666", border:"none", borderRadius:10, cursor: vocalText.trim() ? "pointer" : "default", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
            onClick={()=>analyzeVocalText(vocalText)}
            disabled={!vocalText.trim()||vocalAnalyzing}>
            {vocalAnalyzing ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}><div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />Analyse IA en cours...</span> : "✨ Extraire les informations"}
          </button>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:13, marginBottom:13 }}>
        {FIELDS.map(field=>(
          <div key={field.k}>
            <label style={L}>{field.l}</label>
            <div style={{ display:"flex", gap:8 }}>
              <input ref={el=>inputRefs.current[field.k]=el} style={I} placeholder={field.ph} value={form[field.k]} onChange={e=>f(field.k,e.target.value)} />
              <button style={{ width:43, height:43, border:`2px solid ${rec&&recF===field.k?"#FF4C1A":"#E8E0D4"}`, borderRadius:8, background:rec&&recF===field.k?"#FF4C1A":"#fff", cursor:"pointer", fontSize:15, flexShrink:0 }}
                onClick={()=>rec&&recF===field.k?stopVoice():startVoice(field.k)}>
                {rec&&recF===field.k?"⏹":"🎙️"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={L}>{t("notes",lang)}</label>
        <div style={{ display:"flex", gap:8 }}>
          <textarea style={{ ...I, minHeight:85, resize:"vertical" }} placeholder={t("paste_or_type",lang)} value={form.notes} onChange={e=>f("notes",e.target.value)} />
          <button style={{ width:43, height:43, border:`2px solid ${rec&&recF==="notes"?"#FF4C1A":"#E8E0D4"}`, borderRadius:8, background:rec&&recF==="notes"?"#FF4C1A":"#fff", cursor:"pointer", fontSize:15, flexShrink:0, alignSelf:"flex-start" }}
            onClick={()=>rec&&recF==="notes"?stopVoice():startVoice("notes")}>
            🎙️
          </button>
        </div>
      </div>

      <div style={{ marginBottom:22 }}>
        <label style={L}>{t("status",lang)}</label>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:6 }}>
          {Object.entries(getStatusColors(lang||"fr")).map(([key,val])=>(
            <button key={key} style={{ padding:"7px 14px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, background:form.status===key?val.bg:"transparent", color:form.status===key?val.text:"#888", border:`2px solid ${val.bg}` }}
              onClick={()=>f("status",key)}>{val.label}</button>
          ))}
        </div>
      </div>

      <button style={{ width:"100%", padding:"14px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:12, cursor:"pointer", fontSize:15, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }} onClick={submit}>
        Enregistrer le prospect
      </button>
    </div>
  );
}

function ListView({ contacts, profile, loadingData, isMobile, lang="fr", onSelect, onAdd }) {
  const [search, setSearch] = useState("");
  const [fs, setFs]         = useState("all");
  const STATUS_COLORS = getStatusColors(lang);

  const filtered = contacts.filter(c => {
    const ms = fs==="all"||c.status===fs;
    const q  = search.toLowerCase();
    return ms && (!q||[c.first_name,c.last_name,c.company,c.email].some(v=>v?.toLowerCase().includes(q)));
  });

  return (
    <div style={P(isMobile)}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h1 style={T(isMobile)}>{profile?.role==="manager"?t("nav_prospects",lang):"Mes prospects"}</h1>
        {!isMobile && <button style={BP} onClick={onAdd}>＋ Nouveau</button>}
      </div>
      <input style={{ ...I, marginBottom:10, width:"100%" }} placeholder={"🔍  " + t("search",lang)} value={search} onChange={e=>setSearch(e.target.value)} />
      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        {["all","chaud","tiede","froid","converti"].map(st=>(
          <button key={st} style={{ padding:"6px 11px", border:`2px solid ${fs===st?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:fs===st?"#1A1A1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:fs===st?"#E8E0D4":"#888", flexShrink:0 }}
            onClick={()=>setFs(st)}>{st==="all"?"Tous":STATUS_COLORS[st]?.label}</button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {loadingData ? <div style={LT}>Chargement...</div> :
          filtered.length===0 ? <div style={{ padding:40, textAlign:"center", color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif" }}>{t("no_prospects",lang)}</div> :
          filtered.map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", background:"#fff", borderRadius:12, cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }} onClick={()=>onSelect(c)}>
              <div style={AV}>{c.first_name[0]}{c.last_name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.role}{c.company?` · ${c.company}`:""}</div>
                {profile?.role==="manager" && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>👤 {c.profiles?.full_name}</div>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
                <div style={{ fontSize:10, color:"#bbb", fontFamily:"'Helvetica Neue',sans-serif" }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function DetailView({ contact:initialContact, profile, isMobile, lang="fr", onBack, onStatusUpdate, onDelete, notify }) {
  const [c, setC]              = useState(initialContact);
  const [synthesis, setSyn]    = useState(null);
  const STATUS_COLORS = getStatusColors(lang);
  const [synLoad, setSynLoad]  = useState(false);
  const [past, setPast]        = useState([]);
  const [editing, setEditing]  = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving]    = useState(false);

  useEffect(() => {
    supabase.from("syntheses").select("*").eq("contact_id",c.id).order("created_at",{ascending:false}).then(({data})=>setPast(data||[]));
  }, [c.id]);

  const ef = (k,v) => setEditForm(p=>({...p,[k]:v}));

  const startEdit = () => {
    setEditForm({
      first_name: c.first_name || "",
      last_name:  c.last_name  || "",
      company:    c.company    || "",
      role:       c.role       || "",
      email:      c.email      || "",
      phone:      c.phone      || "",
      notes:      c.notes      || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("contacts")
      .update(editForm)
      .eq("id", c.id)
      .select()
      .single();
    if (error) { notify("Error saving","error"); }
    else { setC({ ...c, ...data }); setEditing(false); notify(t("profile_updated",lang)); }
    setSaving(false);
  };

  const genSyn = async () => {
    setSynLoad(true);
    try {
      const content = await callClaude([{ role:"user", content:`Synthèse commerciale (3-4 phrases) en français pour : ${JSON.stringify(c)}. Potentiel, points clés, prochaines actions.` }]);
      await supabase.from("syntheses").insert({ contact_id:c.id, user_id:profile.id, content });
      setSyn(content); setPast(p=>[{content,created_at:new Date().toISOString()},...p]);
      notify("✨ " + t("ai_synthesis",lang));
    } catch { notify(t("error",lang),"error"); }
    setSynLoad(false);
  };

  return (
    <div style={P(isMobile)}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <button style={{ border:"none", background:"transparent", cursor:"pointer", color:"#888", fontFamily:"'Helvetica Neue',sans-serif", fontSize:14, padding:0 }} onClick={onBack}>{t("back",lang)}</button>
        {!editing && (
          <button style={{ padding:"8px 16px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
            onClick={startEdit}>{t("edit",lang)}</button>
        )}
      </div>

      {editing && (
        <div style={C}>
          <h3 style={CT}>{t("edit_prospect",lang)}</h3>
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12, marginBottom:12 }}>
            {[
              { k:"first_name", l:t("first_name",lang)+" *", ph:"Jean" },
              { k:"last_name",  l:t("last_name",lang)+" *", ph:"Dupont" },
              { k:"company",    l:t("company",lang), ph:"Acme Corp" },
              { k:"role",       l:t("role",lang), ph:"Director" },
              { k:"email",      l:t("email",lang),       ph:"jean@acme.fr" },
              { k:"phone",      l:t("phone",lang), ph:"+33 6 00 00 00 00" },
            ].map(field => (
              <div key={field.k}>
                <label style={L}>{field.l}</label>
                <input style={I} placeholder={field.ph} value={editForm[field.k]} onChange={e=>ef(field.k,e.target.value)} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={L}>{t("notes",lang)}</label>
            <textarea style={{ ...I, minHeight:80, resize:"vertical" }} placeholder={t("paste_or_type",lang)} value={editForm.notes} onChange={e=>ef("notes",e.target.value)} />
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button style={{ ...BS, flex:1 }} onClick={()=>setEditing(false)}>Annuler</button>
            <button style={{ ...BP, flex:1 }} onClick={saveEdit} disabled={saving}>
              {saving ? t("saving",lang) : t("save",lang)}
            </button>
          </div>
        </div>
      )}

      {!editing && <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:18 }}>
        <div style={{ ...AV, width:54, height:54, fontSize:18, flexShrink:0 }}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
        <div>
          <h1 style={{ fontSize:isMobile?21:26, fontWeight:400, color:"#1A1A1A", margin:0, fontFamily:"Georgia,serif" }}>{c.first_name} {c.last_name}</h1>
          <p style={{ fontSize:13, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", margin:"3px 0 7px" }}>{c.role}{c.company?` · ${c.company}`:""}</p>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
            <div style={{ fontSize:11, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", alignSelf:"center" }}>{SOURCE_ICONS[c.source]} {c.source}</div>
            {profile?.role==="manager" && c.profiles?.full_name && (
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background:"#FFF4EE", borderRadius:20 }}>
            <span style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}>👤 {c.profiles.full_name}</span>
          </div>
        )}
          </div>
        </div>
      </div>}

      <div style={{ ...C, marginBottom:14 }}>
        <label style={L}>{t("edit_status",lang)}</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
          {Object.entries(getStatusColors(lang||"fr")).map(([key,val])=>(
            <button key={key} style={{ padding:"7px 13px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, background:c.status===key?val.bg:"transparent", color:c.status===key?val.text:"#888", border:`2px solid ${val.bg}` }}
              onClick={()=>{ onStatusUpdate(c.id,key); setC(p=>({...p,status:key})); }}>{val.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10, marginBottom:14 }}>
        {[{icon:"✉️",label:t("email",lang),value:c.email},{icon:"📞",label:t("phone",lang),value:c.phone},{icon:"🏢",label:t("company",lang),value:c.company},{icon:"📅",label:t("date",lang),value:new Date(c.created_at).toLocaleDateString("fr-FR")}]
          .filter(r=>r.value).map(row=>(
          <div key={row.label} style={{ display:"flex", gap:11, alignItems:"flex-start", padding:13, background:"#fff", borderRadius:10 }}>
            <span style={{ fontSize:17 }}>{row.icon}</span>
            <div><div style={{ fontSize:10, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>{row.label}</div><div style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A", marginTop:2 }}>{row.value}</div></div>
          </div>
        ))}
      </div>

      {c.notes && <div style={{ ...C, marginBottom:14 }}><h3 style={CT}>Notes</h3><p style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", color:"#444", lineHeight:1.6, margin:0 }}>{c.notes}</p></div>}

      <div style={{ background:"#FFF8F4", borderRadius:12, padding:18, border:"2px solid #FFD4C4", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <h3 style={CT}>{t("ai_synthesis",lang)}</h3>
          <button style={{ padding:"7px 14px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }} onClick={genSyn} disabled={synLoad}>{synLoad?"...":t("generate",lang)}</button>
        </div>
        {(synthesis||past[0]) && <p style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#444", lineHeight:1.7, margin:0, fontStyle:"italic" }}>{synthesis||past[0]?.content}</p>}
      </div>

      {!editing && <button style={{ width:"100%", padding:"12px", background:"transparent", color:"#FF2D2D", border:"2px solid #FF2D2D", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif" }} onClick={()=>onDelete(c.id)}>
        🗑 Supprimer ce prospect
      </button>}
    </div>
  );
}

function ReportView({ contacts, profile, isMobile, lang="fr", globalSearch="", setGlobalSearch, notify, onSelectContact }) {
  const [period, setPeriod]   = useState("month");
  const [cs, setCs]           = useState("");
  const STATUS_COLORS = getStatusColors(lang);
  const [ce, setCe]           = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const [filterUser, setFilterUser] = useState("all");
  const [reportSearch, setReportSearch] = useState(globalSearch||"");
  const { start, end } = getPeriodRange(period, cs, ce);
  const statusAliases = {
    chaud:["chaud","hot","caliente","quente","caldo"],
    tiede:["tiede","tiede","warm","tibio","morno","tiepido"],
    froid:["froid","cold","frío","frio","freddo","kalt"],
    converti:["converti","converted","convertido","convertito"],
  };
  const filtered = contacts.filter(c=>{
    const matchPeriod = !start || (new Date(c.created_at)>=start && new Date(c.created_at)<=end);
    const matchUser   = filterUser==="all" || displayName(c.profiles)===filterUser;
    const q = reportSearch.trim().toLowerCase();
    const matchSearch = !q || q.length < 2 || (
      `${c.first_name||""} ${c.last_name||""}`.toLowerCase().includes(q)
      || (c.company||"").toLowerCase().includes(q)
      || (c.email||"").toLowerCase().includes(q)
      || (c.phone||"").toLowerCase().includes(q)
      || (statusAliases[c.status]||[c.status]).some(a=>a.includes(q))
      || displayName(c.profiles).toLowerCase().includes(q)
    );
    return matchPeriod && matchUser && matchSearch;
  });
  const allUsers = profile?.role==="manager" ? [...new Set(contacts.map(c=>c.profiles?.full_name||c.profiles?.email||"Inconnu"))] : [];

  const stats = {
    total:    filtered.length,
    chaud:    filtered.filter(c=>c.status==="chaud").length,
    converti: filtered.filter(c=>c.status==="converti").length,
    carte:    filtered.filter(c=>c.source==="carte").length,
    manuel:   filtered.filter(c=>c.source==="manuel").length,
    vocal:    filtered.filter(c=>c.source==="vocal").length,
  };

  const exportExcel = () => {
    let csv = [t("first_name",lang),t("last_name",lang),t("company",lang),t("role",lang),t("email",lang),t("phone",lang),"Source",t("status",lang),t("notes",lang),"Commercial",t("date",lang)].join(";")+"\n";
    filtered.forEach(c=>{ csv+=[c.first_name,c.last_name,c.company,c.role,c.email,c.phone,c.source,c.status,c.notes,c.profiles?.full_name||"",new Date(c.created_at).toLocaleDateString("fr-FR")].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(";")+"\n"; });
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})); a.download=`prospects_${period}_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    notify("📊 Export téléchargé !");
  };

  return (
    <div style={P(isMobile)}>
      <h1 style={T(isMobile)}>{t("report_title",lang)}</h1>

      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        {getPeriods(lang).map(p=>(
          <button key={p.id} style={{ padding:"6px 11px", border:`2px solid ${period===p.id?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:period===p.id?"#1A1A1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:period===p.id?"#E8E0D4":"#888", flexShrink:0 }}
            onClick={()=>setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {period==="custom" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div><label style={L}>📅 Du</label><input type="date" style={I} value={cs} onChange={e=>setCs(e.target.value)} /></div>
          <div><label style={L}>Au</label><input type="date" style={I} value={ce} onChange={e=>setCe(e.target.value)} /></div>
        </div>
      )}

      {/* ── RECHERCHE DANS LE RAPPORT ── */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ flex:1, position:"relative" }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none" }}>🔍</span>
            <input
              style={{ ...I, paddingLeft:36 }}
              placeholder={t("search",lang) + " — nom, entreprise, email, statut..."}
              value={reportSearch}
              onChange={e=>setReportSearch(e.target.value)}
            />
          </div>
          {reportSearch && (
            <button style={{ border:"none", background:"#F0EBE0", borderRadius:8, padding:"10px 12px", cursor:"pointer", fontSize:13, color:"#888" }}
              onClick={()=>setReportSearch("")}>✕</button>
          )}
        </div>
        {reportSearch.trim().length >= 2 && (
          <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""} pour « {reportSearch} »
          </div>
        )}
      </div>

      {profile?.role==="manager" && allUsers.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <label style={L}>{t("filter_by_rep",lang)}</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
            <button style={{ padding:"6px 12px", border:`2px solid ${filterUser==="all"?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:filterUser==="all"?"#1A1A1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:filterUser==="all"?"#E8E0D4":"#888" }}
              onClick={()=>setFilterUser("all")}>{t("all",lang)}</button>
            {allUsers.map(u=>(
              <button key={u} style={{ padding:"6px 12px", border:`2px solid ${filterUser===u?"#FF4C1A":"#E8E0D4"}`, borderRadius:20, background:filterUser===u?"#FF4C1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:filterUser===u?"#fff":"#888" }}
                onClick={()=>setFilterUser(u)}>👤 {u}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        {[{label:t("total",lang),value:stats.total,bg:"#1A1A1A",fg:"#E8E0D4"},{label:t("hot",lang),value:stats.chaud,bg:"#FF4C1A",fg:"#fff"},{label:t("converted",lang),value:stats.converti,bg:"#00C48C",fg:"#fff"},{label:"Carte IA",value:stats.carte,bg:"#E8E0D4",fg:"#1A1A1A"}].map(st=>(
          <div key={st.label} style={{ background:st.bg, borderRadius:12, padding:"14px", textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:700, color:st.fg }}>{st.value}</div>
            <div style={{ fontSize:10, color:"#FFFFFF", opacity:0.85, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5, marginTop:3 }}>{st.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...C, marginBottom:14 }}>
        <h3 style={CT}>{t("by_source",lang)}</h3>
        {[{label:t("card_ai",lang),value:stats.carte,icon:"📇"},{label:t("manual",lang),value:stats.manuel,icon:"✏️"},{label:t("vocal",lang),value:stats.vocal,icon:"🎙️"}].map(st=>(
          <div key={st.label} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span>{st.icon}</span>
            <span style={{ fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, color:"#444", flex:1 }}>{st.label}</span>
            <span style={{ fontFamily:"'Helvetica Neue',sans-serif", fontSize:15, fontWeight:700, color:"#1A1A1A" }}>{st.value}</span>
            <div style={{ width:55, height:5, background:"#F0EBE0", borderRadius:3, overflow:"hidden" }}><div style={{ height:"100%", width:`${stats.total?(st.value/stats.total)*100:0}%`, background:"#FF4C1A", borderRadius:3 }} /></div>
          </div>
        ))}
      </div>

      <div style={{ ...C, marginBottom:14 }}>
        <h3 style={CT}>Contacts ({filtered.length})</h3>
        {filtered.length===0 ? <div style={{ textAlign:"center", color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", padding:16 }}>{t("no_prospects",lang)}</div> :
          filtered.map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:"1px solid #F0EBE0", cursor:"pointer" }} onClick={()=>onSelectContact && onSelectContact(c)}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.company||"—"} · {new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
                {profile?.role==="manager" && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>{c.profiles?.full_name}</div>}
              </div>
              <div style={{ ...SB, background:getStatusColors(lang||"fr")[c.status]?.bg, color:getStatusColors(lang||"fr")[c.status]?.text, flexShrink:0 }}>{getStatusColors(lang||"fr")[c.status]?.label}</div>
            </div>
          ))
        }
      </div>

      <div style={{ display:"flex", gap:10, flexDirection:isMobile?"column":"row" }}>
        <button style={{ ...BS, flex:1 }} onClick={exportExcel}>{t("export_excel",lang)}</button>
        <button style={{ ...BP, flex:1 }} onClick={()=>setPreview(true)}>📧 Envoyer email</button>
      </div>

      {preview && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ background:"#fff", borderRadius:isMobile?"20px 20px 0 0":16, padding:isMobile?"24px 20px 40px":32, width:isMobile?"100%":500 }}>
            <h3 style={{ fontSize:17, fontWeight:400, color:"#1A1A1A", margin:"0 0 14px", fontFamily:"Georgia,serif" }}>Envoyer le rapport</h3>
            <input style={{ ...I, marginBottom:10 }} placeholder="Destinataire" defaultValue="manager@entreprise.fr" />
            <input style={{ ...I, marginBottom:10 }} placeholder="Objet" defaultValue={`Rapport — ${getPeriods(lang).find(p=>p.id===period)?.label}`} />
            <textarea style={{ ...I, minHeight:70, marginBottom:14 }} defaultValue={`Total : ${stats.total} | Chauds : ${stats.chaud} | Convertis : ${stats.converti}`} />
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...BS, flex:1 }} onClick={()=>setPreview(false)}>Annuler</button>
              <button style={{ ...BP, flex:1 }} onClick={async()=>{ setSending(true); await new Promise(r=>setTimeout(r,1500)); setSending(false); notify("📧 Envoyé !"); setPreview(false); }} disabled={sending}>{sending?t("loading",lang):"✉️ Envoyer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile, isMobile, notify, lang="fr", changeLang, onUpdated }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name:  "",
    company:    "",
    phone:      "",
  });
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const f = (k,v) => {
    setForm(p => {
      const updated = {...p,[k]:v};
      // Check for duplicates when name or company changes
      if (["first_name","last_name","company"].includes(k)) {
        checkDuplicate(updated);
      }
      return updated;
    });
  };

  const checkDuplicate = async (formData) => {
    const { first_name, last_name, company } = formData;
    if (!first_name || !last_name) { setDuplicate(null); return; }
    try {
      // Search all contacts (manager sees all, commercial sees own but we query all for duplicate check)
      const { data } = await supabase
        .from("contacts")
        .select("*, profiles:user_id(full_name, first_name, last_name, email, role)")
        .ilike("first_name", first_name.trim())
        .ilike("last_name", last_name.trim());

      if (!data || data.length === 0) { setDuplicate(null); return; }

      // Filter by company if provided
      const matches = company
        ? data.filter(c => c.company?.toLowerCase().includes(company.toLowerCase().trim()))
        : data;

      if (matches.length === 0) { setDuplicate(null); return; }

      // Found duplicate
      const dup = matches[0];
      const owner = dup.profiles;
      const ownerName = owner?.first_name && owner?.last_name
        ? `${owner.first_name} ${owner.last_name}`
        : owner?.full_name || owner?.email || "un autre utilisateur";
      const ownerRole = owner?.role === "manager" ? "Manager" : "Commercial";

      setDuplicate({
        contact: dup,
        ownerName,
        ownerRole,
        isOwn: dup.user_id === profile.id,
      });
    } catch { setDuplicate(null); }
  };

  // Recharge depuis Supabase à chaque fois que l'onglet est ouvert
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profile.id)
          .single();
        if (data) {
          setForm({
            first_name: data.first_name || "",
            last_name:  data.last_name  || "",
            company:    data.company    || "",
            phone:      data.phone      || "",
          });
          onUpdated({ ...profile, ...data });
        } else {
          // Si la lecture échoue, on utilise les données du profil en mémoire
          setForm({
            first_name: profile.first_name || "",
            last_name:  profile.last_name  || "",
            company:    profile.company    || "",
            phone:      profile.phone      || "",
          });
        }
      } catch(e) {
        // Fallback sur les données en mémoire
        setForm({
          first_name: profile.first_name || "",
          last_name:  profile.last_name  || "",
          company:    profile.company    || "",
          phone:      profile.phone      || "",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile.id]);

  const save = async () => {
    setSaving(true);
    const full_name = [form.first_name, form.last_name].filter(Boolean).join(" ") || profile?.full_name || "";
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...form, full_name })
      .eq("id", profile.id)
      .select()
      .single();
    if (error) { notify("Erreur sauvegarde","error"); }
    else { notify(t("profile_updated",lang)); onUpdated({ ...profile, ...data }); }
    setSaving(false);
  };

  if (loading) return <div style={{ ...P(isMobile), textAlign:"center", paddingTop:60 }}><div style={{ fontSize:32, color:"#FF4C1A", marginBottom:10 }}>◈</div><div style={{ fontFamily:"'Helvetica Neue',sans-serif", color:"#888" }}>Chargement...</div></div>;

  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:22 }}>
        <h1 style={T(isMobile)}>{t("profile_title",lang)}</h1>
        <p style={Sub}>{t("personal_info",lang)}</p>
      </div>

      {/* Avatar + infos de base */}
      <div style={{ ...C, marginBottom:16, display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"#FF4C1A", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }}>
          {(form.first_name||profile?.full_name||"?")[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A" }}>
            {[form.first_name, form.last_name].filter(Boolean).join(" ") || profile?.full_name || "Nouveau commercial"}
          </div>
          <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginTop:2 }}>{profile?.email}</div>
          <div style={{ marginTop:6 }}>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:20, background: profile?.role==="manager"?"#FF4C1A":"#1A1A1A", color:"#fff", fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5 }}>
              {profile?.role==="manager"?"👑 Manager":"Commercial"}
            </span>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <div style={C}>
        <h3 style={CT}>{t("personal_info",lang)}</h3>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
          <div>
            <label style={L}>{t("first_name",lang)}</label>
            <input style={I} placeholder="Jean" value={form.first_name} onChange={e=>f("first_name",e.target.value)} />
          </div>
          <div>
            <label style={L}>{t("last_name",lang)}</label>
            <input style={I} placeholder="Dupont" value={form.last_name} onChange={e=>f("last_name",e.target.value)} />
          </div>
          <div>
            <label style={L}>{t("company",lang)}</label>
            <input style={I} placeholder="Acme Corp" value={form.company} onChange={e=>f("company",e.target.value)} />
          </div>
          <div>
            <label style={L}>{t("phone",lang)}</label>
            <input style={I} placeholder="+33 6 00 00 00 00" value={form.phone} onChange={e=>f("phone",e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop:16, padding:"12px 14px", background:"#F5F0E8", borderRadius:10 }}>
          <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{t("email",lang)}</div>
          <div style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", color:"#aaa" }}>{profile?.email}</div>
          <div style={{ fontSize:11, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", marginTop:2 }}>{t("email_readonly",lang)}</div>
        </div>

        <div style={{ marginTop:16 }}>
          <label style={L}>{t("language_label",lang)}</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
            {LANGUAGES.map(l => (
              <button key={l.code}
                style={{ padding:"7px 12px", border:`2px solid ${lang===l.code?"#FF4C1A":"#E8E0D4"}`, borderRadius:20, background:lang===l.code?"#FF4C1A":"transparent", color:lang===l.code?"#fff":"#888", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:lang===l.code?700:400 }}
                onClick={()=>changeLang && changeLang(l.code)}>
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        <button style={{ ...BP, width:"100%", marginTop:16, padding:"14px" }} onClick={save} disabled={saving}>
          {saving ? t("saving",lang) : t("save_profile",lang)}
        </button>
      </div>
    </div>
  );
}

function SubscriptionView({ profile, subscription, isMobile, lang="fr", notify, onActivated }) {
  const [addQtyMore, setAddQtyMore] = useState(1);
  const [addingMore, setAddingMore]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [showActivate, setShowActivate] = useState(false);

  const subscribe = async (plan) => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, email: profile.email, userId: profile.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else notify("Erreur Stripe : " + data.error, "error");
    } catch (err) { notify("Erreur : " + err.message, "error"); }
    setLoading(false);
  };

  const now      = new Date();
  const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const subEnd   = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / 86400000)) : 0;

  const statusLabel = () => {
    if (!subscription) return { text:"Chargement...", color:"#888" };
    if (subscription.status==="lifetime" || (subEnd && subEnd > new Date("2099-01-01"))) return { text:"♾️ Licence gratuite à vie", color:"#FF4C1A" };
    if (subscription.status==="active")    return { text:`✅ Actif — expire le ${subEnd?.toLocaleDateString("fr-FR")}`, color:"#00C48C" };
    if (subscription.status==="trial")     return { text:`🎁 ${t("trial_active",lang)} — ${daysLeft} jour${daysLeft>1?"s":""} restant${daysLeft>1?"s":""}`, color:"#1A6AFF" };
    if (subscription.status==="expired")   return { text:"❌ Expiré", color:"#FF2D2D" };
    if (subscription.status==="cancelled") return { text:"Annulé", color:"#888" };
    return { text:"Inconnu", color:"#888" };
  };
  const sl = statusLabel();

  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:22 }}>
        <h1 style={T(isMobile)}>{t("sub_title",lang)}</h1>
        <p style={Sub}>{t("sub_status",lang)}</p>
      </div>

      {/* Statut actuel */}
      <div style={{ ...C, marginBottom:16 }}>
        <h3 style={CT}>{t("sub_status",lang)}</h3>
        <div style={{ fontSize:15, fontFamily:"'Helvetica Neue',sans-serif", color:sl.color, fontWeight:600, marginBottom:8 }}>{sl.text}</div>
        <div style={{ fontSize:13, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{profile?.email}</div>
      </div>

      {/* Offres */}
      {(subscription?.status !== "active") && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Choisissez votre offre</div>
          {/* Annuel uniquement — engagement 12 mois */}
          <div style={{ background:"#1A1A1A", borderRadius:14, padding:24, border:"2px solid #FF4C1A", position:"relative" }}>
            <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"#FF4C1A", color:"#fff", fontSize:11, fontWeight:700, padding:"4px 16px", borderRadius:20, fontFamily:"'Helvetica Neue',sans-serif", whiteSpace:"nowrap" }}>ENGAGEMENT 12 MOIS</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:4, marginTop:8 }}>
              <div style={{ fontSize:48, fontWeight:700, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1 }}>4,99€</div>
              <div style={{ fontSize:16, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>HT / mois</div>
            </div>
            <div style={{ fontSize:13, color:"#AAAAAA", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:4 }}>Facturé 59,88€ HT / an</div>
            <div style={{ fontSize:11, color:"#AAAAAA", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:20, fontStyle:"italic" }}>Engagement 12 mois minimum</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:20 }}>
              {["✓ Prospects illimités","✓ Scan carte IA","✓ Synthèse IA","✓ Export Excel","✓ Rapports","✓ Multi-utilisateurs"].map(f=>(
                <div key={f} style={{ fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#aaa" }}>{f}</div>
              ))}
            </div>
            <button style={{ ...BP, width:"100%", padding:"14px", background:"#FF4C1A", fontSize:15 }} onClick={()=>subscribe("annual")} disabled={loading}>
              {loading ? t("loading",lang) : "S'abonner — 59,88€ HT / an →"}
            </button>
            <div style={{ fontSize:11, color:"#AAAAAA", fontFamily:"'Helvetica Neue',sans-serif", textAlign:"center", marginTop:10 }}>
              {t("free_trial_days",lang)} · Sans carte bancaire requise
            </div>
          </div>
        </div>
      )}

      {/* Ajouter licences supplémentaires — visible pour les managers actifs */}
      {profile?.role === "manager" && subscription?.status === "active" && (
        <div style={{ ...C, marginBottom:16 }}>
          <h3 style={CT}>➕ Ajouter des licences commerciaux</h3>
          <p style={{ fontSize:13, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 12px", lineHeight:1.5 }}>
            Ajoutez des licences supplémentaires pour vos commerciaux. Chaque licence = 59,88€ HT/an.
          </p>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <button style={{ width:34, height:34, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:16, fontWeight:700 }}
                onClick={()=>setAddQtyMore(q=>Math.max(1,q-1))}>−</button>
              <div style={{ textAlign:"center", minWidth:60 }}>
                <div style={{ fontSize:22, fontWeight:700, color:"#1A1A1A" }}>{addQtyMore}</div>
                <div style={{ fontSize:10, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>licence{addQtyMore>1?"s":""}</div>
              </div>
              <button style={{ width:34, height:34, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:16, fontWeight:700 }}
                onClick={()=>setAddQtyMore(q=>Math.min(50,q+1))}>+</button>
              <div style={{ flex:1, padding:"10px 14px", background:"#F5F0E8", borderRadius:10, fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>
                <strong>{(addQtyMore * 59.88).toFixed(2)}€ HT</strong>
                <div style={{ fontSize:10, color:"#CCCCCC" }}>{addQtyMore} × 59,88€/an</div>
              </div>
            </div>
            <button style={{ ...BP, width:"100%" }} disabled={addingMore} onClick={async()=>{
              setAddingMore(true);
              try {
                const res = await fetch("/api/stripe-checkout", {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({ email:profile.email, userId:profile.id, quantity:addQtyMore, companyName:profile.company||"", addToExisting:true }),
                });
                const data = await res.json();
                if (data.url) window.location.href = data.url;
                else notify("Erreur : "+data.error,"error");
              } catch(err){ notify("Erreur : "+err.message,"error"); }
              setAddingMore(false);
            }}>
              {addingMore ? t("loading",lang) : `Acheter ${addQtyMore} licence${addQtyMore>1?"s":""} →`}
            </button>
          </div>
        </div>
      )}

      {/* Activer une clé */}
      <div style={C}>
        <h3 style={CT}>{t("activate_key",lang)}</h3>
        
        <button style={{ ...BS, width:"100%" }} onClick={()=>setShowActivate(!showActivate)}>
          🔑 Activer une clé
        </button>
        {showActivate && <ActivateKeyView profile={profile} isMobile={isMobile} lang={lang} notify={notify} onActivated={onActivated} inline />}
      </div>
    </div>
  );
}

function ActivateKeyView({ profile, isMobile, lang="fr", notify, onActivated, inline }) {
  const [key, setKey]       = useState("");
  const [loading, setLoading] = useState(false);

  const activate = async () => {
    if (!key.trim()) { notify(t("activate_key",lang),"error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/activate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase(), userId: profile.id, email: profile.email }),
      });
      const data = await res.json();
      if (data.success) {
        notify("🎉 " + data.message);
        onActivated();
      } else {
        notify(data.error || t("error",lang),"error");
      }
    } catch (err) { notify("Erreur : " + err.message,"error"); }
    setLoading(false);
  };

  return (
    <div style={inline ? { marginTop:16 } : P(isMobile)}>
      {!inline && <h1 style={T(isMobile)}>Activer ma clé</h1>}
      <div style={{ marginTop:inline?0:20 }}>
        <label style={L}>{t("activate_key",lang)}</label>
        <input style={{ ...I, textTransform:"uppercase", letterSpacing:2, fontFamily:"'Courier New',monospace", marginBottom:12 }}
          placeholder="PROS-XXXX-XXXX-XXXX"
          value={key}
          onChange={e=>setKey(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&activate()}
        />
        <button style={{ ...BP, width:"100%" }} onClick={activate} disabled={loading||!key.trim()}>
          {loading?t("loading",lang):t("activate_btn",lang)}
        </button>
      </div>
    </div>
  );
}

function CRMLockedView({ isMobile, lang="fr" }) {
  return (
    <div style={P(isMobile)}>
      <h1 style={T(isMobile)}>🔗 {t("crm_title",lang)}</h1>
      <div style={{ ...C, textAlign:"center", padding:40 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <h2 style={{ fontSize:20, fontWeight:600, color:"#1A1A1A", fontFamily:"Georgia,serif", margin:"0 0 12px" }}>
          Option CRM — Sur devis
        </h2>
        <p style={{ fontSize:14, color:"#666", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.7, margin:"0 0 24px", maxWidth:400, marginLeft:"auto", marginRight:"auto" }}>
          L'intégration CRM est une option payante disponible sur devis. Elle permet de synchroniser automatiquement vos prospects avec HubSpot, Salesforce, Pipedrive, Zoho et Odoo.
        </p>
        <div style={{ background:"#F5F0E8", borderRadius:12, padding:20, marginBottom:24, display:"inline-block", textAlign:"left", minWidth:280 }}>
          <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:1, marginBottom:12, fontWeight:600 }}>Tarification</div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif" }}>Licence de base</span>
            <span style={{ fontSize:13, fontWeight:700, color:"#1A1A1A" }}>4,99€ HT/mois</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif" }}>Option CRM</span>
            <span style={{ fontSize:13, fontWeight:700, color:"#FF4C1A" }}>+ 1,99€ HT/mois/licence</span>
          </div>
          <div style={{ borderTop:"1px solid #E8E0D4", marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif" }}>Frais de paramétrage</span>
            <span style={{ fontSize:13, fontWeight:700, color:"#888" }}>Sur devis</span>
          </div>
        </div>
        <p style={{ fontSize:12, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", margin:"0 0 20px" }}>
          Contactez votre administrateur Prospeo pour activer cette option.
        </p>
        <a href="mailto:contact@prospeo.me" style={{ display:"inline-block", padding:"12px 24px", background:"#1A1A1A", color:"#E8E0D4", borderRadius:10, fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, textDecoration:"none" }}>
          📧 Demander un devis
        </a>
      </div>
    </div>
  );
}

function CRMConfigView({ profile, isMobile, lang="fr", notify }) {
  // Show devis page if CRM not enabled (but still accessible to all)
  if (!isSuperManager(profile) && !profile?.crm_enabled) {
    return (
      <div style={P(isMobile)}>
        <h1 style={T(isMobile)}>{t("crm_title",lang)}</h1>
        <div style={{ ...C, textAlign:"center", padding:40 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔗</div>
          <h2 style={{ fontSize:20, fontWeight:600, color:"#1A1A1A", fontFamily:"Georgia,serif", margin:"0 0 12px" }}>
            Option CRM
          </h2>
          <p style={{ fontSize:14, color:"#666", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.7, margin:"0 0 24px", maxWidth:400, marginLeft:"auto", marginRight:"auto" }}>
            L'intégration CRM est une option payante disponible sur demande. Elle permet de synchroniser automatiquement vos prospects avec HubSpot, Salesforce, Pipedrive, Zoho et Odoo.
          </p>
          <div style={{ background:"#F5F0E8", borderRadius:12, padding:20, marginBottom:24, display:"inline-block", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1A1A1A", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:10 }}>Tarification</div>
            <div style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>
              ➕ <strong>+1,99€ HT/mois/licence</strong> en supplément du forfait de base
            </div>
            <div style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif" }}>
              🛠️ <strong>Frais d'accès et de paramétrage</strong> sur devis
            </div>
          </div>
          <div>
            <a href="mailto:contact@prospeo.me?subject=Demande option CRM&body=Bonjour, je souhaite activer l'option CRM pour mon compte Prospeo."
              style={{ display:"inline-block", padding:"12px 28px", background:"#FF4C1A", color:"#fff", borderRadius:10, textDecoration:"none", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:700 }}>
              📧 Demander un devis CRM
            </a>
          </div>
          <p style={{ fontSize:11, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", marginTop:16 }}>
            Notre équipe vous recontactera sous 24h pour étudier votre besoin.
          </p>
        </div>
      </div>
    );
  }
  const [configs, setConfigs]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ crm_type:"generic", name:"", config:{}, active:true });
  const [saving, setSaving]     = useState(false);

  const CRM_TYPES = [
    { id:"hubspot",    label:"HubSpot",    fields:[{k:"api_key",l:"API Key (Private App Token)"}] },
    { id:"salesforce", label:"Salesforce", fields:[{k:"instance_url",l:"URL Instance (ex: https://xxx.salesforce.com)"},{k:"client_id",l:"Client ID"},{k:"client_secret",l:"Client Secret"},{k:"username",l:"Username"},{k:"password",l:"Password"},{k:"security_token",l:"Security Token"}] },
    { id:"pipedrive",  label:"Pipedrive",  fields:[{k:"api_key",l:"API Token"}] },
    { id:"zoho",       label:"Zoho CRM",   fields:[{k:"access_token",l:"Access Token OAuth2"}] },
    { id:"odoo",       label:"Odoo",       fields:[{k:"url",l:"URL Odoo (ex: https://monodoo.com)"},{k:"db",l:"Nom base de données"},{k:"username",l:"Email utilisateur"},{k:"password",l:t("password",lang)}] },
    { id:"generic",    label:"CRM Générique / Webhook", fields:[{k:"webhook_url",l:"URL Webhook (POST)"},{k:"api_key",l:"Clé API (Bearer token, optionnel)"},{k:"secret_key",l:"Secret Webhook (optionnel)"}] },
  ];

  const loadConfigs = async () => {
    const { data } = await supabase.from("crm_configs").select("*").eq("user_id", profile.id);
    setConfigs(data || []);
    setLoading(false);
  };

  useEffect(() => { loadConfigs(); }, []);

  const selectedCRM = CRM_TYPES.find(c => c.id === form.crm_type);

  const save = async () => {
    if (!form.name) { notify("Donnez un nom à cette configuration","error"); return; }
    setSaving(true);
    const { error } = await supabase.from("crm_configs").insert({
      user_id: profile.id,
      crm_type: form.crm_type,
      name: form.name,
      active: true,
      config: form.config,
    });
    if (error) notify("Erreur sauvegarde","error");
    else { notify("✅ CRM configuré !"); setShowForm(false); loadConfigs(); }
    setSaving(false);
  };

  const toggle = async (id, active) => {
    await supabase.from("crm_configs").update({ active: !active }).eq("id", id);
    loadConfigs();
  };

  const remove = async (id) => {
    await supabase.from("crm_configs").delete().eq("id", id);
    loadConfigs();
    notify("✅");
  };

  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:20 }}>
        <h1 style={T(isMobile)}>🔗 Intégration CRM</h1>
        <p style={Sub}>Synchronisation automatique de vos prospects</p>
      </div>

      {/* Info */}
      <div style={{ background:"#E8F4FF", borderRadius:12, padding:14, marginBottom:16, display:"flex", gap:10 }}>
        <span>💡</span>
        <div style={{ fontSize:13, color:"#1A6AFF", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.5 }}>
          Chaque prospect ajouté sera automatiquement envoyé vers vos CRM configurés en temps réel.
        </div>
      </div>

      {/* Configs existantes */}
      {loading ? <div style={LT}>Chargement...</div> : (
        <>
          {configs.length === 0 && !showForm && (
            <div style={{ ...C, textAlign:"center", padding:32, marginBottom:16 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🔗</div>
              <div style={{ fontFamily:"'Helvetica Neue',sans-serif", color:"#888", marginBottom:16 }}>Aucun CRM configuré</div>
              <button style={BP} onClick={()=>setShowForm(true)}>+ Connecter un CRM</button>
            </div>
          )}

          {configs.map(cfg => (
            <div key={cfg.id} style={{ ...C, marginBottom:10, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background: cfg.active?"#EBF8F4":"#F0EBE0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                {cfg.crm_type==="hubspot"?"🟠":cfg.crm_type==="salesforce"?"☁️":cfg.crm_type==="pipedrive"?"🎯":cfg.crm_type==="zoho"?"🔴":cfg.crm_type==="odoo"?"🟣":"🔗"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A" }}>{cfg.name}</div>
                <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{CRM_TYPES.find(c=>c.id===cfg.crm_type)?.label} · {cfg.active?"✅ Actif":"⏸ Inactif"}</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ padding:"5px 10px", border:"1.5px solid #E8E0D4", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", color:"#888" }}
                  onClick={()=>toggle(cfg.id, cfg.active)}>{cfg.active?"Pause":"Activer"}</button>
                <button style={{ padding:"5px 10px", border:"1.5px solid #FF2D2D", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", color:"#FF2D2D" }}
                  onClick={()=>remove(cfg.id)}>✕</button>
              </div>
            </div>
          ))}

          {configs.length > 0 && !showForm && (
            <button style={{ ...BS, width:"100%", marginTop:8 }} onClick={()=>setShowForm(true)}>+ Ajouter un autre CRM</button>
          )}
        </>
      )}

      {/* Formulaire ajout */}
      {showForm && (
        <div style={{ ...C, marginTop:16 }}>
          <h3 style={CT}>Nouveau connecteur CRM</h3>

          <div style={{ marginBottom:14 }}>
            <label style={L}>{t("crm_type",lang)}</label>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:8 }}>
              {CRM_TYPES.map(crm => (
                <button key={crm.id}
                  style={{ padding:"10px 8px", border:`2px solid ${form.crm_type===crm.id?"#FF4C1A":"#E8E0D4"}`, borderRadius:10, background:form.crm_type===crm.id?"#FFF4EE":"transparent", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:form.crm_type===crm.id?"#FF4C1A":"#888", fontWeight:form.crm_type===crm.id?700:400 }}
                  onClick={()=>setForm(f=>({...f, crm_type:crm.id, config:{}}))}>
                  {crm.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={L}>{t("nav_crm",lang)}</label>
            <input style={I} placeholder={`Ex: ${selectedCRM?.label} Production`}
              value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          </div>

          {selectedCRM?.fields.map(field => (
            <div key={field.k} style={{ marginBottom:12 }}>
              <label style={L}>{field.l}</label>
              <input style={{ ...I, fontFamily: field.k.includes("key")||field.k.includes("token")||field.k.includes("secret") ? "'Courier New',monospace" : "'Helvetica Neue',sans-serif" }}
                placeholder={field.k.includes("url") ? "https://" : field.k.includes("key")||field.k.includes("token") ? "••••••••••••" : ""}
                type={field.k.includes("password")||field.k.includes("secret") ? "password" : "text"}
                value={form.config[field.k]||""}
                onChange={e=>setForm(f=>({...f, config:{...f.config, [field.k]:e.target.value}}))}
              />
            </div>
          ))}

          {form.crm_type === "generic" && (
            <div style={{ marginBottom:12 }}>
              <label style={L}>Mapping</label>
              <div style={{ padding:12, background:"#F5F0E8", borderRadius:8, fontSize:12, fontFamily:"'Courier New',monospace", color:"#444", lineHeight:1.6 }}>
                {`{
  "first_name": "FirstName",
  "last_name": "LastName",
  "email": t("email",lang),
  "phone": "Phone",
  "company": "Company"
}`}
              </div>
              <div style={{ fontSize:11, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>Laissez vide pour recevoir toutes les données Prospeo</div>
            </div>
          )}

          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button style={{ ...BS, flex:1 }} onClick={()=>setShowForm(false)}>Annuler</button>
            <button style={{ ...BP, flex:1 }} onClick={save} disabled={saving}>
              {saving?t("saving",lang):"✅ " + t("crm_connect",lang)}
            </button>
          </div>
        </div>
      )}

      {/* Doc API publique */}
      <div style={{ ...C, marginTop:16, background:"#1A1A1A" }}>
        <h3 style={{ ...CT, color:"#888" }}>API Publique Prospeo</h3>
        <div style={{ fontSize:12, color:"#CCCCCC", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:10 }}>
          Votre CRM peut aussi recevoir les données via cette URL webhook :
        </div>
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:12, color:"#FF4C1A", background:"#111", padding:12, borderRadius:8, marginBottom:8, wordBreak:"break-all" }}>
          POST https://prospeo-red.vercel.app/api/crm-sync
        </div>
        <div style={{ fontSize:11, color:"#555", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.6 }}>
          Format JSON envoyé : first_name, last_name, company, role, email, phone, status, source, notes, created_at
        </div>
      </div>
    </div>
  );
}

function SuperAdminView({ profile, isMobile, lang="fr", notify }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("stats");
  const [genQty, setGenQty]       = useState(1);
  const [genEmail, setGenEmail]   = useState("");
  const [genCompany, setGenCompany] = useState("");
  const [genNotes, setGenNotes]   = useState("");
  const [genTrial, setGenTrial]   = useState("annual");
  const [genLoading, setGenLoading] = useState(false);
  const [newKeys, setNewKeys]     = useState([]);

  // ── Ajouter licences à une entreprise existante ──
  const [addCompanyId, setAddCompanyId]   = useState("");
  const [addQty, setAddQty]               = useState(1);
  const [addNotes, setAddNotes]           = useState("");
  const [addTrial, setAddTrial]           = useState("annual");
  const [addLoading, setAddLoading]       = useState(false);
  const [addedKeys, setAddedKeys]         = useState([]);

  const call = async (action, extra = {}) => {
    const res = await fetch("/api/superadmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, callerEmail: profile.email, ...extra }),
    });
    return res.json();
  };

  useEffect(() => {
    call("getData").then(d => { setData(d); setLoading(false); });
  }, []);

  const generateKeys = async () => {
    setGenLoading(true);
    setNewKeys([]);
    const res = await call("generateKeys", {
      quantity: genQty, email: genEmail,
      companyName: genCompany, notes: genNotes,
      trialDays: genTrial === 'trial7' ? 7 : genTrial === 'trial14' ? 14 : 0,
    });
    if (res.success) {
      setNewKeys(res.keys);
      notify(`✅ ${res.message}`);
      call("getData").then(d => setData(d));
    } else {
      notify(res.error || "Erreur", "error");
    }
    setGenLoading(false);
  };

  const addLicences = async () => {
    if (!addCompanyId) { notify("Sélectionnez une entreprise","error"); return; }
    setAddLoading(true);
    setAddedKeys([]);
    const company = data.companies?.find(c => c.id === addCompanyId);
    const res = await call("addLicences", {
      companyId: addCompanyId,
      quantity: addQty,
      notes: addNotes,
      trialDays: addTrial === "trial7" ? 7 : addTrial === "trial14" ? 14 : 0,
    });
    if (res.success) {
      setAddedKeys(res.keys);
      notify(`✅ ${res.message}`);
      call("getData").then(d => setData(d));
    } else {
      notify(res.error || "Erreur", "error");
    }
    setAddLoading(false);
  };

  const grantLifetime = async (userId, name) => {
    if (!confirm(`Attribuer une licence GRATUITE À VIE à ${name} ?`)) return;
    const res = await call("grantLifetime", { userId });
    if (res.success) { notify(`✅ Licence gratuite à vie attribuée à ${name}`); call("getData").then(d => setData(d)); }
    else notify(res.error, "error");
  };

  const disableAccount = async (userId, name) => {
    if (!confirm(`Désactiver le compte de ${name} ?`)) return;
    const res = await call("disableAccount", { userId });
    if (res.success) { notify("Compte désactivé"); call("getData").then(d => setData(d)); }
    else notify(res.error, "error");
  };

  const extendAccount = async (userId, name) => {
    const res = await call("extendSubscription", { userId, months: 12 });
    if (res.success) { notify(`✅ ${name} prolongé de 12 mois`); call("getData").then(d => setData(d)); }
    else notify(res.error, "error");
  };

  // Stats
  const stats = data ? {
    totalUsers:   data.profiles?.length || 0,
    activeUsers:  data.subscriptions?.filter(s => s.status === "active").length || 0,
    trialUsers:   data.subscriptions?.filter(s => s.status === "trial").length || 0,
    expiredUsers: data.subscriptions?.filter(s => s.status === "expired").length || 0,
    totalKeys:    data.keys?.length || 0,
    usedKeys:     data.keys?.filter(k => k.used).length || 0,
    companies:    data.companies?.length || 0,
  } : {};

  const getSubForUser = (userId) => data?.subscriptions?.find(s => s.user_id === userId);

  const statusColor = (s) => {
    if (!s) return "#888";
    if (s.status === "active")  return "#00C48C";
    if (s.status === "trial")   return "#1A6AFF";
    if (s.status === "expired") return "#FF2D2D";
    return "#888";
  };
  const statusLabel = (s) => {
    if (!s) return "Aucun";
    if (s.status === "lifetime") return "♾️ Licence gratuite à vie";
    if (s.status === "active" && s.current_period_end && new Date(s.current_period_end) > new Date("2099-01-01")) return "♾️ Licence gratuite à vie";
    if (s.status === "active")  return `✅ Actif jusqu'au ${new Date(s.current_period_end).toLocaleDateString("fr-FR")}`;
    if (s.status === "trial")   return `🎁 Trial jusqu'au ${new Date(s.trial_ends_at).toLocaleDateString("fr-FR")}`;
    if (s.status === "expired") return "❌ Expiré";
    if (s.status === "cancelled") return "Annulé";
    return s.status;
  };

  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:20 }}>
        <h1 style={T(isMobile)}>🔐 Super Admin</h1>
        <p style={Sub}>Tableau de bord de gestion — accès exclusif</p>
      </div>

      {loading ? <div style={LT}>Chargement...</div> : (
        <>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10, marginBottom:20 }}>
            {[
              { label:"Utilisateurs", value:stats.totalUsers,  bg:"#E8E0D4", fg:"#1A1A1A" },
              { label:"Actifs",       value:stats.activeUsers,  bg:"#00C48C", fg:"#fff"    },
              { label:"En essai",     value:stats.trialUsers,   bg:"#1A6AFF", fg:"#fff"    },
              { label:"Expirés",      value:stats.expiredUsers, bg:"#FF2D2D", fg:"#fff"    },
            ].map(st => (
              <div key={st.label} style={{ background:st.bg, borderRadius:12, padding:14 }}>
                <div style={{ fontSize:26, fontWeight:700, color:st.fg }}>{st.value}</div>
                <div style={{ fontSize:10, color:"#FFFFFF", opacity:0.85, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5, marginTop:3 }}>{st.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
            {[["stats","📊 KPIs"],["keys","🔑 Générer KEYs"],["addlicences","➕ Ajouter licences"],["users","👥 Utilisateurs"],["allkeys","📋 Toutes les KEYs"]].map(([id,label]) => (
              <button key={id} style={{ padding:"8px 14px", border:`2px solid ${tab===id?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:tab===id?"#1A1A1A":"transparent", color:tab===id?"#E8E0D4":"#888", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
                onClick={()=>setTab(id)}>{label}</button>
            ))}
          </div>

          {/* ── KPIs SAAS ── */}
          {tab === "stats" && (() => {
            const now = new Date();
            const subs = data.subscriptions || [];
            const profiles = data.profiles || [];
            const keys = data.keys || [];
            const companies = data.companies || [];

            // ── Core metrics ──
            const totalUsers     = profiles.filter(p => p.email !== "fanne@lafitel.eu").length;
            const trialUsers     = subs.filter(s => s.status === "trial").length;
            const activeUsers    = subs.filter(s => s.status === "active").length;
            const lifetimeUsers  = subs.filter(s => s.status === "lifetime" || (s.current_period_end && new Date(s.current_period_end) > new Date("2099-01-01"))).length;
            const expiredUsers   = subs.filter(s => s.status === "expired").length;
            const cancelledUsers = subs.filter(s => s.status === "cancelled").length;

            // ── Conversion rate: trial → paid ──
            const totalTrialEver    = subs.filter(s => s.trial_ends_at).length;
            const convertedFromTrial = subs.filter(s => s.status === "active" && s.trial_ends_at).length;
            const conversionRate    = totalTrialEver > 0 ? Math.round((convertedFromTrial / totalTrialEver) * 100) : 0;
            const churnRate         = totalTrialEver > 0 ? Math.round((expiredUsers / totalTrialEver) * 100) : 0;

            // ── MRR / ARR ──
            const mrr = activeUsers * 4.99;
            const arr = activeUsers * 59.88;

            // ── Keys metrics ──
            const totalKeys     = keys.length;
            const usedKeys      = keys.filter(k => k.used).length;
            const unusedKeys    = totalKeys - usedKeys;
            const expiredKeys   = keys.filter(k => !k.used && new Date(k.expires_at) < now).length;
            const keyActivationRate = totalKeys > 0 ? Math.round((usedKeys / totalKeys) * 100) : 0;

            // ── Companies ──
            const totalCompanies = companies.length;
            const avgLicencesPerCompany = totalCompanies > 0
              ? (companies.reduce((sum, c) => sum + (c.licence_count || 1), 0) / totalCompanies).toFixed(1)
              : 0;

            // ── Trial expiring soon (next 7 days) ──
            const expiringSoon = subs.filter(s => {
              if (s.status !== "trial") return false;
              const end = new Date(s.trial_ends_at);
              const diff = (end - now) / (1000*60*60*24);
              return diff >= 0 && diff <= 7;
            }).length;

            // ── Monthly signups (last 6 months) ──
            const monthlyData = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const month = d.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" });
              const count = subs.filter(s => {
                const created = new Date(s.created_at);
                return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
              }).length;
              monthlyData.push({ month, count });
            }

            const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1);

            return (
              <div>
                {/* ── Hero KPIs ── */}
                <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                  {[
                    { label:"MRR", value:`${mrr.toFixed(0)}€`, sub:"Revenus mensuels", bg:"#FF4C1A", fg:"#fff" },
                    { label:"ARR", value:`${arr.toFixed(0)}€`, sub:"Revenus annuels", bg:"#1A1A1A", fg:"#E8E0D4" },
                    { label:"Actifs", value:activeUsers, sub:"Licences payantes", bg:"#00C48C", fg:"#fff" },
                    { label:"Essais", value:trialUsers, sub:`${expiringSoon} expirent sous 7j`, bg:"#1A6AFF", fg:"#fff" },
                  ].map(k => (
                    <div key={k.label} style={{ background:k.bg, borderRadius:12, padding:16 }}>
                      <div style={{ fontSize:10, color:k.fg, opacity:0.7, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:1 }}>{k.label}</div>
                      <div style={{ fontSize:28, fontWeight:700, color:k.fg, lineHeight:1.1, margin:"4px 0 2px" }}>{k.value}</div>
                      <div style={{ fontSize:11, color:k.fg, opacity:0.7, fontFamily:"'Helvetica Neue',sans-serif" }}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── Conversion & Churn ── */}
                <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10, marginBottom:16 }}>
                  <div style={{ ...C }}>
                    <h3 style={CT}>Taux de conversion</h3>
                    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                      <div style={{ width:80, height:80, borderRadius:"50%", background:`conic-gradient(#00C48C ${conversionRate*3.6}deg, #F0EBE0 0deg)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                        <div style={{ width:56, height:56, borderRadius:"50%", background:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontSize:16, fontWeight:700, color:"#1A1A1A" }}>{conversionRate}%</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:13, color:"#444", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:6 }}>
                          <span style={{ color:"#00C48C", fontWeight:700 }}>{convertedFromTrial}</span> convertis sur <strong>{totalTrialEver}</strong> essais
                        </div>
                        <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>
                          Taux de churn : <span style={{ color:"#FF2D2D", fontWeight:700 }}>{churnRate}%</span>
                        </div>
                        <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>
                          Expirés sans achat : <strong>{expiredUsers}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ ...C }}>
                    <h3 style={CT}>État des licences</h3>
                    {[
                      { label:"Actives (payantes)", value:activeUsers, color:"#00C48C" },
                      { label:"En essai", value:trialUsers, color:"#1A6AFF" },
                      { label:"À vie (offertes)", value:lifetimeUsers, color:"#FF4C1A" },
                      { label:"Expirées", value:expiredUsers, color:"#FF2D2D" },
                      { label:"Annulées", value:cancelledUsers, color:"#888" },
                    ].map(item => (
                      <div key={item.label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:item.color, flexShrink:0 }} />
                        <div style={{ flex:1, fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>{item.label}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1A1A1A" }}>{item.value}</div>
                        <div style={{ width:60, height:6, background:"#F0EBE0", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${totalUsers>0?(item.value/totalUsers)*100:0}%`, background:item.color, borderRadius:3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Inscriptions mensuelles ── */}
                <div style={{ ...C, marginBottom:16 }}>
                  <h3 style={CT}>Nouvelles inscriptions — 6 derniers mois</h3>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:100, paddingTop:10 }}>
                    {monthlyData.map((m, i) => (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#444", fontFamily:"'Helvetica Neue',sans-serif" }}>{m.count}</div>
                        <div style={{ width:"100%", height:`${Math.round((m.count/maxMonthly)*70)+10}px`, background: i===5?"#FF4C1A":"#E8E0D4", borderRadius:"4px 4px 0 0", transition:"height 0.3s" }} />
                        <div style={{ fontSize:10, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", textAlign:"center" }}>{m.month}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Clés & Entreprises ── */}
                <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10, marginBottom:16 }}>
                  <div style={{ ...C }}>
                    <h3 style={CT}>Clés d'activation</h3>
                    {[
                      { label:"Total générées", value:totalKeys, color:"#1A1A1A" },
                      { label:"Utilisées", value:usedKeys, color:"#00C48C" },
                      { label:"Disponibles", value:unusedKeys, color:"#1A6AFF" },
                      { label:"Expirées (inutilisées)", value:expiredKeys, color:"#FF2D2D" },
                    ].map(item => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #F0EBE0" }}>
                        <span style={{ fontSize:12, color:"#666", fontFamily:"'Helvetica Neue',sans-serif" }}>{item.label}</span>
                        <span style={{ fontSize:15, fontWeight:700, color:item.color }}>{item.value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:10, fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>
                      Taux d'activation : <strong style={{ color:"#FF4C1A" }}>{keyActivationRate}%</strong>
                    </div>
                  </div>

                  <div style={{ ...C }}>
                    <h3 style={CT}>Entreprises</h3>
                    {[
                      { label:"Total entreprises", value:totalCompanies, color:"#1A1A1A" },
                      { label:"Licences moy. / entreprise", value:avgLicencesPerCompany, color:"#FF4C1A" },
                      { label:"Utilisateurs totaux", value:totalUsers, color:"#1A6AFF" },
                      { label:"Essais expirant sous 7j", value:expiringSoon, color: expiringSoon>0?"#FF9500":"#00C48C" },
                    ].map(item => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #F0EBE0" }}>
                        <span style={{ fontSize:12, color:"#666", fontFamily:"'Helvetica Neue',sans-serif" }}>{item.label}</span>
                        <span style={{ fontSize:15, fontWeight:700, color:item.color }}>{item.value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:10, fontSize:12, color:"#888", fontFamily:"'Helvetice Neue',sans-serif" }}>
                      LTV estimée : <strong style={{ color:"#FF4C1A" }}>{(activeUsers * 59.88 * 2).toFixed(0)}€</strong>
                      <span style={{ fontSize:10, color:"#aaa" }}> (base 2 ans)</span>
                    </div>
                  </div>
                </div>

                {/* ── Alerte essais expirant bientôt ── */}
                {expiringSoon > 0 && (
                  <div style={{ background:"#FFF8F0", border:"2px solid #FF9500", borderRadius:12, padding:14, marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#FF9500", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:8 }}>
                      ⏳ {expiringSoon} essai{expiringSoon>1?"s":""} expirent dans les 7 prochains jours
                    </div>
                    {subs.filter(s => {
                      if (s.status !== "trial") return false;
                      const end = new Date(s.trial_ends_at);
                      const diff = (end - now) / (1000*60*60*24);
                      return diff >= 0 && diff <= 7;
                    }).map(s => {
                      const p = profiles.find(p => p.id === s.user_id);
                      const daysLeft = Math.ceil((new Date(s.trial_ends_at) - now) / (1000*60*60*24));
                      return (
                        <div key={s.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #FFE0B0" }}>
                          <span style={{ fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>
                            {p?.full_name || p?.email || "—"}
                          </span>
                          <span style={{ fontSize:11, fontWeight:700, color: daysLeft<=1?"#FF2D2D":"#FF9500", fontFamily:"'Helvetica Neue',sans-serif" }}>
                            J-{daysLeft}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── GÉNÉRER DES KEYS ── */}
          {tab === "keys" && (
            <div style={C}>
              <h3 style={CT}>Générer des clés d'activation</h3>
              <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label style={L}>{t("total",lang)}</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <button style={{ width:36, height:36, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:18, fontWeight:700, color:"#1A1A1A" }}
                      onClick={()=>setGenQty(q=>Math.max(1,q-1))}>−</button>
                    <input style={{ ...I, width:70, textAlign:"center", padding:"8px" }}
                      type="number" min="1" max="100"
                      value={genQty}
                      onChange={e=>{ const v=parseInt(e.target.value); if(!isNaN(v)&&v>=1) setGenQty(v); else if(e.target.value==="") setGenQty(""); }}
                      onBlur={e=>{ if(!e.target.value||parseInt(e.target.value)<1) setGenQty(1); }} />
                    <button style={{ width:36, height:36, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:18, fontWeight:700, color:"#1A1A1A" }}
                      onClick={()=>setGenQty(q=>Math.min(100,parseInt(q)||1)+1)}>+</button>
                  </div>
                  {genQty > 1 && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", marginTop:2 }}>
                    → 1 clé Manager + {parseInt(genQty)-1} clé(s) Commercial
                  </div>}
                </div>
                <div>
                  <label style={L}>{parseInt(genQty) > 1 ? "Email du Manager" : "Email client (optionnel)"}</label>
                  <input style={I} placeholder="manager@entreprise.fr" value={genEmail} onChange={e=>setGenEmail(e.target.value)} />
                  {parseInt(genQty) > 1 && <div style={{ fontSize:10, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>
                    Cet email recevra la clé Manager pour administrer les commerciaux
                  </div>}
                </div>
                {parseInt(genQty) > 1 && (
                  <div>
                    <label style={L}>{t("company",lang)}</label>
                    <input style={I} placeholder="Acme Corp" value={genCompany} onChange={e=>setGenCompany(e.target.value)} />
                  </div>
                )}
                <div>
                  <label style={L}>Type</label>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {[
                      { val:"annual", label:"💳 Payante (12 mois)", color:"#1A1A1A", textColor:"#E8E0D4" },
                      { val:"trial7", label:"🎁 Essai 7 jours",     color:"#1A6AFF", textColor:"#fff"    },
                      { val:"trial14",label:"🎁 Essai 14 jours",    color:"#00C48C", textColor:"#fff"    },
                    ].map(opt => (
                      <button key={opt.val}
                        style={{ flex:1, minWidth:100, padding:"10px 8px", border:`2px solid ${genTrial===opt.val?opt.color:"#E8E0D4"}`, borderRadius:8, background:genTrial===opt.val?opt.color:"transparent", color:genTrial===opt.val?opt.textColor:"#888", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
                        onClick={()=>setGenTrial(opt.val)}>{opt.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={L}>Notes</label>
                  <input style={I} placeholder="Ex: Offre salon..." value={genNotes} onChange={e=>setGenNotes(e.target.value)} />
                </div>
              </div>

              <div style={{ padding:14, background: genTrial?"#EBF0FF":"#F5F0E8", borderRadius:10, marginBottom:14 }}>
                <div style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>
                  {genTrial !== "annual"
                    ? <span>🎁 <strong>Clé(s) d'essai gratuit {genTrial === "trial7" ? "7" : "14"} jours</strong> — aucune facturation</span>
                    : <span>💶 Total : <strong>{(parseInt(genQty||1) * 59.88).toFixed(2)}€</strong> HT · {parseInt(genQty||1)} × 59,88€/licence/an</span>
                  }
                </div>
              </div>

              <button style={{ ...BP, width:"100%" }} onClick={generateKeys} disabled={genLoading}>
                {genLoading ? "Génération..." : `🔑 Générer ${genQty} clé${genQty>1?"s":""}`}
              </button>

              {newKeys.length > 0 && (
                <div style={{ marginTop:16, background:"#EBF8F4", borderRadius:10, padding:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#00C48C", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:10 }}>
                    ✅ {newKeys.length} clé(s) générée(s) — copiez et envoyez au client
                  </div>
                  {newKeys.map((k, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #C8EFE5" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Courier New',monospace", fontSize:14, fontWeight:700, color:"#1A1A1A", letterSpacing:1 }}>{k.key}</div>
                        <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{k.type}</div>
                      </div>
                      <button style={{ padding:"5px 10px", background:"#1A1A1A", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif" }}
                        onClick={()=>{ navigator.clipboard.writeText(k.key); notify("Clé copiée !"); }}>
                        Copier
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── UTILISATEURS ── */}
          {tab === "users" && (
            <div style={C}>
              <h3 style={CT}>{data.profiles?.length} utilisateurs</h3>
              {data.profiles?.filter(p => p.email !== "fanne@lafitel.eu").map(p => {
                const sub = getSubForUser(p.id);
                return (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 0", borderBottom:"1px solid #F0EBE0" }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background: p.role==="manager"?"#FF4C1A":"#1A1A1A", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, fontFamily:"'Helvetica Neue',sans-serif", flexShrink:0 }}>
                      {(p.full_name||p.email)[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, fontFamily:"'Helvetica Neue',sans-serif", color:"#1A1A1A" }}>{p.full_name||"—"}</div>
                      <div style={{ fontSize:11, color:"#CCCCCC", fontFamily:"'Helvetica Neue',sans-serif" }}>{p.email} · {p.role}</div>
                      <div style={{ fontSize:11, color:statusColor(sub), fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}>{statusLabel(sub)}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      <button style={{ padding:"4px 8px", background:"#00C48C", color:"#fff", border:"none", borderRadius:5, cursor:"pointer", fontSize:10, fontFamily:"'Helvetica Neue',sans-serif" }}
                        onClick={()=>extendAccount(p.id, p.full_name||p.email)}>+12 mois</button>
                      <button style={{ padding:"4px 8px", background:"#FF9500", color:"#fff", border:"none", borderRadius:5, cursor:"pointer", fontSize:10, fontFamily:"'Helvetica Neue',sans-serif" }}
                        onClick={()=>grantLifetime(p.id, p.full_name||p.email)}>♾️ À vie</button>
                      <button style={{ padding:"4px 8px", background:"#FF2D2D", color:"#fff", border:"none", borderRadius:5, cursor:"pointer", fontSize:10, fontFamily:"'Helvetica Neue',sans-serif" }}
                        onClick={()=>disableAccount(p.id, p.full_name||p.email)}>Désactiver</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── AJOUTER LICENCES À UNE ENTREPRISE EXISTANTE ── */}
          {tab === "addlicences" && (
            <div style={C}>
              <h3 style={CT}>Ajouter des licences à une entreprise existante</h3>

              {data.companies?.length === 0 ? (
                <div style={{ color:"#888", fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, textAlign:"center", padding:20 }}>
                  Aucune entreprise enregistrée. Générez d'abord un pack multi-licences.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label style={L}>{t("company",lang)}</label>
                    <select value={addCompanyId} onChange={e=>setAddCompanyId(e.target.value)}
                      style={{ ...I, cursor:"pointer" }}>
                      <option value="">-- Sélectionner une entreprise --</option>
                      {data.companies?.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.email}) — {c.licence_count} licence(s)
                        </option>
                      ))}
                    </select>
                    {addCompanyId && (() => {
                      const co = data.companies?.find(c => c.id === addCompanyId);
                      const coKeys = data.keys?.filter(k => k.company_id === addCompanyId);
                      const used = coKeys?.filter(k => k.used).length || 0;
                      const total = coKeys?.length || 0;
                      return (
                        <div style={{ marginTop:8, padding:"10px 12px", background:"#F5F0E8", borderRadius:8, fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>
                          📊 {total} licence(s) existante(s) · {used} utilisée(s) · {total - used} disponible(s)
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                    <div>
                      <label style={L}>{t("total",lang)}</label>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <button style={{ width:36, height:36, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:18, fontWeight:700 }}
                          onClick={()=>setAddQty(q=>Math.max(1,q-1))}>−</button>
                        <input style={{ ...I, width:70, textAlign:"center", padding:"8px" }} type="number" min="1" max="100"
                          value={addQty} onChange={e=>{ const v=parseInt(e.target.value); if(!isNaN(v)&&v>=1) setAddQty(v); }} />
                        <button style={{ width:36, height:36, border:"2px solid #E8E0D4", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:18, fontWeight:700 }}
                          onClick={()=>setAddQty(q=>Math.min(100,q+1))}>+</button>
                      </div>
                      <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>
                        → {addQty} clé(s) Commercial ajoutée(s) au même batch
                      </div>
                    </div>
                    <div>
                      <label style={L}>Type</label>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {[
                          { val:"annual",  label:"💳 12 mois", color:"#1A1A1A", tc:"#E8E0D4" },
                          { val:"trial7",  label:"🎁 7 jours",  color:"#1A6AFF", tc:"#fff"    },
                          { val:"trial14", label:"🎁 14 jours", color:"#00C48C", tc:"#fff"    },
                        ].map(opt => (
                          <button key={opt.val}
                            style={{ flex:1, padding:"8px 6px", border:`2px solid ${addTrial===opt.val?opt.color:"#E8E0D4"}`, borderRadius:8, background:addTrial===opt.val?opt.color:"transparent", color:addTrial===opt.val?opt.tc:"#888", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
                            onClick={()=>setAddTrial(opt.val)}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom:14 }}>
                    <label style={L}>Notes</label>
                    <input style={I} placeholder="Ex: Extension contrat mars 2026..." value={addNotes} onChange={e=>setAddNotes(e.target.value)} />
                  </div>

                  <div style={{ padding:12, background:addTrial!=="annual"?"#EBF0FF":"#F5F0E8", borderRadius:10, marginBottom:14, fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }}>
                    {addTrial !== "annual"
                      ? <span>🎁 <strong>{addQty} clé(s) d'essai</strong> — aucune facturation</span>
                      : <span>💶 <strong>{(addQty * 59.88).toFixed(2)}€ HT</strong> · {addQty} × 59,88€/an</span>
                    }
                  </div>

                  <button style={{ ...BP, width:"100%" }} onClick={addLicences} disabled={addLoading||!addCompanyId}>
                    {addLoading ? "Génération..." : `➕ Ajouter ${addQty} licence${addQty>1?"s":""}`}
                  </button>

                  {addedKeys.length > 0 && (
                    <div style={{ marginTop:16, background:"#EBF8F4", borderRadius:10, padding:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#00C48C", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:10 }}>
                        ✅ {addedKeys.length} clé(s) ajoutée(s) — à envoyer au client
                      </div>
                      {addedKeys.map((k, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #C8EFE5" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:"'Courier New',monospace", fontSize:14, fontWeight:700, color:"#1A1A1A", letterSpacing:1 }}>{k.key}</div>
                            <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{k.type}</div>
                          </div>
                          <button style={{ padding:"5px 10px", background:"#1A1A1A", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:11 }}
                            onClick={()=>{ navigator.clipboard.writeText(k.key); notify("Clé copiée !"); }}>Copier</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TOUTES LES KEYS ── */}
          {tab === "allkeys" && (
            <div style={C}>
              <h3 style={CT}>{data.keys?.length} clés · {stats.usedKeys} utilisées</h3>
              {data.keys?.map(k => (
                <div key={k.id} style={{ padding:"10px 0", borderBottom:"1px solid #F0EBE0" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontFamily:"'Courier New',monospace", fontSize:13, fontWeight:700, color: k.used ? "#aaa" : "#1A1A1A", flex:1, letterSpacing:1, textDecoration: k.used?"line-through":"none" }}>{k.key}</div>
                    <div style={{ fontSize:10, padding:"2px 7px", borderRadius:10, background: k.used?"#F0EBE0":"#EBF8F4", color: k.used?"#888":"#00875A", fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}>
                      {k.used?"Utilisée":"Disponible"}
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:"#BBBBBB", fontFamily:"'Helvetica Neue',sans-serif", marginTop:3 }}>
                    {k.key_type} · {k.email||"—"} · expire {new Date(k.expires_at).toLocaleDateString("fr-FR")}
                    {k.notes && ` · ${k.notes}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExpiredWall({ profile, subscription, isMobile, onActivate }) {
  const [key, setKey]         = useState("");
  const [loading, setLoading] = useState(false);
  const [notify, setNotify]   = useState(null);

  const showNotif = (msg, type="ok") => {
    setNotify({ msg, type });
    setTimeout(() => setNotify(null), 4000);
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile.email, userId: profile.id, quantity: 1 }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else showNotif("Erreur : " + data.error, "error");
    } catch(err) { showNotif("Erreur : " + err.message, "error"); }
    setLoading(false);
  };

  const activate = async () => {
    if (!key.trim()) { showNotif(t("activate_key",lang), "error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/activate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase(), userId: profile.id, email: profile.email }),
      });
      const data = await res.json();
      if (data.success) { showNotif("✅ " + data.message); setTimeout(() => onActivate(), 1500); }
      else showNotif(data.error || t("error",lang), "error");
    } catch(err) { showNotif("Erreur : " + err.message, "error"); }
    setLoading(false);
  };

  const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const isExpired = subscription?.status === "expired" || subscription?.status === "cancelled";

  return (
    <div style={{ minHeight:"100vh", background:"#1A1A1A", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      {notify && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background: notify.type==="error"?"#FF2D2D":"#00C48C", color:"#fff", padding:"12px 20px", borderRadius:10, fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
          {notify.msg}
        </div>
      )}
      <div style={{ background:"#242424", borderRadius:20, padding:isMobile?24:40, maxWidth:480, width:"100%", textAlign:"center" }}>
        {/* Logo */}
        <div style={{ fontSize:44, color:"#FF4C1A", marginBottom:8 }}>◈</div>
        <div style={{ fontSize:28, fontWeight:700, color:"#E8E0D4", fontFamily:"'Helvetica Neue',sans-serif", letterSpacing:2, marginBottom:8 }}>PROSPEO</div>

        {/* Message */}
        <div style={{ background:"#FF2D2D", borderRadius:10, padding:"12px 16px", marginBottom:24 }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#fff", fontFamily:"'Helvetica Neue',sans-serif" }}>
            {isExpired ? "⏰ Période d'essai expirée" : "🔒 Accès suspendu"}
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>
            {trialEnd ? `Essai terminé le ${trialEnd.toLocaleDateString("fr-FR")}` : "Votre abonnement n'est plus actif"}
          </div>
        </div>

        <p style={{ fontSize:14, color:"#CCCCCC", fontFamily:"'Helvetica Neue',sans-serif", lineHeight:1.6, margin:"0 0 28px" }}>
          Vos données sont conservées. Abonnez-vous pour retrouver un accès complet à Prospeo.
        </p>

        {/* Prix */}
        <div style={{ background:"#1A1A1A", borderRadius:12, padding:16, marginBottom:24 }}>
          <div style={{ fontSize:36, fontWeight:700, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>4,99€ <span style={{ fontSize:16, color:"#888" }}>HT/mois</span></div>
          <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginTop:4 }}>Facturé 59,88€ HT/an · Engagement 12 mois</div>
        </div>

        {/* Bouton paiement */}
        <button style={{ width:"100%", padding:"14px", background:"#FF4C1A", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontSize:15, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:700, marginBottom:16 }}
          onClick={subscribe} disabled={loading}>
          {loading ? t("loading",lang) : t("subscribe",lang)}
        </button>

        {/* Séparateur */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <div style={{ flex:1, height:1, background:"#333" }} />
          <span style={{ fontSize:12, color:"#555", fontFamily:"'Helvetica Neue',sans-serif" }}>ou</span>
          <div style={{ flex:1, height:1, background:"#333" }} />
        </div>

        {/* Activer une clé */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", marginBottom:8 }}>Vous avez une clé d'activation ?</div>
          <div style={{ display:"flex", gap:8 }}>
            <input
              style={{ flex:1, padding:"10px 12px", border:"1.5px solid #333", borderRadius:8, background:"#1A1A1A", fontSize:13, fontFamily:"'Courier New',monospace", color:"#E8E0D4", outline:"none", textTransform:"uppercase", letterSpacing:1 }}
              placeholder="PROS-XXXX-XXXX-XXXX"
              value={key}
              onChange={e=>setKey(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&activate()}
            />
            <button style={{ padding:"10px 14px", background:"#333", color:"#E8E0D4", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }}
              onClick={activate} disabled={loading}>
              🔑
            </button>
          </div>
        </div>

        <div style={{ fontSize:11, color:"#555", fontFamily:"'Helvetica Neue',sans-serif", marginTop:16 }}>
          Connecté en tant que {profile?.email}
          <span style={{ margin:"0 8px" }}>·</span>
          <span style={{ cursor:"pointer", color:"#888", textDecoration:"underline" }} onClick={()=>supabase.auth.signOut()}>Se déconnecter</span>
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#F5F0E8" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:38, color:"#FF4C1A", marginBottom:10 }}>◈</div>
        <div style={{ fontFamily:"'Helvetica Neue',sans-serif", color:"#888", fontSize:13 }}>Chargement...</div>
      </div>
    </div>
  );
}

const P  = (m) => ({ padding: m ? "18px 16px 22px" : "36px 44px", maxWidth: 1100 });
const T  = (m) => ({ fontSize: m ? 24 : 32, fontWeight: 400, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: -0.5, fontFamily: "Georgia,serif" });
const Sub = { fontSize: 12, color: "#888", margin: 0, fontFamily: "'Helvetica Neue',sans-serif" };
const C  = { background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" };
const CT = { fontSize: 10, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 2, textTransform: "uppercase", color: "#888", margin: "0 0 14px", fontWeight: 600 };
const AV = { width: 40, height: 40, borderRadius: "50%", background: "#1A1A1A", color: "#E8E0D4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "'Helvetica Neue',sans-serif", flexShrink: 0 };
const SB = { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, fontFamily: "'Helvetica Neue',sans-serif", letterSpacing: 0.5, textTransform: "uppercase" };
const L  = { fontSize: 11, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#666", display: "block", marginBottom: 5 };
const I  = { width: "100%", padding: "11px 13px", border: "2px solid #E8E0D4", borderRadius: 10, background: "#fff", fontSize: 15, fontFamily: "'Helvetica Neue',sans-serif", color: "#1A1A1A", outline: "none", boxSizing: "border-box" };
const BP = { padding: "12px 18px", background: "#1A1A1A", color: "#E8E0D4", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", fontWeight: 600, textAlign: "center" };
const BS = { padding: "12px 18px", background: "transparent", color: "#666", border: "2px solid #E8E0D4", borderRadius: 10, cursor: "pointer", fontSize: 14, fontFamily: "'Helvetica Neue',sans-serif", textAlign: "center" };
const LT = { padding: 28, textAlign: "center", color: "#aaa", fontFamily: "'Helvetica Neue',sans-serif" };
