import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Connecteurs CRM natifs ────────────────────────────────────
async function syncHubSpot(prospect, commercial, config) {
  const payload = {
    properties: {
      firstname:   prospect.first_name,
      lastname:    prospect.last_name,
      company:     prospect.company,
      jobtitle:    prospect.role,
      email:       prospect.email,
      phone:       prospect.phone,
      hs_lead_status: prospect.status === "chaud" ? "IN_PROGRESS" : "NEW",
      lead_source: `Prospeo (${prospect.source})`,
      notes_last_activity: prospect.notes,
    },
  };
  const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.api_key}` },
    body: JSON.stringify(payload),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function syncSalesforce(prospect, commercial, config) {
  // OAuth2 token exchange
  const tokenRes = await fetch(`${config.instance_url}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: config.client_id,
      client_secret: config.client_secret,
      username: config.username,
      password: config.password + config.security_token,
    }),
  });
  const token = await tokenRes.json();
  const r = await fetch(`${config.instance_url}/services/data/v57.0/sobjects/Lead/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token.access_token}` },
    body: JSON.stringify({
      FirstName: prospect.first_name,
      LastName:  prospect.last_name || "Inconnu",
      Company:   prospect.company  || "Inconnu",
      Title:     prospect.role,
      Email:     prospect.email,
      Phone:     prospect.phone,
      LeadSource: `Prospeo`,
      Description: prospect.notes,
      Status: prospect.status === "chaud" ? "Working - Contacted" : "Open - Not Contacted",
    }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function syncPipedrive(prospect, commercial, config) {
  const base = `https://api.pipedrive.com/v1`;
  // Créer la personne
  const r = await fetch(`${base}/persons?api_token=${config.api_key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name:  `${prospect.first_name} ${prospect.last_name}`.trim(),
      email: [{ value: prospect.email, primary: true }],
      phone: [{ value: prospect.phone, primary: true }],
      org_name: prospect.company,
      job_title: prospect.role,
    }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function syncZoho(prospect, commercial, config) {
  const r = await fetch(`https://www.zohoapis.eu/crm/v3/Leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Zoho-oauthtoken ${config.access_token}` },
    body: JSON.stringify({
      data: [{
        First_Name: prospect.first_name,
        Last_Name:  prospect.last_name || "Inconnu",
        Company:    prospect.company,
        Title:      prospect.role,
        Email:      prospect.email,
        Phone:      prospect.phone,
        Lead_Source: "Prospeo",
        Description: prospect.notes,
        Lead_Status: prospect.status === "chaud" ? "Attempted to Contact" : "Not Contacted",
      }],
    }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

async function syncOdoo(prospect, commercial, config) {
  // Odoo JSON-RPC
  const rpc = async (method, params) => {
    const r = await fetch(`${config.url}/web/dataset/call_kw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call", id: 1,
        params: { model: "crm.lead", method, args: params.args, kwargs: params.kwargs || {} },
      }),
    });
    return r.json();
  };
  // Auth
  const authRes = await fetch(`${config.url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc:"2.0", method:"call", params:{ db: config.db, login: config.username, password: config.password } }),
  });
  const res = await rpc("create", {
    args: [{
      name:         `${prospect.first_name} ${prospect.last_name}`.trim(),
      contact_name: `${prospect.first_name} ${prospect.last_name}`.trim(),
      partner_name: prospect.company,
      function:     prospect.role,
      email_from:   prospect.email,
      phone:        prospect.phone,
      description:  prospect.notes,
      source_id:    false,
      type:         "lead",
    }],
  });
  return { ok: !res.error, data: res };
}

async function syncGeneric(prospect, commercial, config) {
  // Webhook générique — envoie les données brutes à l'URL configurée
  const payload = {
    event:      "contact.created",
    timestamp:  new Date().toISOString(),
    source:     "prospeo",
    prospect: {
      first_name:  prospect.first_name,
      last_name:   prospect.last_name,
      full_name:   `${prospect.first_name} ${prospect.last_name}`.trim(),
      company:     prospect.company,
      role:        prospect.role,
      email:       prospect.email,
      phone:       prospect.phone,
      status:      prospect.status,
      source:      prospect.source,
      notes:       prospect.notes,
      created_at:  prospect.created_at,
    },
    commercial: {
      name:  commercial?.full_name,
      email: commercial?.email,
    },
  };

  // Appliquer le mapping personnalisé si configuré
  if (config.field_mapping) {
    const mapped = {};
    for (const [prospeoField, crmField] of Object.entries(config.field_mapping)) {
      if (payload.prospect[prospeoField] !== undefined) {
        mapped[crmField] = payload.prospect[prospeoField];
      }
    }
    payload.mapped_data = mapped;
  }

  const headers = { "Content-Type": "application/json" };
  if (config.api_key)    headers["Authorization"]   = `Bearer ${config.api_key}`;
  if (config.secret_key) headers["X-Webhook-Secret"] = config.secret_key;
  if (config.custom_headers) Object.assign(headers, config.custom_headers);

  const r = await fetch(config.webhook_url, {
    method: config.method || "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { ok: r.ok, status: r.status };
}

// ── Router CRM ────────────────────────────────────────────────
async function routeToCRM(crm_type, prospect, commercial, config) {
  switch (crm_type) {
    case "hubspot":    return syncHubSpot(prospect, commercial, config);
    case "salesforce": return syncSalesforce(prospect, commercial, config);
    case "pipedrive":  return syncPipedrive(prospect, commercial, config);
    case "zoho":       return syncZoho(prospect, commercial, config);
    case "odoo":       return syncOdoo(prospect, commercial, config);
    default:           return syncGeneric(prospect, commercial, config);
  }
}

// ── Handler principal ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { contact_id, user_id } = req.body;
    if (!contact_id || !user_id) return res.status(400).json({ error: "contact_id et user_id requis" });

    // 1. Récupérer le prospect
    const { data: prospect } = await supabase
      .from("contacts")
      .select("*, profiles:user_id(full_name, email)")
      .eq("id", contact_id)
      .single();

    if (!prospect) return res.status(404).json({ error: "Prospect introuvable" });

    // 2. Récupérer la config CRM du commercial
    const { data: crmConfig } = await supabase
      .from("crm_configs")
      .select("*")
      .eq("user_id", user_id)
      .eq("active", true);

    if (!crmConfig || crmConfig.length === 0) {
      return res.status(200).json({ message: "Aucun CRM configuré", synced: 0 });
    }

    // 3. Synchroniser vers chaque CRM configuré
    const results = [];
    for (const cfg of crmConfig) {
      try {
        const result = await routeToCRM(cfg.crm_type, prospect, prospect.profiles, cfg.config);
        results.push({ crm: cfg.crm_type, ok: result.ok, status: result.status });

        // Logger le résultat
        await supabase.from("crm_sync_logs").insert({
          user_id,
          contact_id,
          crm_type: cfg.crm_type,
          success: result.ok,
          response_status: result.status,
        });
      } catch (err) {
        results.push({ crm: cfg.crm_type, ok: false, error: err.message });
      }
    }

    return res.status(200).json({ synced: results.filter(r => r.ok).length, results });

  } catch (err) {
    console.error("crm-sync error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
