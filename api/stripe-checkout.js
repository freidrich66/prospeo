import Stripe from "stripe";

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL;
const APP_URL   = process.env.APP_URL || "https://prospeo-red.vercel.app";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, userId, quantity = 1, companyName } = req.body;
    if (!email) return res.status(400).json({ error: "email requis" });

    const qty       = Math.max(1, parseInt(quantity));
    const unitPrice = 5988; // 59,88€ HT/licence en centimes // 59,88€ HT/licence en centimes

    let sessionParams;

    if (qty === 1) {
      // Licence individuelle → abonnement récurrent annuel
      sessionParams = {
        mode: "subscription",
        customer_email: email,
        line_items: [{ price: PRICE_ANNUAL, quantity: 1 }],
        metadata: { userId: userId || "", email, quantity: "1", companyName: "" },
        success_url: `${APP_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}/?payment=cancelled`,
        locale: "fr",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
      };
    } else {
      // Achat groupé → paiement unique
      sessionParams = {
        mode: "payment",
        customer_email: email,
        line_items: [{
          price_data: {
            currency: "eur",
            unit_amount: unitPrice,
            product_data: {
              name: `Prospeo — ${qty} licences annuelles`,
              description: `${qty} licences annuelles — 1 Manager + ${qty - 1} Commercial(aux) — 12 mois`,
            },
          },
          quantity: qty,
        }],
        metadata: {
          userId: userId || "",
          email,
          quantity: String(qty),
          companyName: companyName || "",
          isBulk: "true",
        },
        success_url: `${APP_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}/?payment=cancelled`,
        locale: "fr",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
