import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = { api: { bodyParser: false } };

function genKey() {
  const s = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `PROS-${s()}-${s()}-${s()}`;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  console.log("🔔 Webhook reçu — méthode:", req.method);
  
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("📦 Body length:", rawBody.length);
  console.log("🔑 Signature présente:", !!sig);
  console.log("🔐 Secret présent:", !!secret);

  // Parse event — vérification signature optionnelle si secret absent
  let event;
  try {
    if (secret && sig) {
      // Vérification signature
      const parts = {};
      sig.split(",").forEach(part => {
        const [k, v] = part.split("=");
        if (k === "t")  parts.timestamp = v;
        if (k === "v1") parts.signature = v;
      });
      const payload  = `${parts.timestamp}.${rawBody}`;
      const expected = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
      if (expected !== parts.signature) {
        console.error("❌ Signature invalide");
        return res.status(400).json({ error: "Invalid signature" });
      }
      console.log("✅ Signature valide");
    }
    event = JSON.parse(rawBody);
    console.log("📨 Event type:", event.type);
  } catch (err) {
    console.error("❌ Parse error:", err.message);
    return res.status(400).json({ error: err.message });
  }

  // ── Paiement réussi ──────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session  = event.data.object;
    const { userId, email, quantity, companyName } = session.metadata || {};
    const qty      = parseInt(quantity || "1");
    const batchId  = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    console.log(`💳 Checkout completed — email:${email} qty:${qty} userId:${userId}`);

    try {
      if (qty === 1) {
        const key = genKey();
        const { error } = await supabase.from("activation_keys").insert({
          key,
          email: email || session.customer_email,
          key_type: "individual",
          plan: "annual",
          batch_id: batchId,
          stripe_session_id: session.id,
          notes: "Achat Stripe annuel",
          expires_at: expiresAt.toISOString(),
        });
        if (error) console.error("❌ Supabase insert error:", error.message);

        if (userId) {
          const { error: subErr } = await supabase.from("subscriptions").upsert({
            user_id: userId,
            plan: "annual",
            status: "active",
            stripe_customer_id: session.customer,
            stripe_sub_id: session.subscription || null,
            current_period_end: expiresAt.toISOString(),
          }, { onConflict: "user_id" });
          if (subErr) console.error("❌ Supabase subscription error:", subErr.message);
        }

        console.log(`✅ Clé générée: ${key} → ${email}`);

        // Email avec la clé
        if (process.env.RESEND_API_KEY) {
          const toEmail = email || session.customer_email;
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: "Prospeo <contact@prospeo.me>",
              to: [toEmail],
              bcc: ["contact@synermo.fr"],
              subject: "🔑 Votre licence Prospeo — Clé d'activation",
              html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
                <h2 style="color:#FF4C1A">◈ Prospeo — Votre licence</h2>
                <p>Bonjour,</p>
                <p>Merci pour votre achat ! Voici votre clé d'activation :</p>
                <div style="background:#F5F0E8;border-radius:10px;padding:20px;margin:16px 0;font-family:monospace;font-size:18px;text-align:center;letter-spacing:2px">
                  <strong>${key}</strong>
                </div>
                <p>👉 Connectez-vous sur <a href="https://prospeo.me">prospeo.me</a> → onglet <strong>⭐ Abonnement</strong> → entrez votre clé.</p>
                <p style="color:#888;font-size:12px">Expire le : ${expiresAt.toLocaleDateString("fr-FR")}</p>
              </div>`,
            }),
          }).catch(e => console.error("Email error:", e.message));
          console.log("✉️ Email envoyé à", toEmail);
        }

      } else {
        // Pack multi-licences
        const { data: company } = await supabase.from("companies").insert({
          name: companyName || `Entreprise ${email}`,
          email: email || session.customer_email,
          licence_count: qty,
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null,
        }).select().single();

        const keys = [];
        keys.push({
          key: genKey(), email: email || session.customer_email,
          company_id: company?.id, batch_id: batchId,
          key_type: "manager", plan: "annual",
          stripe_session_id: session.id,
          notes: `Pack ${qty} licences — Manager`,
          expires_at: expiresAt.toISOString(),
        });
        for (let i = 1; i < qty; i++) {
          keys.push({
            key: genKey(), email: null,
            company_id: company?.id, batch_id: batchId,
            key_type: "commercial", plan: "annual",
            stripe_session_id: session.id,
            notes: `Pack ${qty} licences — Commercial ${i}`,
            expires_at: expiresAt.toISOString(),
          });
        }
        const { error } = await supabase.from("activation_keys").insert(keys);
        if (error) console.error("❌ Supabase bulk insert error:", error.message);
        console.log(`✅ ${qty} clés générées pour ${email}`);
      }
    } catch (err) {
      console.error("❌ Erreur génération:", err.message);
    }
  }

  // ── Renouvellement ───────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    if (sub.status === "active") {
      const periodEnd = new Date(sub.current_period_end * 1000);
      await supabase.from("subscriptions")
        .update({ status: "active", current_period_end: periodEnd.toISOString() })
        .eq("stripe_sub_id", sub.id);
      console.log("🔄 Abonnement renouvelé:", sub.id);
    }
  }

  // ── Annulation ───────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_sub_id", sub.id);
    console.log("❌ Abonnement annulé:", sub.id);
  }

  return res.status(200).json({ received: true });
}
