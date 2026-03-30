import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vérifie la signature Stripe avec crypto Node.js natif
function verifyStripeSignature(rawBody, sig, secret) {
  const parts = {};
  sig.split(",").forEach(part => {
    const [k, v] = part.split("=");
    if (k === "t")  parts.timestamp = v;
    if (k === "v1") parts.signature = v;
  });
  if (!parts.timestamp || !parts.signature) throw new Error("Invalid signature format");
  const payload  = `${parts.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  if (expected !== parts.signature) throw new Error("Signature mismatch");
  if (Math.abs(Date.now()/1000 - parseInt(parts.timestamp)) > 300) throw new Error("Timestamp too old");
}

export const config = { api: { bodyParser: false } };

function genKey() {
  const s = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `PROS-${s()}-${s()}-${s()}`;
}

async function getRawBody(req) {
  return new Promise((res, rej) => {
    let d = "";
    req.on("data", c => { d += c; });
    req.on("end", () => res(d));
    req.on("error", rej);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers["stripe-signature"];

  let event;
  try {
    verifyStripeSignature(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error("Webhook sig error:", err.message);
    return res.status(400).json({ error: err.message });
  }

  // ── Paiement réussi ────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session  = event.data.object;
    const { userId, email, quantity, companyName, isBulk } = session.metadata || {};
    const qty      = parseInt(quantity || "1");
    const batchId  = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 12 mois

    // ── Vérification idempotence — évite la double génération ──
    const { data: existingKeys } = await supabase
      .from("activation_keys")
      .select("id")
      .eq("stripe_session_id", session.id)
      .limit(1);

    if (existingKeys && existingKeys.length > 0) {
      console.log(`⚠️ Clés déjà générées pour session ${session.id} — ignoré`);
      return res.status(200).json({ received: true, skipped: "already_processed" });
    }

    try {
      if (qty === 1) {
        // ── 1 licence individuelle ──────────────────────────
        const key = genKey();

        // Créer l'entreprise même pour les licences individuelles
        let companyId = null;
        if (companyName) {
          const { data: company } = await supabase.from("companies").insert({
            name: companyName,
            email: email || session.customer_email,
            licence_count: 1,
            stripe_session_id: session.id,
            stripe_customer_id: session.customer || null,
          }).select().single();
          companyId = company?.id;
        }

        await supabase.from("activation_keys").insert({
          key, email: email || session.customer_email,
          key_type: "individual", plan: "annual",
          batch_id: batchId,
          company_id: companyId,
          stripe_session_id: session.id,
          notes: `Achat Stripe annuel${companyName ? " — " + companyName : ""}`,
          expires_at: expiresAt.toISOString(),
        });

        if (userId) {
          await supabase.from("subscriptions").upsert({
            user_id: userId, plan: "annual", status: "active",
            stripe_customer_id: session.customer,
            stripe_sub_id: session.subscription || null,
            current_period_end: expiresAt.toISOString(),
          }, { onConflict: "user_id" });
        }

        console.log(`✅ KEY individuelle: ${key} → ${email}`);

        // ── Email au client avec sa clé ──
        if (process.env.RESEND_API_KEY && (email || session.customer_email)) {
          const toEmail = email || session.customer_email;
          const expireStr = expiresAt.toLocaleDateString("fr-FR");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "Prospeo <contact@prospeo.me>",
              to: [toEmail],
              bcc: ["contact@synermo.fr"],
              subject: "🔑 Votre licence Prospeo — Clé d'activation",
              html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
                <h2 style="color:#FF4C1A">◈ Prospeo — Votre licence</h2>
                <p>Bonjour,</p>
                <p>Merci pour votre achat ! Voici votre clé d'activation Prospeo :</p>
                <div style="background:#F5F0E8;border-radius:10px;padding:20px;margin:16px 0;font-family:monospace;font-size:18px;text-align:center;letter-spacing:2px">
                  <strong>${key}</strong>
                </div>
                <p>👉 Connectez-vous sur <a href="https://prospeo.me">prospeo.me</a> puis entrez cette clé dans l'onglet <strong>⭐ Abonnement</strong>.</p>
                <p style="color:#888;font-size:12px">Expire le : ${expireStr}</p>
              </div>`,
            }),
          }).catch(e => console.error("Email error:", e.message));
        }

      } else {
        // ── N licences groupées ─────────────────────────────
        // Créer l'entreprise
        const { data: company } = await supabase.from("companies").insert({
          name: companyName || `Entreprise ${email}`,
          email: email || session.customer_email,
          licence_count: qty,
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null,
        }).select().single();

        const companyId = company?.id;

        // 1 clé Manager + (qty-1) clés Commerciaux
        const keys = [];
        keys.push({
          key: genKey(), email: email || session.customer_email,
          company_id: companyId, batch_id: batchId,
          key_type: "manager", plan: "annual",
          stripe_session_id: session.id,
          notes: `Pack ${qty} licences — Manager`,
          expires_at: expiresAt.toISOString(),
        });

        for (let i = 1; i < qty; i++) {
          keys.push({
            key: genKey(), email: null,
            company_id: companyId, batch_id: batchId,
            key_type: "commercial", plan: "annual",
            stripe_session_id: session.id,
            notes: `Pack ${qty} licences — Commercial ${i}`,
            expires_at: expiresAt.toISOString(),
          });
        }

        await supabase.from("activation_keys").insert(keys);
        console.log(`✅ ${qty} KEYs générées pour ${email} (batch: ${batchId})`);

        // ── Email au manager avec toutes les clés ──
        if (process.env.RESEND_API_KEY && (email || session.customer_email)) {
          const toEmail = email || session.customer_email;
          const expireStr = expiresAt.toLocaleDateString("fr-FR");
          const keyLines = keys.map((k, i) => {
            const label = k.key_type === "manager" ? "🔑 Clé Manager" : `🔑 Clé Commercial ${i}`;
            return `${label} : <code style="background:#fff;padding:2px 8px;border-radius:4px">${k.key}</code>`;
          }).join("<br><br>");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "Prospeo <contact@prospeo.me>",
              to: [toEmail],
              bcc: ["contact@synermo.fr"],
              subject: `🔑 Vos ${qty} licences Prospeo — Clés d'activation`,
              html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#FF4C1A">◈ Prospeo — Vos ${qty} licences</h2>
                <p>Bonjour,</p>
                <p>Merci pour votre achat ! Voici votre pack de <strong>${qty} licences</strong> :</p>
                <div style="background:#F5F0E8;border-radius:10px;padding:16px;margin:16px 0;line-height:2">
                  ${keyLines}
                </div>
                <p>📌 Activez votre licence Manager sur <a href="https://prospeo.me">prospeo.me</a> → onglet ⭐ Abonnement.</p>
                <p>Partagez les clés Commerciaux à vos collaborateurs.</p>
                <p style="color:#888;font-size:12px">Expire le : ${expireStr}</p>
              </div>`,
            }),
          }).catch(e => console.error("Email bulk error:", e.message));
        }
      }
    } catch (err) {
      console.error("Erreur génération KEYs:", err.message);
    }
  }

  // ── Renouvellement / mise à jour abonnement ───────────────
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    if (sub.status === "active") {
      const periodEnd = new Date(sub.current_period_end * 1000);
      await supabase.from("subscriptions")
        .update({ status: "active", current_period_end: periodEnd.toISOString() })
        .eq("stripe_sub_id", sub.id);
    }
  }

  // ── Abonnement annulé ──────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_sub_id", sub.id);
  }

  return res.status(200).json({ received: true });
}
