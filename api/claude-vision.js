export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API Anthropic manquante sur le serveur" });

  try {
    const { base64, mediaType } = req.body;

    if (!base64 || !mediaType) {
      return res.status(400).json({ error: "base64 et mediaType requis" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: `Analyse cette carte de visite et extrais les informations de contact. Retourne UNIQUEMENT un objet JSON avec ces champs (string vide si absent) :
{"first_name":"","last_name":"","company":"","role":"","email":"","phone":""}
Pas d'explication, pas de markdown, juste le JSON brut.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
