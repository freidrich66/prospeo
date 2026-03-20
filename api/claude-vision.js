export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API Anthropic manquante" });

  try {
    const { base64, mediaType } = req.body;
    if (!base64 || !mediaType) return res.status(400).json({ error: "base64 et mediaType requis" });

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
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Tu es un expert en lecture de cartes de visite professionnelles.
Analyse cette image avec attention, même si la police est décorative, manuscrite, stylisée ou difficile à lire.
Essaie de déchiffrer au maximum les informations visibles.

Extrais ces informations et retourne UNIQUEMENT ce JSON (string vide si vraiment illisible) :
{"first_name":"","last_name":"","company":"","role":"","email":"","phone":""}

Conseils :
- Le nom complet est souvent le plus grand texte
- L'email contient toujours @ et un point
- Le téléphone peut être au format +33, 06, 07, etc.
- La société peut être un logo-texte en haut ou en bas
- Le poste/rôle est souvent sous le nom

Pas d'explication, pas de markdown, juste le JSON brut.`,
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Anthropic vision error:", response.status, JSON.stringify(data));
      return res.status(response.status).json({ error: data?.error?.message || "Erreur Anthropic" });
    }
    return res.status(200).json(data);

  } catch (err) {
    console.error("claude-vision error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
