import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPER_EMAIL = "fanne@lafitel.eu";

function genKey() {
  const s = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `PROS-${s()}-${s()}-${s()}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, callerEmail } = req.body;

    // Vérification Super Manager
    if (callerEmail !== SUPER_EMAIL) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // ── GET ALL DATA ────────────────────────────────────────
    if (action === "getData") {
      const [profiles, subscriptions, keys, companies] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
        supabase.from("activation_keys").select("*").order("created_at", { ascending: false }),
        supabase.from("companies").select("*").order("created_at", { ascending: false }),
      ]);
      return res.status(200).json({
        profiles:      profiles.data  || [],
        subscriptions: subscriptions.data || [],
        keys:          keys.data      || [],
        companies:     companies.data || [],
      });
    }

    // ── GENERATE KEYS MANUALLY ──────────────────────────────
    if (action === "generateKeys") {
      const { quantity = 1, email, companyName, notes, trialDays = 0, commercialEmails = [] } = req.body;
      // commercialEmails = array of emails for each commercial slot (optional)
      const qty      = Math.max(1, parseInt(quantity));
      const batchId  = crypto.randomUUID();
      const expiresAt = new Date();
      if (trialDays > 0) {
        expiresAt.setDate(expiresAt.getDate() + trialDays);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }
      const keyPlan = trialDays > 0 ? "trial" : "annual";
      const trialSuffix = trialDays > 0 ? ` [ESSAI ${trialDays} jours]` : "";

      const keysToInsert = [];

      if (qty === 1) {
        keysToInsert.push({
          key: genKey(), email: email || null,
          key_type: "individual", plan: keyPlan,
          batch_id: batchId, notes: (notes || "Généré manuellement") + trialSuffix,
          expires_at: expiresAt.toISOString(),
        });
      } else {
        // Manager key
        keysToInsert.push({
          key: genKey(), email: email || null,
          key_type: "manager", plan: keyPlan,
          batch_id: batchId,
          notes: (notes || `Pack ${qty} licences — Licence Manager`) + trialSuffix,
          expires_at: expiresAt.toISOString(),
        });
        // Commercial keys — with optional pre-assigned emails
        for (let i = 1; i < qty; i++) {
          const commEmail = commercialEmails[i-1] || null;
          keysToInsert.push({
            key: genKey(), email: commEmail,
            key_type: "commercial", plan: keyPlan,
            batch_id: batchId,
            notes: (notes || `Pack ${qty} licences — Licence Commercial ${i}`) + trialSuffix,
            expires_at: expiresAt.toISOString(),
          });
        }
        // Créer l'entreprise si nom fourni
        if (companyName) {
          const { data: company } = await supabase.from("companies").insert({
            name: companyName, email: email || "",
            licence_count: qty,
          }).select().single();
          if (company) keysToInsert.forEach(k => { k.company_id = company.id; });
        }
      }

      const { data, error } = await supabase.from("activation_keys")
        .insert(keysToInsert).select();

      if (error) return res.status(500).json({ error: error.message });

      // ── Send emails ──
      // 1. Send manager key to manager email
      // 2. Send each commercial key to pre-assigned email (if provided)
      // 3. Send all keys summary to manager + BCC synermo
      let emailSent = false;
      if (process.env.RESEND_API_KEY) {
        const managerKey     = data.find(k => k.key_type === "manager" || k.key_type === "individual");
        const commercialKeys = data.filter(k => k.key_type === "commercial");
        const expireStr      = expiresAt.toLocaleDateString("fr-FR");
        const trialNote      = trialDays > 0 ? ` (essai ${trialDays} jours)` : "";

        // Domaine expéditeur : utilise prospeo.me si vérifié dans Resend, sinon onboarding@resend.dev
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Prospeo <onboarding@resend.dev>";
        const sendEmail = async (to, subject, html, bcc = ["contact@synermo.fr"]) => {
          const payload = { from: FROM_EMAIL, to, subject, html };
          // BCC only if domain is custom (resend.dev doesn't support bcc)
          if (!FROM_EMAIL.includes("resend.dev")) payload.bcc = bcc;
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify(payload),
          });
          const respText = await r.text();
          if (!r.ok) {
            console.error(`❌ Resend error ${r.status}:`, respText);
          } else {
            console.log(`✅ Email envoyé à ${to}:`, respText);
          }
          return r.ok;
        };

        try {
          // ── 1. Email au manager : toutes les clés ──
          if (email) {
            const keyLines = [
              managerKey ? `🔑 <strong>Clé Manager :</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px">${managerKey.key}</code>` : "",
              ...commercialKeys.map((k,i) => {
                const assignedTo = k.email ? ` → <em>${k.email}</em>` : "";
                return `🔑 <strong>Clé Commercial ${i+1} :</strong> <code style="background:#fff;padding:2px 8px;border-radius:4px">${k.key}</code>${assignedTo}`;
              }),
            ].filter(Boolean).join("<br><br>");

            const ok = await sendEmail(
              [email],
              `🔑 Vos clés d'activation Prospeo${trialNote} — Pack ${qty} licences`,
              `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#FF4C1A">◈ Prospeo — Vos clés d'activation</h2>
                <p>Bonjour,</p>
                <p>Voici votre pack de <strong>${qty} licences</strong>${trialNote} :</p>
                <div style="background:#F5F0E8;border-radius:10px;padding:16px;margin:16px 0;line-height:2">
                  ${keyLines}
                </div>
                <p>📌 Activez votre licence Manager sur <a href="https://prospeo.me">prospeo.me</a> → onglet Abonnement.</p>
                <p>Partagez les clés Commerciaux à vos collaborateurs. Ils devront s'inscrire sur prospeo.me et entrer leur clé.</p>
                <p style="color:#888;font-size:12px">Expire le : ${expireStr}</p>
              </div>`
            );
            if (ok) emailSent = true;
          }

          // ── 2. Email individuel à chaque commercial pré-assigné ──
          for (const commKey of commercialKeys) {
            if (commKey.email) {
              await sendEmail(
                [commKey.email],
                `🔑 Votre licence Prospeo${trialNote} — Clé d'activation`,
                `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
                  <h2 style="color:#FF4C1A">◈ Prospeo — Votre licence</h2>
                  <p>Bonjour,</p>
                  <p>Votre manager vous a attribué une licence Prospeo${trialNote}. Voici votre clé d'activation :</p>
                  <div style="background:#F5F0E8;border-radius:10px;padding:20px;margin:16px 0;font-family:monospace;font-size:18px;text-align:center;letter-spacing:2px">
                    <strong>${commKey.key}</strong>
                  </div>
                  <p>👉 Inscrivez-vous sur <a href="https://prospeo.me">prospeo.me</a> puis entrez cette clé dans l'onglet <strong>Abonnement</strong>.</p>
                  <p style="color:#888;font-size:12px">Expire le : ${expireStr}</p>
                </div>`
              );
              await supabase.from("activation_keys").update({ email_sent: true }).eq("id", commKey.id);
            }
          }

          if (emailSent) {
            await supabase.from("activation_keys").update({ email_sent: true }).eq("batch_id", data[0]?.batch_id);
          }
        } catch(e) { console.error("Email error:", e); }
      }

      return res.status(200).json({
        success: true,
        keys: data.map(k => ({ key: k.key, type: k.key_type, batch: k.batch_id })),
        emailSent,
        message: `${qty} clé(s) générée(s)${emailSent ? " · email envoyé ✉️" : ""}`,
      });
    }

    // ── ADD LICENCES TO EXISTING COMPANY ──────────────────
    if (action === "addLicences") {
      const { companyId, quantity = 1, notes, trialDays = 0 } = req.body;
      if (!companyId) return res.status(400).json({ error: "companyId requis" });

      const qty = Math.max(1, parseInt(quantity));
      const expiresAt = new Date();
      if (trialDays > 0) {
        expiresAt.setDate(expiresAt.getDate() + trialDays);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }
      const keyPlan = trialDays > 0 ? "trial" : "annual";
      const trialSuffix = trialDays > 0 ? ` [ESSAI ${trialDays} jours]` : "";

      // Get existing batch_id for this company to keep them grouped
      const { data: existingKeys } = await supabase
        .from("activation_keys")
        .select("batch_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(1);

      const batchId = existingKeys?.[0]?.batch_id || crypto.randomUUID();

      // Add commercial licences only (manager already exists)
      const keysToInsert = [];
      for (let i = 0; i < qty; i++) {
        keysToInsert.push({
          key: genKey(),
          email: null,
          company_id: companyId,
          batch_id: batchId,
          key_type: "commercial",
          plan: keyPlan,
          notes: (notes || `Extension — Licence Commercial ${i + 1}`) + trialSuffix,
          expires_at: expiresAt.toISOString(),
        });
      }

      const { data, error } = await supabase
        .from("activation_keys")
        .insert(keysToInsert)
        .select();

      if (error) return res.status(500).json({ error: error.message });

      // Update company licence count
      await supabase
        .from("companies")
        .update({ licence_count: supabase.rpc ? undefined : undefined })
        .eq("id", companyId);

      // Get updated count
      const { data: allKeys } = await supabase
        .from("activation_keys")
        .select("id")
        .eq("company_id", companyId);

      await supabase
        .from("companies")
        .update({ licence_count: allKeys?.length || qty })
        .eq("id", companyId);

      return res.status(200).json({
        success: true,
        keys: data.map(k => ({ key: k.key, type: k.key_type, batch: k.batch_id })),
        message: `${qty} licence(s) Commercial ajoutée(s) au compte existant`,
      });
    }

    // ── GRANT LIFETIME LICENCE ─────────────────────────────
    if (action === "grantLifetime") {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId requis" });

      // Date très lointaine = à vie (année 2099)
      const lifetime = new Date("2099-12-31T23:59:59Z");

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        plan: "annual",
        status: "lifetime",
        current_period_end: lifetime.toISOString(),
        stripe_customer_id: null,
        stripe_sub_id: null,
      }, { onConflict: "user_id" });

      // Log dans les notes de la clé si besoin
      console.log(`♾️ Licence à vie attribuée à userId: ${userId}`);

      return res.status(200).json({
        success: true,
        message: "Licence gratuite à vie attribuée",
        expires: lifetime.toISOString(),
      });
    }

    // ── DISABLE ACCOUNT ────────────────────────────────────
    if (action === "disableAccount") {
      const { userId } = req.body;
      await supabase.from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", userId);
      return res.status(200).json({ success: true });
    }

    // ── EXTEND SUBSCRIPTION ────────────────────────────────
    if (action === "extendSubscription") {
      const { userId, months = 12 } = req.body;
      const { data: sub } = await supabase.from("subscriptions")
        .select("*").eq("user_id", userId).single();

      const base = sub?.current_period_end
        ? new Date(sub.current_period_end)
        : new Date();
      base.setMonth(base.getMonth() + months);

      await supabase.from("subscriptions").upsert({
        user_id: userId, plan: "annual", status: "active",
        current_period_end: base.toISOString(),
      }, { onConflict: "user_id" });

      return res.status(200).json({ success: true, new_end: base.toISOString() });
    }

    return res.status(400).json({ error: "Action inconnue" });

  } catch (err) {
    console.error("superadmin error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
