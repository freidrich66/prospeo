import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { key, userId, email } = req.body;
    if (!key || !userId) return res.status(400).json({ error: "key et userId requis" });

    const keyUpper = key.trim().toUpperCase();

    // ── 1. Chercher la clé ──────────────────────────────────
    const { data: keyData, error: keyErr } = await supabase
      .from("activation_keys")
      .select("*")
      .eq("key", keyUpper)
      .single();

    if (keyErr || !keyData) {
      return res.status(404).json({ error: "Clé invalide ou introuvable" });
    }

    // ── 2. Vérifications ────────────────────────────────────
    if (keyData.used) {
      return res.status(400).json({ error: "Cette clé a déjà été utilisée" });
    }

    if (keyData.suspended) {
      return res.status(403).json({ error: "Cette licence est suspendue. Contactez votre administrateur." });
    }

    if (new Date(keyData.expires_at) < new Date()) {
      return res.status(400).json({ error: "Cette clé a expiré" });
    }

    // ── 3. Marquer la clé comme utilisée ────────────────────
    await supabase
      .from("activation_keys")
      .update({ used: true, used_by: userId, used_at: new Date().toISOString(), email: email || keyData.email })
      .eq("id", keyData.id);

    // ── 4. Déterminer le rôle selon le type de clé ──────────
    let role = "commercial";
    if (keyData.key_type === "manager")    role = "manager";
    if (keyData.key_type === "individual") role = "commercial";

    // Mettre à jour le rôle dans profiles
    await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    // ── 5. Rattachement manager_id auto (si clé commercial) ─
    if (keyData.key_type === "commercial" && keyData.batch_id) {
      // Trouver le manager du même batch
      const { data: managerKey } = await supabase
        .from("activation_keys")
        .select("used_by")
        .eq("batch_id", keyData.batch_id)
        .eq("key_type", "manager")
        .eq("used", true)
        .single();

      if (managerKey?.used_by) {
        await supabase
          .from("profiles")
          .update({ manager_id: managerKey.used_by })
          .eq("id", userId);
      }
    }

    // ── 6. Créer ou mettre à jour l'abonnement ──────────────
    const plan   = keyData.plan || "annual";
    const status = plan === "trial" ? "trial" : plan === "free" ? "lifetime" : "active";

    // Supprimer l'ancienne subscription d'essai pour forcer la mise à jour complète
    await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", userId);

    const subData = {
      user_id:            userId,
      plan:               plan === "trial" ? "trial" : "annual",
      status,
      current_period_end: keyData.expires_at,
      stripe_customer_id: null,
      stripe_sub_id:      null,
      trial_ends_at:      plan === "trial" ? keyData.expires_at : null,
    };

    const { error: subErr } = await supabase
      .from("subscriptions")
      .insert(subData);

    if (subErr) {
      console.error("Subscription insert error:", subErr.message);
      // Fallback: try upsert
      await supabase
        .from("subscriptions")
        .upsert({ ...subData }, { onConflict: "user_id" });
    }

    console.log(`✅ Clé activée: ${keyUpper} → userId:${userId} role:${role} plan:${plan}`);

    return res.status(200).json({
      success: true,
      message: `Licence activée avec succès — ${role === "manager" ? "Compte Manager" : "Compte Commercial"}`,
      role,
      plan,
      expires_at: keyData.expires_at,
    });

  } catch (err) {
    console.error("activate-key error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
