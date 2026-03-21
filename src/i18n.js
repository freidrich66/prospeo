// ============================================================
//  PROSPEO — Internationalisation (i18n)
//  9 langues : fr, en, es, pt, it, de, no, sv, nl
// ============================================================

export const LANGUAGES = [
  { code: "fr", label: "Français",    flag: "🇫🇷" },
  { code: "en", label: "English",     flag: "🇬🇧" },
  { code: "es", label: "Español",     flag: "🇪🇸" },
  { code: "pt", label: "Português",   flag: "🇵🇹" },
  { code: "it", label: "Italiano",    flag: "🇮🇹" },
  { code: "de", label: "Deutsch",     flag: "🇩🇪" },
  { code: "no", label: "Norsk",       flag: "🇳🇴" },
  { code: "sv", label: "Svenska",     flag: "🇸🇪" },
  { code: "nl", label: "Nederlands",  flag: "🇳🇱" },
];

export const translations = {

  // ── AUTH ──────────────────────────────────────────────────
  login:               { fr:"Connexion",       en:"Sign in",        es:"Iniciar sesión",  pt:"Entrar",         it:"Accedi",          de:"Anmelden",       no:"Logg inn",       sv:"Logga in",       nl:"Inloggen"        },
  register:            { fr:"Créer un compte", en:"Create account", es:"Crear cuenta",   pt:"Criar conta",    it:"Crea account",    de:"Konto erstellen",no:"Opprett konto",  sv:"Skapa konto",    nl:"Account aanmaken"},
  email:               { fr:"Email",           en:"Email",          es:"Correo",         pt:"E-mail",         it:"Email",           de:"E-Mail",         no:"E-post",         sv:"E-post",         nl:"E-mail"          },
  password:            { fr:"Mot de passe",    en:"Password",       es:"Contraseña",     pt:"Senha",          it:"Password",        de:"Passwort",       no:"Passord",        sv:"Lösenord",       nl:"Wachtwoord"      },
  signout:             { fr:"Déconnexion",     en:"Sign out",       es:"Cerrar sesión",  pt:"Sair",           it:"Esci",            de:"Abmelden",       no:"Logg ut",        sv:"Logga ut",       nl:"Uitloggen"       },
  no_account:          { fr:"Pas encore de compte ?", en:"No account yet?", es:"¿Sin cuenta?", pt:"Sem conta?", it:"Nessun account?", de:"Noch kein Konto?", no:"Ingen konto?", sv:"Inget konto?", nl:"Nog geen account?" },
  already_account:     { fr:"Déjà un compte ?", en:"Already have an account?", es:"¿Ya tienes cuenta?", pt:"Já tem conta?", it:"Hai già un account?", de:"Bereits ein Konto?", no:"Har du allerede konto?", sv:"Har du redan ett konto?", nl:"Al een account?" },

  // ── NAVIGATION ────────────────────────────────────────────
  nav_home:            { fr:"Accueil",         en:"Home",           es:"Inicio",         pt:"Início",         it:"Home",            de:"Startseite",     no:"Hjem",           sv:"Hem",            nl:"Home"            },
  nav_add:             { fr:"Ajouter",         en:"Add",            es:"Agregar",        pt:"Adicionar",      it:"Aggiungi",        de:"Hinzufügen",     no:"Legg til",       sv:"Lägg till",      nl:"Toevoegen"       },
  nav_prospects:       { fr:"Prospects",       en:"Prospects",      es:"Prospectos",     pt:"Prospectos",     it:"Prospetti",       de:"Interessenten",  no:"Prospekter",     sv:"Prospekter",     nl:"Prospects"       },
  nav_reports:         { fr:"Rapports",        en:"Reports",        es:"Informes",       pt:"Relatórios",     it:"Rapporti",        de:"Berichte",       no:"Rapporter",      sv:"Rapporter",      nl:"Rapporten"       },
  nav_profile:         { fr:"Mon profil",      en:"My profile",     es:"Mi perfil",      pt:"Meu perfil",     it:"Il mio profilo",  de:"Mein Profil",    no:"Min profil",     sv:"Min profil",     nl:"Mijn profiel"    },
  nav_subscription:    { fr:"Abonnement",      en:"Subscription",   es:"Suscripción",    pt:"Assinatura",     it:"Abbonamento",     de:"Abonnement",     no:"Abonnement",     sv:"Prenumeration",  nl:"Abonnement"      },
  nav_crm:             { fr:"CRM",             en:"CRM",            es:"CRM",            pt:"CRM",            it:"CRM",             de:"CRM",            no:"CRM",            sv:"CRM",            nl:"CRM"             },
  nav_superadmin:      { fr:"Super Admin",     en:"Super Admin",    es:"Super Admin",    pt:"Super Admin",    it:"Super Admin",     de:"Super Admin",    no:"Super Admin",    sv:"Super Admin",    nl:"Super Admin"     },
  nav_language:        { fr:"Langue",          en:"Language",       es:"Idioma",         pt:"Idioma",         it:"Lingua",          de:"Sprache",        no:"Språk",          sv:"Språk",          nl:"Taal"            },

  // ── DASHBOARD ────────────────────────────────────────────
  dashboard_title:     { fr:"Tableau de bord", en:"Dashboard",      es:"Panel",          pt:"Painel",         it:"Dashboard",       de:"Dashboard",      no:"Kontrollpanel",  sv:"Instrumentpanel",nl:"Dashboard"       },
  last_prospects:      { fr:"Derniers prospects", en:"Latest prospects", es:"Últimos prospectos", pt:"Últimos prospectos", it:"Ultimi prospetti", de:"Letzte Interessenten", no:"Siste prospekter", sv:"Senaste prospekter", nl:"Laatste prospects" },
  quick_actions:       { fr:"Actions rapides", en:"Quick actions",  es:"Acciones rápidas", pt:"Ações rápidas", it:"Azioni rapide",  de:"Schnellaktionen",no:"Hurtighandlinger",sv:"Snabbåtgärder",  nl:"Snelle acties"   },
  total:               { fr:"Total",           en:"Total",          es:"Total",          pt:"Total",          it:"Totale",          de:"Gesamt",         no:"Totalt",         sv:"Totalt",         nl:"Totaal"          },
  hot:                 { fr:"Chauds",          en:"Hot",            es:"Calientes",      pt:"Quentes",        it:"Caldi",           de:"Heiß",           no:"Varme",          sv:"Heta",           nl:"Heet"            },
  converted:           { fr:"Convertis",       en:"Converted",      es:"Convertidos",    pt:"Convertidos",    it:"Convertiti",      de:"Konvertiert",    no:"Konvertert",     sv:"Konverterade",   nl:"Geconverteerd"   },
  this_week:           { fr:"Semaine",         en:"This week",      es:"Esta semana",    pt:"Esta semana",    it:"Questa settimana",de:"Diese Woche",    no:"Denne uken",     sv:"Denna vecka",    nl:"Deze week"       },
  by_sales_rep:        { fr:"Par commercial",  en:"By sales rep",   es:"Por comercial",  pt:"Por vendedor",   it:"Per commerciale", de:"Pro Vertreter",  no:"Per selger",     sv:"Per säljare",    nl:"Per vertegenw."  },

  // ── ADD PROSPECT ─────────────────────────────────────────
  add_title:           { fr:"Nouveau prospect", en:"New prospect",  es:"Nuevo prospecto",pt:"Novo prospecto", it:"Nuovo prospetto", de:"Neuer Interessent",no:"Ny prospekt",  sv:"Ny prospekt",    nl:"Nieuwe prospect" },
  manual:              { fr:"Manuel",          en:"Manual",         es:"Manual",         pt:"Manual",         it:"Manuale",         de:"Manuell",        no:"Manuell",        sv:"Manuell",        nl:"Handmatig"       },
  card_ai:             { fr:"Carte IA",        en:"AI Card",        es:"Tarjeta IA",     pt:"Cartão IA",      it:"Biglietto IA",    de:"KI-Karte",       no:"IA-kort",        sv:"AI-kort",        nl:"AI-kaart"        },
  vocal:               { fr:"Vocal",           en:"Voice",          es:"Voz",            pt:"Voz",            it:"Voce",            de:"Sprache",        no:"Stemme",         sv:"Röst",           nl:"Stem"            },
  first_name:          { fr:"Prénom",          en:"First name",     es:"Nombre",         pt:"Primeiro nome",  it:"Nome",            de:"Vorname",        no:"Fornavn",        sv:"Förnamn",        nl:"Voornaam"        },
  last_name:           { fr:"Nom",             en:"Last name",      es:"Apellido",       pt:"Sobrenome",      it:"Cognome",         de:"Nachname",       no:"Etternavn",      sv:"Efternamn",      nl:"Achternaam"      },
  company:             { fr:"Entreprise",      en:"Company",        es:"Empresa",        pt:"Empresa",        it:"Azienda",         de:"Unternehmen",    no:"Bedrift",        sv:"Företag",        nl:"Bedrijf"         },
  role:                { fr:"Poste",           en:"Role",           es:"Cargo",          pt:"Cargo",          it:"Ruolo",           de:"Position",       no:"Stilling",       sv:"Roll",           nl:"Functie"         },
  phone:               { fr:"Téléphone",       en:"Phone",          es:"Teléfono",       pt:"Telefone",       it:"Telefono",        de:"Telefon",        no:"Telefon",        sv:"Telefon",        nl:"Telefoon"        },
  notes:               { fr:"Notes",           en:"Notes",          es:"Notas",          pt:"Notas",          it:"Note",            de:"Notizen",        no:"Notater",        sv:"Anteckningar",   nl:"Notities"        },
  save_prospect:       { fr:"Enregistrer le prospect", en:"Save prospect", es:"Guardar prospecto", pt:"Salvar prospecto", it:"Salva prospetto", de:"Interessent speichern", no:"Lagre prospekt", sv:"Spara prospekt", nl:"Prospect opslaan" },
  saving:              { fr:"Enregistrement...", en:"Saving...",    es:"Guardando...",   pt:"Salvando...",    it:"Salvataggio...",  de:"Speichern...",   no:"Lagrer...",      sv:"Sparar...",      nl:"Opslaan..."      },
  status:              { fr:"Statut",          en:"Status",         es:"Estado",         pt:"Status",         it:"Stato",           de:"Status",         no:"Status",         sv:"Status",         nl:"Status"          },

  // ── STATUS LABELS ─────────────────────────────────────────
  status_chaud:        { fr:"Chaud",           en:"Hot",            es:"Caliente",       pt:"Quente",         it:"Caldo",           de:"Heiß",           no:"Varm",           sv:"Het",            nl:"Heet"            },
  status_tiede:        { fr:"Tiède",           en:"Warm",           es:"Tibio",          pt:"Morno",          it:"Tiepido",         de:"Warm",           no:"Lunken",         sv:"Ljummen",        nl:"Lauw"            },
  status_froid:        { fr:"Froid",           en:"Cold",           es:"Frío",           pt:"Frio",           it:"Freddo",          de:"Kalt",           no:"Kald",           sv:"Kall",           nl:"Koud"            },
  status_converti:     { fr:"Converti",        en:"Converted",      es:"Convertido",     pt:"Convertido",     it:"Convertito",      de:"Konvertiert",    no:"Konvertert",     sv:"Konverterad",    nl:"Geconverteerd"   },

  // ── DETAIL VIEW ───────────────────────────────────────────
  back:                { fr:"← Retour",        en:"← Back",         es:"← Volver",       pt:"← Voltar",       it:"← Indietro",      de:"← Zurück",       no:"← Tilbake",      sv:"← Tillbaka",     nl:"← Terug"         },
  edit:                { fr:"✏️ Modifier",     en:"✏️ Edit",        es:"✏️ Editar",      pt:"✏️ Editar",      it:"✏️ Modifica",     de:"✏️ Bearbeiten",  no:"✏️ Rediger",     sv:"✏️ Redigera",    nl:"✏️ Bewerken"     },
  edit_prospect:       { fr:"Modifier le prospect", en:"Edit prospect", es:"Editar prospecto", pt:"Editar prospecto", it:"Modifica prospetto", de:"Interessent bearbeiten", no:"Rediger prospekt", sv:"Redigera prospekt", nl:"Prospect bewerken" },
  save:                { fr:"✅ Enregistrer",  en:"✅ Save",         es:"✅ Guardar",      pt:"✅ Salvar",       it:"✅ Salva",         de:"✅ Speichern",    no:"✅ Lagre",        sv:"✅ Spara",        nl:"✅ Opslaan"       },
  cancel:              { fr:"Annuler",         en:"Cancel",         es:"Cancelar",       pt:"Cancelar",       it:"Annulla",         de:"Abbrechen",      no:"Avbryt",         sv:"Avbryt",         nl:"Annuleren"       },
  delete_prospect:     { fr:"🗑 Supprimer ce prospect", en:"🗑 Delete this prospect", es:"🗑 Eliminar prospecto", pt:"🗑 Excluir prospecto", it:"🗑 Elimina prospetto", de:"🗑 Interessent löschen", no:"🗑 Slett prospekt", sv:"🗑 Ta bort prospekt", nl:"🗑 Prospect verwijderen" },
  edit_status:         { fr:"Modifier le statut", en:"Change status", es:"Cambiar estado", pt:"Alterar status", it:"Cambia stato",   de:"Status ändern",  no:"Endre status",   sv:"Ändra status",   nl:"Status wijzigen" },
  ai_synthesis:        { fr:"Synthèse IA",     en:"AI Summary",     es:"Resumen IA",     pt:"Resumo IA",      it:"Sintesi IA",      de:"KI-Zusammenfassung",no:"IA-sammendrag",sv:"AI-sammanfattning",nl:"AI-samenvatting" },
  generate:            { fr:"✨ Générer",       en:"✨ Generate",     es:"✨ Generar",      pt:"✨ Gerar",        it:"✨ Genera",        de:"✨ Generieren",   no:"✨ Generer",      sv:"✨ Generera",     nl:"✨ Genereren"     },

  // ── REPORT ────────────────────────────────────────────────
  report_title:        { fr:"Rapport & Export", en:"Report & Export", es:"Informe y Export", pt:"Relatório e Export", it:"Report ed Export", de:"Bericht & Export", no:"Rapport & Eksport", sv:"Rapport & Export", nl:"Rapport & Export" },
  period:              { fr:"Période",          en:"Period",          es:"Período",        pt:"Período",        it:"Periodo",         de:"Zeitraum",       no:"Periode",        sv:"Period",         nl:"Periode"         },
  today:               { fr:"Aujourd'hui",      en:"Today",           es:"Hoy",            pt:"Hoje",           it:"Oggi",            de:"Heute",          no:"I dag",          sv:"Idag",           nl:"Vandaag"         },
  yesterday:           { fr:"Hier",             en:"Yesterday",       es:"Ayer",           pt:"Ontem",          it:"Ieri",            de:"Gestern",        no:"I går",          sv:"Igår",           nl:"Gisteren"        },
  this_week_label:     { fr:"Cette semaine",    en:"This week",       es:"Esta semana",    pt:"Esta semana",    it:"Questa settimana",de:"Diese Woche",    no:"Denne uken",     sv:"Denna vecka",    nl:"Deze week"       },
  this_month:          { fr:"Ce mois",          en:"This month",      es:"Este mes",       pt:"Este mês",       it:"Questo mese",     de:"Dieser Monat",   no:"Denne måneden",  sv:"Denna månad",    nl:"Deze maand"      },
  custom:              { fr:"Personnalisé",     en:"Custom",          es:"Personalizado",  pt:"Personalizado",  it:"Personalizzato",  de:"Benutzerdefiniert",no:"Tilpasset",    sv:"Anpassad",       nl:"Aangepast"       },
  export_excel:        { fr:"📥 Exporter Excel", en:"📥 Export Excel", es:"📥 Exportar Excel", pt:"📥 Exportar Excel", it:"📥 Esporta Excel", de:"📥 Excel exportieren", no:"📥 Eksporter Excel", sv:"📥 Exportera Excel", nl:"📥 Excel exporteren" },
  send_report:         { fr:"📧 Envoyer rapport", en:"📧 Send report", es:"📧 Enviar informe", pt:"📧 Enviar relatório", it:"📧 Invia report", de:"📧 Bericht senden", no:"📧 Send rapport", sv:"📧 Skicka rapport", nl:"📧 Rapport sturen" },
  no_prospects:        { fr:"Aucun prospect sur cette période", en:"No prospects in this period", es:"Sin prospectos en este período", pt:"Sem prospectos neste período", it:"Nessun prospetto in questo periodo", de:"Keine Interessenten in diesem Zeitraum", no:"Ingen prospekter i denne perioden", sv:"Inga prospekter under denna period", nl:"Geen prospects in deze periode" },
  filter_by_rep:       { fr:"Filtrer par commercial", en:"Filter by sales rep", es:"Filtrar por comercial", pt:"Filtrar por vendedor", it:"Filtra per commerciale", de:"Nach Vertreter filtern", no:"Filtrer etter selger", sv:"Filtrera efter säljare", nl:"Filteren op vertegenw." },
  all:                 { fr:"Tous",             en:"All",             es:"Todos",          pt:"Todos",          it:"Tutti",           de:"Alle",           no:"Alle",           sv:"Alla",           nl:"Alle"            },
  by_source:           { fr:"Par source",       en:"By source",       es:"Por fuente",     pt:"Por fonte",      it:"Per fonte",       de:"Nach Quelle",    no:"Etter kilde",    sv:"Efter källa",    nl:"Op bron"         },

  // ── PROFILE ───────────────────────────────────────────────
  profile_title:       { fr:"Mon profil",       en:"My profile",      es:"Mi perfil",      pt:"Meu perfil",     it:"Il mio profilo",  de:"Mein Profil",    no:"Min profil",     sv:"Min profil",     nl:"Mijn profiel"    },
  personal_info:       { fr:"Informations personnelles", en:"Personal information", es:"Información personal", pt:"Informações pessoais", it:"Informazioni personali", de:"Persönliche Informationen", no:"Personlig informasjon", sv:"Personlig information", nl:"Persoonlijke informatie" },
  profile_updated:     { fr:"✅ Profil mis à jour !", en:"✅ Profile updated!", es:"✅ Perfil actualizado!", pt:"✅ Perfil atualizado!", it:"✅ Profilo aggiornato!", de:"✅ Profil aktualisiert!", no:"✅ Profil oppdatert!", sv:"✅ Profil uppdaterad!", nl:"✅ Profiel bijgewerkt!" },
  save_profile:        { fr:"Enregistrer mon profil", en:"Save my profile", es:"Guardar mi perfil", pt:"Salvar meu perfil", it:"Salva il mio profilo", de:"Mein Profil speichern", no:"Lagre profilen min", sv:"Spara min profil", nl:"Mijn profiel opslaan" },
  email_readonly:      { fr:"L'email ne peut pas être modifié", en:"Email cannot be changed", es:"El correo no se puede cambiar", pt:"O e-mail não pode ser alterado", it:"L'email non può essere modificata", de:"E-Mail kann nicht geändert werden", no:"E-post kan ikke endres", sv:"E-post kan inte ändras", nl:"E-mail kan niet worden gewijzigd" },
  language_label:      { fr:"Langue de l'interface", en:"Interface language", es:"Idioma de la interfaz", pt:"Idioma da interface", it:"Lingua dell'interfaccia", de:"Sprache der Benutzeroberfläche", no:"Grensesnittspråk", sv:"Gränssnittsspråk", nl:"Interfacetaal" },

  // ── SUBSCRIPTION ─────────────────────────────────────────
  sub_title:           { fr:"Mon abonnement",   en:"My subscription", es:"Mi suscripción", pt:"Minha assinatura",it:"Il mio abbonamento",de:"Mein Abonnement",no:"Mitt abonnement",sv:"Mitt abonnemang",nl:"Mijn abonnement" },
  sub_status:          { fr:"Statut actuel",    en:"Current status",  es:"Estado actual",  pt:"Status atual",   it:"Stato attuale",   de:"Aktueller Status",no:"Gjeldende status",sv:"Nuvarande status",nl:"Huidige status"  },
  trial_active:        { fr:"🎁 Essai gratuit", en:"🎁 Free trial",   es:"🎁 Prueba gratis",pt:"🎁 Teste grátis", it:"🎁 Prova gratuita",de:"🎁 Kostenlose Testversion",no:"🎁 Gratis prøveperiode",sv:"🎁 Gratis provperiod",nl:"🎁 Gratis proefperiode" },
  subscribe:           { fr:"S'abonner",        en:"Subscribe",       es:"Suscribirse",    pt:"Assinar",        it:"Abbonati",        de:"Abonnieren",     no:"Abonner",        sv:"Prenumerera",    nl:"Abonneren"       },
  activate_key:        { fr:"🔑 Activer une clé", en:"🔑 Activate a key", es:"🔑 Activar clave", pt:"🔑 Ativar chave", it:"🔑 Attiva chiave", de:"🔑 Schlüssel aktivieren", no:"🔑 Aktiver nøkkel", sv:"🔑 Aktivera nyckel", nl:"🔑 Sleutel activeren" },
  activate_btn:        { fr:"🔑 Activer mon abonnement", en:"🔑 Activate my subscription", es:"🔑 Activar mi suscripción", pt:"🔑 Ativar minha assinatura", it:"🔑 Attiva il mio abbonamento", de:"🔑 Mein Abonnement aktivieren", no:"🔑 Aktiver abonnementet mitt", sv:"🔑 Aktivera mitt abonnemang", nl:"🔑 Mijn abonnement activeren" },
  free_trial_days:     { fr:"Essai gratuit 7 jours", en:"Free trial 7 days", es:"Prueba gratuita 7 días", pt:"Teste gratuito 7 dias", it:"Prova gratuita 7 giorni", de:"7 Tage kostenlos testen", no:"7 dagers gratis prøveperiode", sv:"7 dagars gratis provperiod", nl:"7 dagen gratis proberen" },
  per_month:           { fr:"/ mois",           en:"/ month",         es:"/ mes",          pt:"/ mês",          it:"/ mese",          de:"/ Monat",        no:"/ måned",        sv:"/ månad",        nl:"/ maand"         },
  per_year:            { fr:"/ an",             en:"/ year",          es:"/ año",          pt:"/ ano",          it:"/ anno",          de:"/ Jahr",         no:"/ år",           sv:"/ år",           nl:"/ jaar"          },

  // ── CRM ───────────────────────────────────────────────────
  crm_title:           { fr:"Intégration CRM",  en:"CRM Integration", es:"Integración CRM",pt:"Integração CRM", it:"Integrazione CRM",de:"CRM-Integration", no:"CRM-integrering",sv:"CRM-integration", nl:"CRM-integratie"  },
  crm_connect:         { fr:"+ Connecter un CRM", en:"+ Connect a CRM", es:"+ Conectar CRM", pt:"+ Conectar CRM", it:"+ Connetti CRM",  de:"+ CRM verbinden",no:"+ Koble til CRM", sv:"+ Anslut CRM",    nl:"+ CRM verbinden" },
  crm_type:            { fr:"Votre CRM",        en:"Your CRM",        es:"Su CRM",         pt:"Seu CRM",        it:"Il tuo CRM",      de:"Ihr CRM",        no:"Ditt CRM",       sv:"Ditt CRM",       nl:"Uw CRM"          },

  // ── GENERAL ───────────────────────────────────────────────
  loading:             { fr:"Chargement...",    en:"Loading...",      es:"Cargando...",    pt:"Carregando...",  it:"Caricamento...",  de:"Laden...",       no:"Laster...",      sv:"Laddar...",      nl:"Laden..."        },
  error:               { fr:"Erreur",           en:"Error",           es:"Error",          pt:"Erro",           it:"Errore",          de:"Fehler",         no:"Feil",           sv:"Fel",            nl:"Fout"            },
  success:             { fr:"Succès",           en:"Success",         es:"Éxito",          pt:"Sucesso",        it:"Successo",        de:"Erfolg",         no:"Suksess",        sv:"Framgång",       nl:"Succes"          },
  search:              { fr:"Rechercher...",    en:"Search...",       es:"Buscar...",      pt:"Pesquisar...",   it:"Cerca...",        de:"Suchen...",      no:"Søk...",         sv:"Sök...",         nl:"Zoeken..."       },
  confirm_delete:      { fr:"Supprimer ce prospect ?", en:"Delete this prospect?", es:"¿Eliminar este prospecto?", pt:"Excluir este prospecto?", it:"Eliminare questo prospetto?", de:"Diesen Interessenten löschen?", no:"Slette denne prospekten?", sv:"Ta bort denna prospekt?", nl:"Dit prospect verwijderen?" },
  date:                { fr:"Date",             en:"Date",            es:"Fecha",          pt:"Data",           it:"Data",            de:"Datum",          no:"Dato",           sv:"Datum",          nl:"Datum"           },
  manager_label:       { fr:"👑 Manager",       en:"👑 Manager",      es:"👑 Manager",     pt:"👑 Manager",     it:"👑 Manager",      de:"👑 Manager",     no:"👑 Manager",     sv:"👑 Manager",     nl:"👑 Manager"      },
  commercial_label:    { fr:"Commercial",       en:"Sales rep",       es:"Comercial",      pt:"Vendedor",       it:"Commerciale",     de:"Vertreter",      no:"Selger",         sv:"Säljare",        nl:"Vertegenw."      },
  analyzing:           { fr:"Analyse IA...",    en:"AI analyzing...", es:"Analizando IA...",pt:"Analisando IA...",it:"Analisi IA...",  de:"KI analysiert...",no:"IA analyserer...",sv:"AI analyserar...",nl:"AI analyseert..." },
};

// ── Detect browser language ────────────────────────────────
export function detectBrowserLang() {
  const supported = LANGUAGES.map(l => l.code);
  const nav = navigator.language || navigator.userLanguage || "fr";
  const code = nav.split("-")[0].toLowerCase();
  return supported.includes(code) ? code : "fr";
}

// ── Get saved language ─────────────────────────────────────
export function getSavedLang() {
  return localStorage.getItem("prospeo_lang") || null;
}

// ── Save language ──────────────────────────────────────────
export function saveLang(code) {
  localStorage.setItem("prospeo_lang", code);
}

// ── Translation hook helper ────────────────────────────────
export function t(key, lang) {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry["fr"] || key;
}
