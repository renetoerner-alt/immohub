// Vercel Serverless Function für KI-Dokument-Analyse
// Datei: api/analyze.js

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key nicht konfiguriert' });
  }

  try {
    const { image, mimeType, systemPrompt } = req.body;

    if (!image || !systemPrompt) {
      return res.status(400).json({ error: 'Bild und Prompt erforderlich' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/png',
                data: image
              }
            },
            {
              type: 'text',
              text: systemPrompt
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Anthropic API Error:', data.error);
      return res.status(500).json({ error: data.error.message || 'API Fehler' });
    }

    // Extrahiere den Text aus der Antwort
    const text = data.content?.[0]?.text || '';
    
    return res.status(200).json({ text });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: error.message || 'Server Fehler' });
  }
}
