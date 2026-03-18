import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

const STATUS_COLORS = {
  chaud:    { bg: "#FF4C1A", text: "#fff", label: "Chaud"    },
  "tiède":  { bg: "#FF9500", text: "#fff", label: "Tiède"    },
  froid:    { bg: "#1A6AFF", text: "#fff", label: "Froid"    },
  converti: { bg: "#00C48C", text: "#fff", label: "Converti" },
};
const SOURCE_ICONS = { carte: "📇", manuel: "✏️", vocal: "🎙️" };
const PERIODS = [
  { id: "today",     label: "Aujourd'hui"   },
  { id: "yesterday", label: "Hier"          },
  { id: "week",      label: "Cette semaine" },
  { id: "month",     label: "Ce mois"       },
  { id: "custom",    label: "Période libre" },
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

function hasSpeechRecognition() {
  return !isIOS() && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
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
  const data = await res.json();
  if (data.error) throw new Error(data.error);
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
  if (!session) return <AuthPage />;
  return <ProspeoApp profile={profile} onSignOut={() => supabase.auth.signOut()} />;
}

function AuthPage() {
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
        <h2 style={{ fontSize:22, fontWeight:400, color:"#1A1A1A", margin:"0 0 24px", fontFamily:"Georgia,serif" }}>{mode === "login" ? "Connexion" : "Créer un compte"}</h2>
        {mode === "register" && <div style={{ marginBottom:14 }}><label style={L}>Nom complet</label><input style={I} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)} /></div>}
        <div style={{ marginBottom:14 }}><label style={L}>Email</label><input style={I} type="email" placeholder="jean@entreprise.fr" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div style={{ marginBottom:14 }}><label style={L}>Mot de passe</label><input style={I} type="password" placeholder="••••••••" value={password} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} /></div>
        {error && <div style={{ padding:"10px 14px", borderRadius:8, background:error.startsWith("✅")?"#EBF8F4":"#FFF0F0", color:error.startsWith("✅")?"#00875A":"#FF2D2D", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", marginBottom:14 }}>{error}</div>}
        <button style={{ width:"100%", padding:"14px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:10, cursor:"pointer", fontSize:15, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }} onClick={submit} disabled={busy}>{busy?"Chargement...":mode==="login"?"Se connecter":"Créer le compte"}</button>
        <button style={{ display:"block", marginTop:14, border:"none", background:"none", color:"#888", cursor:"pointer", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", width:"100%", textAlign:"center", padding:"8px" }} onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}>
          {mode==="login"?"Pas encore de compte ? S'inscrire":"Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

function ProspeoApp({ profile, onSignOut }) {
  const [contacts, setContacts]       = useState([]);
  const [view, setView]               = useState("dashboard");
  const [selected, setSelected]       = useState(null);
  const [notif, setNotif]             = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const isMobile = useIsMobile();

  const notify = (msg, type="success") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); };

  const loadContacts = useCallback(async () => {
    setLoadingData(true);
    let q = supabase.from("contacts").select("*, profiles(full_name,email)").order("created_at",{ascending:false});
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
    notify("Statut mis à jour !");
  };

  const stats = {
    total:    contacts.length,
    chaud:    contacts.filter(c=>c.status==="chaud").length,
    converti: contacts.filter(c=>c.status==="converti").length,
    thisWeek: contacts.filter(c=>(new Date()-new Date(c.created_at))/86400000<=7).length,
  };

  const NAV = [
    { id:"dashboard", icon:"▦", label:"Accueil"   },
    { id:"add",       icon:"＋", label:"Ajouter"   },
    { id:"list",      icon:"≡", label:"Prospects"  },
    { id:"report",    icon:"◉", label:"Rapports"   },
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
              <div style={{ fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#E8E0D4", fontWeight:600, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{profile?.full_name||profile?.email}</div>
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
            <button style={{ width:"100%", padding:"8px 0", background:"transparent", border:"1px solid #333", borderRadius:6, color:"#666", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif" }} onClick={onSignOut}>Déconnexion</button>
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
            <span style={{ fontSize:11, color:profile?.role==="manager"?"#FF4C1A":"#888", fontFamily:"'Helvetica Neue',sans-serif" }}>{profile?.role==="manager"?"👑 ":""}{profile?.full_name?.split(" ")[0]}</span>
            <button style={{ background:"transparent", border:"none", color:"#888", cursor:"pointer", fontSize:18, padding:"4px 6px" }} onClick={onSignOut}>⎋</button>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{ flex:1, overflow:"auto", paddingTop:isMobile?54:0, paddingBottom:isMobile?68:0 }}>
        {view==="dashboard" && <DashboardView contacts={contacts} stats={stats} loadingData={loadingData} profile={profile} isMobile={isMobile} go={go} onSelect={c=>{setSelected(c);setView("detail");}} />}
        {view==="add"       && <AddView profile={profile} isMobile={isMobile} notify={notify} onAdded={()=>{loadContacts();setView("list");}} />}
        {view==="list"      && <ListView contacts={contacts} profile={profile} loadingData={loadingData} isMobile={isMobile} onSelect={c=>{setSelected(c);setView("detail");}} onAdd={()=>go("add")} />}
        {view==="detail" && selected && <DetailView contact={selected} profile={profile} isMobile={isMobile} onBack={()=>setView("list")} onStatusUpdate={handleStatusUpdate} onDelete={handleDelete} notify={notify} />}
        {view==="report"    && <ReportView contacts={contacts} profile={profile} isMobile={isMobile} notify={notify} />}
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

function DashboardView({ contacts, stats, loadingData, profile, isMobile, go, onSelect }) {
  return (
    <div style={P(isMobile)}>
      <div style={{ marginBottom:22 }}>
        <h1 style={T(isMobile)}>Tableau de bord</h1>
        <p style={Sub}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:12, marginBottom:22 }}>
        {[{label:"Total",value:stats.total,bg:"#E8E0D4",fg:"#1A1A1A"},{label:"Chauds",value:stats.chaud,bg:"#FF4C1A",fg:"#fff"},{label:"Convertis",value:stats.converti,bg:"#00C48C",fg:"#fff"},{label:"Semaine",value:stats.thisWeek,bg:"#1A1A1A",fg:"#E8E0D4"}].map(st=>(
          <div key={st.label} style={{ background:st.bg, borderRadius:14, padding:isMobile?"15px":"20px" }}>
            <div style={{ fontSize:isMobile?30:36, fontWeight:700, color:st.fg, lineHeight:1 }}>{st.value}</div>
            <div style={{ fontSize:10, color:st.fg, opacity:0.7, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5, marginTop:4 }}>{st.label}</div>
          </div>
        ))}
      </div>
      <div style={C}>
        <h3 style={CT}>Derniers prospects</h3>
        {loadingData ? <div style={LT}>Chargement...</div> :
          contacts.slice(0,5).map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:"1px solid #F0EBE0", cursor:"pointer" }} onClick={()=>onSelect(c)}>
              <div style={AV}>{c.first_name[0]}{c.last_name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.company||c.role}</div>
              </div>
              <div style={{ ...SB, background:STATUS_COLORS[c.status]?.bg, color:STATUS_COLORS[c.status]?.text, flexShrink:0 }}>{STATUS_COLORS[c.status]?.label}</div>
            </div>
          ))
        }
      </div>
      <div style={{ ...C, marginTop:14 }}>
        <h3 style={CT}>Actions rapides</h3>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[{icon:"✏️",label:"Saisie manuelle",to:"add"},{icon:"📇",label:"Scanner carte",to:"add"},{icon:"📊",label:"Export Excel",to:"report"},{icon:"◉",label:"Rapports",to:"report"}].map(q=>(
            <button key={q.label} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:isMobile?13:15, border:"2px solid #F0EBE0", borderRadius:12, background:"#F5F0E8", cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", color:"#444" }} onClick={()=>go(q.to)}>
              <span style={{ fontSize:22 }}>{q.icon}</span><span>{q.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddView({ profile, isMobile, notify, onAdded }) {
  const [form, setForm] = useState({ first_name:"", last_name:"", company:"", role:"", email:"", phone:"", source:"manuel", notes:"", status:"froid" });
  const [analyzing, setAnalyzing] = useState(false);
  const [rec, setRec]             = useState(false);
  const [recF, setRecF]           = useState(null);
  const fileRef = useRef(null);
  const recRef  = useRef(null);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const submit = async () => {
    if (!form.first_name||!form.last_name) { notify("Prénom et nom requis","error"); return; }
    const { error } = await supabase.from("contacts").insert({...form, user_id:profile.id});
    if (error) { notify("Erreur enregistrement","error"); return; }
    notify(`✅ ${form.first_name} ${form.last_name} ajouté !`);
    setForm({ first_name:"", last_name:"", company:"", role:"", email:"", phone:"", source:"manuel", notes:"", status:"froid" });
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
      } catch { notify("Erreur IA","error"); }
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  const inputRefs = useRef({});

  const startVoice = (field) => {
    if (isIOS()) {
      const inputEl = inputRefs.current[field];
      if (inputEl) {
        inputEl.focus();
        notify("🎙️ Appuyez sur le micro de votre clavier iOS");
      }
      return;
    }
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { notify("Vocal non supporté sur cet appareil","error"); return; }
    const r = new SR(); r.lang="fr-FR"; r.interimResults=false;
    r.onresult = e => { const t=e.results[0][0].transcript; f(field, form[field]?form[field]+" "+t:t); setRec(false); setRecF(null); notify(`🎙️ "${t}"`); };
    r.onerror = ()=>{ setRec(false); setRecF(null); notify("Erreur micro","error"); };
    r.onend   = ()=>{ setRec(false); setRecF(null); };
    recRef.current=r; r.start(); setRec(true); setRecF(field);
  };
  const stopVoice = () => { recRef.current?.stop(); setRec(false); setRecF(null); };

  const FIELDS = [
    { k:"first_name", l:"Prénom *",   ph:"Jean"                 },
    { k:"last_name",  l:"Nom *",      ph:"Dupont"               },
    { k:"company",    l:"Entreprise", ph:"Acme Corp"            },
    { k:"role",       l:"Poste",      ph:"Directeur Commercial" },
    { k:"email",      l:"Email",      ph:"jean@acme.fr"         },
    { k:"phone",      l:"Téléphone",  ph:"+33 6 00 00 00 00"    },
  ];

  return (
    <div style={P(isMobile)}>
      <h1 style={T(isMobile)}>Nouveau prospect</h1>
      <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
        {[{id:"manuel",icon:"✏️",label:"Manuel"},{id:"carte",icon:"📇",label:"Carte IA"},{id:"vocal",icon:"🎙️",label:"Vocal"}].map(src=>(
          <button key={src.id} style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"9px 13px":"10px 18px", border:`2px solid ${form.source===src.id?"#1A1A1A":"#E8E0D4"}`, borderRadius:30, background:form.source===src.id?"#1A1A1A":"transparent", color:form.source===src.id?"#E8E0D4":"#888", cursor:"pointer", fontSize:13, fontFamily:"'Helvetica Neue',sans-serif" }}
            onClick={()=>{ f("source",src.id); if(src.id==="carte") fileRef.current?.click(); }}>
            <span>{src.icon}</span><span>{src.label}</span>
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={scanCard} />
      {analyzing && <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 18px", background:"#FFF8F4", border:"2px solid #FF4C1A", borderRadius:10, marginBottom:18, fontFamily:"'Helvetica Neue',sans-serif", fontSize:13, color:"#FF4C1A" }}><div style={{ width:16, height:16, border:"3px solid #FFD4C4", borderTopColor:"#FF4C1A", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} /><span>Analyse IA...</span></div>}

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
        <label style={L}>Notes</label>
        <div style={{ display:"flex", gap:8 }}>
          <textarea style={{ ...I, minHeight:85, resize:"vertical" }} placeholder="Besoins, contexte, prochaines étapes..." value={form.notes} onChange={e=>f("notes",e.target.value)} />
          <button style={{ width:43, height:43, border:`2px solid ${rec&&recF==="notes"?"#FF4C1A":"#E8E0D4"}`, borderRadius:8, background:rec&&recF==="notes"?"#FF4C1A":"#fff", cursor:"pointer", fontSize:15, flexShrink:0, alignSelf:"flex-start" }}
            onClick={()=>rec&&recF==="notes"?stopVoice():startVoice("notes")}>
            🎙️
          </button>
        </div>
      </div>

      <div style={{ marginBottom:22 }}>
        <label style={L}>Statut</label>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:6 }}>
          {Object.entries(STATUS_COLORS).map(([key,val])=>(
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

function ListView({ contacts, profile, loadingData, isMobile, onSelect, onAdd }) {
  const [search, setSearch] = useState("");
  const [fs, setFs]         = useState("all");

  const filtered = contacts.filter(c => {
    const ms = fs==="all"||c.status===fs;
    const q  = search.toLowerCase();
    return ms && (!q||[c.first_name,c.last_name,c.company,c.email].some(v=>v?.toLowerCase().includes(q)));
  });

  return (
    <div style={P(isMobile)}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h1 style={T(isMobile)}>{profile?.role==="manager"?"Tous les prospects":"Mes prospects"}</h1>
        {!isMobile && <button style={BP} onClick={onAdd}>＋ Nouveau</button>}
      </div>
      <input style={{ ...I, marginBottom:10, width:"100%" }} placeholder="🔍  Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} />
      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        {["all","chaud","tiède","froid","converti"].map(st=>(
          <button key={st} style={{ padding:"6px 11px", border:`2px solid ${fs===st?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:fs===st?"#1A1A1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:fs===st?"#E8E0D4":"#888", flexShrink:0 }}
            onClick={()=>setFs(st)}>{st==="all"?"Tous":STATUS_COLORS[st]?.label}</button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {loadingData ? <div style={LT}>Chargement...</div> :
          filtered.length===0 ? <div style={{ padding:40, textAlign:"center", color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif" }}>Aucun prospect trouvé</div> :
          filtered.map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", background:"#fff", borderRadius:12, cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }} onClick={()=>onSelect(c)}>
              <div style={AV}>{c.first_name[0]}{c.last_name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:12, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.role}{c.company?` · ${c.company}`:""}</div>
                {profile?.role==="manager" && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>👤 {c.profiles?.full_name}</div>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                <div style={{ ...SB, background:STATUS_COLORS[c.status]?.bg, color:STATUS_COLORS[c.status]?.text }}>{STATUS_COLORS[c.status]?.label}</div>
                <div style={{ fontSize:10, color:"#bbb", fontFamily:"'Helvetica Neue',sans-serif" }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function DetailView({ contact:c, profile, isMobile, onBack, onStatusUpdate, onDelete, notify }) {
  const [synthesis, setSyn]    = useState(null);
  const [synLoad, setSynLoad]  = useState(false);
  const [past, setPast]        = useState([]);

  useEffect(() => {
    supabase.from("syntheses").select("*").eq("contact_id",c.id).order("created_at",{ascending:false}).then(({data})=>setPast(data||[]));
  }, [c.id]);

  const genSyn = async () => {
    setSynLoad(true);
    try {
      const content = await callClaude([{ role:"user", content:`Synthèse commerciale (3-4 phrases) en français pour : ${JSON.stringify(c)}. Potentiel, points clés, prochaines actions.` }]);
      await supabase.from("syntheses").insert({ contact_id:c.id, user_id:profile.id, content });
      setSyn(content); setPast(p=>[{content,created_at:new Date().toISOString()},...p]);
      notify("✨ Synthèse générée !");
    } catch { notify("Erreur IA","error"); }
    setSynLoad(false);
  };

  return (
    <div style={P(isMobile)}>
      <button style={{ border:"none", background:"transparent", cursor:"pointer", color:"#888", fontFamily:"'Helvetica Neue',sans-serif", fontSize:14, marginBottom:18, padding:0 }} onClick={onBack}>← Retour</button>

      <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:18 }}>
        <div style={{ ...AV, width:54, height:54, fontSize:18, flexShrink:0 }}>{c.first_name[0]}{c.last_name[0]}</div>
        <div>
          <h1 style={{ fontSize:isMobile?21:26, fontWeight:400, color:"#1A1A1A", margin:0, fontFamily:"Georgia,serif" }}>{c.first_name} {c.last_name}</h1>
          <p style={{ fontSize:13, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", margin:"3px 0 7px" }}>{c.role}{c.company?` · ${c.company}`:""}</p>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <div style={{ ...SB, background:STATUS_COLORS[c.status]?.bg, color:STATUS_COLORS[c.status]?.text }}>{STATUS_COLORS[c.status]?.label}</div>
            <div style={{ fontSize:11, color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", alignSelf:"center" }}>{SOURCE_ICONS[c.source]} {c.source}</div>
            {profile?.role==="manager" && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif", alignSelf:"center" }}>👤 {c.profiles?.full_name}</div>}
          </div>
        </div>
      </div>

      <div style={{ ...C, marginBottom:14 }}>
        <label style={L}>Modifier le statut</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
          {Object.entries(STATUS_COLORS).map(([key,val])=>(
            <button key={key} style={{ padding:"7px 13px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, background:c.status===key?val.bg:"transparent", color:c.status===key?val.text:"#888", border:`2px solid ${val.bg}` }}
              onClick={()=>onStatusUpdate(c.id,key)}>{val.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10, marginBottom:14 }}>
        {[{icon:"✉️",label:"Email",value:c.email},{icon:"📞",label:"Téléphone",value:c.phone},{icon:"🏢",label:"Entreprise",value:c.company},{icon:"📅",label:"Date",value:new Date(c.created_at).toLocaleDateString("fr-FR")}]
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
          <h3 style={CT}>Synthèse IA</h3>
          <button style={{ padding:"7px 14px", background:"#1A1A1A", color:"#E8E0D4", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600 }} onClick={genSyn} disabled={synLoad}>{synLoad?"...":"✨ Générer"}</button>
        </div>
        {(synthesis||past[0]) && <p style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", color:"#444", lineHeight:1.7, margin:0, fontStyle:"italic" }}>{synthesis||past[0]?.content}</p>}
      </div>

      <button style={{ width:"100%", padding:"12px", background:"transparent", color:"#FF2D2D", border:"2px solid #FF2D2D", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"'Helvetica Neue',sans-serif" }} onClick={()=>onDelete(c.id)}>
        🗑 Supprimer ce prospect
      </button>
    </div>
  );
}

function ReportView({ contacts, profile, isMobile, notify }) {
  const [period, setPeriod]   = useState("month");
  const [cs, setCs]           = useState("");
  const [ce, setCe]           = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const { start, end } = getPeriodRange(period, cs, ce);
  const filtered = contacts.filter(c=>{ if (!start) return true; const d=new Date(c.created_at); return d>=start&&d<=end; });

  const stats = {
    total:    filtered.length,
    chaud:    filtered.filter(c=>c.status==="chaud").length,
    converti: filtered.filter(c=>c.status==="converti").length,
    carte:    filtered.filter(c=>c.source==="carte").length,
    manuel:   filtered.filter(c=>c.source==="manuel").length,
    vocal:    filtered.filter(c=>c.source==="vocal").length,
  };

  const exportExcel = () => {
    let csv = ["Prénom","Nom","Entreprise","Poste","Email","Téléphone","Source","Statut","Notes","Commercial","Date"].join(";")+"\n";
    filtered.forEach(c=>{ csv+=[c.first_name,c.last_name,c.company,c.role,c.email,c.phone,c.source,c.status,c.notes,c.profiles?.full_name||"",new Date(c.created_at).toLocaleDateString("fr-FR")].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(";")+"\n"; });
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})); a.download=`prospects_${period}_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    notify("📊 Export téléchargé !");
  };

  return (
    <div style={P(isMobile)}>
      <h1 style={T(isMobile)}>Rapport & Export</h1>

      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        {PERIODS.map(p=>(
          <button key={p.id} style={{ padding:"6px 11px", border:`2px solid ${period===p.id?"#1A1A1A":"#E8E0D4"}`, borderRadius:20, background:period===p.id?"#1A1A1A":"transparent", cursor:"pointer", fontSize:11, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:period===p.id?"#E8E0D4":"#888", flexShrink:0 }}
            onClick={()=>setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {period==="custom" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div><label style={L}>Du</label><input type="date" style={I} value={cs} onChange={e=>setCs(e.target.value)} /></div>
          <div><label style={L}>Au</label><input type="date" style={I} value={ce} onChange={e=>setCe(e.target.value)} /></div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        {[{label:"Total",value:stats.total,bg:"#1A1A1A",fg:"#E8E0D4"},{label:"Chauds",value:stats.chaud,bg:"#FF4C1A",fg:"#fff"},{label:"Convertis",value:stats.converti,bg:"#00C48C",fg:"#fff"},{label:"Carte IA",value:stats.carte,bg:"#E8E0D4",fg:"#1A1A1A"}].map(st=>(
          <div key={st.label} style={{ background:st.bg, borderRadius:12, padding:"14px", textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:700, color:st.fg }}>{st.value}</div>
            <div style={{ fontSize:10, color:st.fg, opacity:0.7, fontFamily:"'Helvetica Neue',sans-serif", textTransform:"uppercase", letterSpacing:0.5, marginTop:3 }}>{st.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...C, marginBottom:14 }}>
        <h3 style={CT}>Par source</h3>
        {[{label:"Carte IA",value:stats.carte,icon:"📇"},{label:"Manuel",value:stats.manuel,icon:"✏️"},{label:"Vocal",value:stats.vocal,icon:"🎙️"}].map(st=>(
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
        {filtered.length===0 ? <div style={{ textAlign:"center", color:"#aaa", fontFamily:"'Helvetica Neue',sans-serif", padding:16 }}>Aucun prospect sur cette période</div> :
          filtered.map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:"1px solid #F0EBE0" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontFamily:"'Helvetica Neue',sans-serif", fontWeight:600, color:"#1A1A1A" }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:11, color:"#888", fontFamily:"'Helvetica Neue',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.company||"—"} · {new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
                {profile?.role==="manager" && <div style={{ fontSize:11, color:"#FF4C1A", fontFamily:"'Helvetica Neue',sans-serif" }}>{c.profiles?.full_name}</div>}
              </div>
              <div style={{ ...SB, background:STATUS_COLORS[c.status]?.bg, color:STATUS_COLORS[c.status]?.text, flexShrink:0 }}>{STATUS_COLORS[c.status]?.label}</div>
            </div>
          ))
        }
      </div>

      <div style={{ display:"flex", gap:10, flexDirection:isMobile?"column":"row" }}>
        <button style={{ ...BS, flex:1 }} onClick={exportExcel}>📊 Exporter Excel</button>
        <button style={{ ...BP, flex:1 }} onClick={()=>setPreview(true)}>📧 Envoyer email</button>
      </div>

      {preview && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ background:"#fff", borderRadius:isMobile?"20px 20px 0 0":16, padding:isMobile?"24px 20px 40px":32, width:isMobile?"100%":500 }}>
            <h3 style={{ fontSize:17, fontWeight:400, color:"#1A1A1A", margin:"0 0 14px", fontFamily:"Georgia,serif" }}>Envoyer le rapport</h3>
            <input style={{ ...I, marginBottom:10 }} placeholder="Destinataire" defaultValue="manager@entreprise.fr" />
            <input style={{ ...I, marginBottom:10 }} placeholder="Objet" defaultValue={`Rapport — ${PERIODS.find(p=>p.id===period)?.label}`} />
            <textarea style={{ ...I, minHeight:70, marginBottom:14 }} defaultValue={`Total : ${stats.total} | Chauds : ${stats.chaud} | Convertis : ${stats.converti}`} />
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...BS, flex:1 }} onClick={()=>setPreview(false)}>Annuler</button>
              <button style={{ ...BP, flex:1 }} onClick={async()=>{ setSending(true); await new Promise(r=>setTimeout(r,1500)); setSending(false); notify("📧 Envoyé !"); setPreview(false); }} disabled={sending}>{sending?"Envoi...":"✉️ Envoyer"}</button>
            </div>
          </div>
        </div>
      )}
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
