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
      const { quantity = 1, email, companyName, notes, trialDays = 0 } = req.body;
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
        // Commercial keys
        for (let i = 1; i < qty; i++) {
          keysToInsert.push({
            key: genKey(), email: null,
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

      return res.status(200).json({
        success: true,
        keys: data.map(k => ({ key: k.key, type: k.key_type, batch: k.batch_id })),
        message: `${qty} clé(s) générée(s) avec succès`,
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
