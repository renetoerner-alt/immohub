// Vercel Serverless Function für KI-Dokument-Analyse
// Datei: api/analyze.js
// Unterstützt: Bilder (PNG, JPG, WEBP, GIF) und PDFs

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

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
      return res.status(400).json({ error: 'Dokument und Prompt erforderlich' });
    }

    // Bestimme den Content-Typ basierend auf mimeType
    const isPDF = mimeType === 'application/pdf';
    const isExcel = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                   mimeType === 'application/vnd.ms-excel' ||
                   mimeType === 'application/vnd.apple.numbers';
    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);

    let content;

    if (isPDF) {
      // PDF als Dokument senden
      content = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: image
          }
        },
        {
          type: 'text',
          text: systemPrompt
        }
      ];
    } else if (isExcel) {
      // Excel/Numbers: Als Text-Anfrage senden mit Hinweis
      // Anthropic unterstützt keine direkten Excel-Dateien, 
      // daher Fehlermeldung mit Tipp
      return res.status(400).json({ 
        error: 'Excel/Numbers-Dateien werden nicht direkt unterstützt. Bitte als PDF exportieren oder Screenshot erstellen.' 
      });
    } else if (isImage) {
      // Bild senden
      content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: image
          }
        },
        {
          type: 'text',
          text: systemPrompt
        }
      ];
    } else {
      return res.status(400).json({ 
        error: `Dateityp nicht unterstützt: ${mimeType}. Erlaubt sind: PDF, PNG, JPG, WEBP, GIF` 
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: content
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
