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
    const { key, userId } = req.body;
    if (!key || !userId) return res.status(400).json({ error: "key et userId requis" });

    const cleanKey = key.trim().toUpperCase();

    const { data: keyData } = await supabase
      .from("activation_keys").select("*").eq("key", cleanKey).single();

    if (!keyData)           return res.status(404).json({ error: "Clé introuvable" });
    if (keyData.used)       return res.status(400).json({ error: "Clé déjà utilisée" });
    if (new Date(keyData.expires_at) < new Date())
                            return res.status(400).json({ error: "Clé expirée" });

    // Marquer la clé utilisée
    await supabase.from("activation_keys")
      .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq("key", cleanKey);

    // Calculer la date de fin (12 mois)
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    // Mettre à jour le rôle si clé manager
    if (keyData.key_type === "manager") {
      await supabase.from("profiles")
        .update({ role: "manager", company_id: keyData.company_id })
        .eq("id", userId);
    }

    // Activer l'abonnement
    await supabase.from("subscriptions").upsert({
      user_id: userId,
      company_id: keyData.company_id || null,
      plan: "annual",
      status: "active",
      current_period_end: periodEnd.toISOString(),
    }, { onConflict: "user_id" });

    return res.status(200).json({
      success: true,
      key_type: keyData.key_type,
      expires_at: periodEnd.toISOString(),
      message: `✅ Abonnement annuel activé — valable jusqu'au ${periodEnd.toLocaleDateString("fr-FR")}`,
    });

  } catch (err) {
    console.error("activate-key error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
