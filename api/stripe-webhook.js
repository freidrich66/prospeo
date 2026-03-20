import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
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
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
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

    try {
      if (qty === 1) {
        // ── 1 licence individuelle ──────────────────────────
        const key = genKey();
        await supabase.from("activation_keys").insert({
          key, email: email || session.customer_email,
          key_type: "individual", plan: "annual",
          batch_id: batchId,
          stripe_session_id: session.id,
          notes: "Achat individuel 35,88€/an",
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
      }
    } catch (err) {
      console.error("Erreur génération KEYs:", err.message);
    }
  }

  // ── Renouvellement abonnement annuel ───────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    if (invoice.subscription) {
      try {
        const sub     = await stripe.subscriptions.retrieve(invoice.subscription);
        const periodEnd = new Date(sub.current_period_end * 1000);
        await supabase.from("subscriptions")
          .update({ status: "active", current_period_end: periodEnd.toISOString() })
          .eq("stripe_sub_id", invoice.subscription);
      } catch (err) { console.error("Erreur renouvellement:", err.message); }
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
