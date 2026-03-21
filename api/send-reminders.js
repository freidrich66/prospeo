import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Email HTML template ────────────────────────────────────
function buildEmail(profile, daysLeft, subscribeUrl) {
  const isLastDay = daysLeft <= 1;
  const color = isLastDay ? "#FF2D2D" : "#FF9500";
  const subject = isLastDay
    ? "⚠️ Votre essai Prospeo expire demain"
    : `⏳ Plus que ${daysLeft} jours d'essai gratuit sur Prospeo`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#1A1A1A;padding:28px 32px;text-align:center;">
      <div style="font-size:36px;color:#FF4C1A;margin-bottom:6px;">◈</div>
      <div style="font-size:22px;font-weight:700;color:#E8E0D4;letter-spacing:3px;">PROSPEO</div>
    </div>

    <!-- Alert bar -->
    <div style="background:${color};padding:14px 32px;text-align:center;">
      <div style="font-size:15px;font-weight:700;color:#fff;">
        ${isLastDay ? "⚠️ Votre essai expire demain" : `⏳ ${daysLeft} jours d'essai restants`}
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;color:#1A1A1A;margin:0 0 16px;">Bonjour ${profile.first_name || profile.full_name || ""},</p>
      
      <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 20px;">
        ${isLastDay
          ? "Votre période d'essai gratuite de Prospeo <strong>expire demain</strong>. Pour ne pas perdre l'accès à vos prospects et continuer à prospecter efficacement, abonnez-vous maintenant."
          : `Il vous reste <strong>${daysLeft} jours</strong> pour profiter gratuitement de Prospeo. Après cette période, vous devrez vous abonner pour continuer à utiliser l'application.`
        }
      </p>

      <!-- Features reminder -->
      <div style="background:#F5F0E8;border-radius:10px;padding:16px;margin:0 0 24px;">
        <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Ce que vous perdrez sans abonnement</div>
        ${["📇 Scan de cartes de visite par IA", "🎙️ Saisie vocale", "✨ Synthèses IA", "📊 Rapports et exports Excel", "👥 Gestion d'équipe"].map(f =>
          `<div style="font-size:13px;color:#444;margin-bottom:6px;">${f}</div>`
        ).join("")}
      </div>

      <!-- Price -->
      <div style="text-align:center;margin:0 0 24px;">
        <div style="font-size:40px;font-weight:700;color:#FF4C1A;line-height:1;">4,99€</div>
        <div style="font-size:14px;color:#888;">HT / mois · facturé 59,88€ HT/an</div>
        <div style="font-size:12px;color:#aaa;margin-top:4px;">Engagement 12 mois · Vos données sont conservées</div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="${subscribeUrl}" style="display:inline-block;background:#FF4C1A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.5px;">
          S'abonner maintenant →
        </a>
      </div>

      <p style="font-size:12px;color:#aaa;text-align:center;margin-top:20px;">
        Vos données sont en sécurité et seront conservées même après expiration.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F5F0E8;padding:16px 32px;text-align:center;border-top:1px solid #E8E0D4;">
      <div style="font-size:11px;color:#aaa;">Prospeo · ${profile.email}</div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

// ── Send email via Resend (ou autre service) ───────────────
async function sendEmail(to, subject, html) {
  // Utilise Resend si configuré, sinon log uniquement
  if (!process.env.RESEND_API_KEY) {
    console.log(`📧 [EMAIL SIMULÉ] À: ${to} | Sujet: ${subject}`);
    return { ok: true, simulated: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Prospeo <noreply@prospeo.app>",
      to: [to],
      subject,
      html,
    }),
  });

  return { ok: res.ok, status: res.status };
}

// ── Main handler ───────────────────────────────────────────
export default async function handler(req, res) {
  // Sécurité : vérifier le secret cron
  const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const now   = new Date();
    const sent  = [];
    const errors = [];

    // Chercher les abonnements en trial qui expirent dans 1 ou 3 jours
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*, profiles:user_id(id, email, first_name, full_name)")
      .eq("status", "trial");

    for (const sub of subs || []) {
      const profile   = sub.profiles;
      if (!profile?.email) continue;

      const trialEnd  = new Date(sub.trial_ends_at);
      const diffMs    = trialEnd - now;
      const diffDays  = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Envoyer uniquement pour J-3 et J-1
      if (diffDays !== 3 && diffDays !== 1) continue;

      const subscribeUrl = `${process.env.APP_URL || "https://prospeo-red.vercel.app"}`;
      const { subject, html } = buildEmail(profile, diffDays, subscribeUrl);

      const result = await sendEmail(profile.email, subject, html);

      if (result.ok) {
        sent.push({ email: profile.email, daysLeft: diffDays });
        console.log(`✅ Rappel envoyé à ${profile.email} (J-${diffDays})`);
      } else {
        errors.push({ email: profile.email, error: result.status });
      }
    }

    return res.status(200).json({
      success: true,
      sent:    sent.length,
      errors:  errors.length,
      details: sent,
    });

  } catch (err) {
    console.error("send-reminders error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
