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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId requis" });

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!sub) {
      // Pas d'abonnement → créer un trial
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      const { data: newSub } = await supabase
        .from("subscriptions")
        .insert({ user_id: userId, plan: "trial", status: "trial", trial_ends_at: trialEnd.toISOString() })
        .select()
        .single();
      return res.status(200).json({ subscription: newSub });
    }

    // Vérifier si le trial a expiré
    if (sub.status === "trial" && new Date(sub.trial_ends_at) < new Date()) {
      await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
      sub.status = "expired";
    }

    // Vérifier si l'abonnement payant a expiré
    if (sub.status === "active" && sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
      await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
      sub.status = "expired";
    }

    return res.status(200).json({ subscription: sub });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
