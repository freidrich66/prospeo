export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API Anthropic manquante — ajoutez VITE_ANTHROPIC_API_KEY dans Vercel" });

  try {
    const { messages } = req.body;
    if (!messages) return res.status(400).json({ error: "Paramètre messages manquant" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1000,
        messages,
      }),
    });

    const data = await response.json();

    // Si Anthropic retourne une erreur, la transmettre clairement
    if (!response.ok) {
      console.error("Erreur Anthropic:", response.status, JSON.stringify(data));
      return res.status(response.status).json({ 
        error: data?.error?.message || "Erreur API Anthropic : " + response.status 
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erreur serveur claude:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
