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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Auth-Prüfung: nur angemeldete ImmoHub-Nutzer dürfen die KI-Analyse nutzen ---
  // (vorher war die Function ein offener Proxy: jeder mit der URL konnte auf
  // Kosten des ANTHROPIC_API_KEY Anfragen stellen)
  const SUPABASE_URL = 'https://gcotfldbnuatkewauvhv.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb3RmbGRibnVhdGtld2F1dmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzM5ODgsImV4cCI6MjA4NDk0OTk4OH0.OvK6e9owY_zRKsxkcAEHcuVRlcMUvmrMOVez_hmuTcM';
  const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!authToken) {
    return res.status(401).json({ error: 'Nicht angemeldet – bitte in ImmoHub einloggen.' });
  }
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Sitzung abgelaufen – bitte neu anmelden.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Auth-Prüfung fehlgeschlagen' });
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

    // Modell per Vercel-Umgebungsvariable ANALYZE_MODEL übersteuerbar — wird ein
    // Modell von Anthropic abgeschaltet (wie claude-sonnet-4-20250514 im Juni 2026),
    // genügt künftig eine Env-Var-Änderung statt eines Code-Deploys.
    const model = process.env.ANALYZE_MODEL || 'claude-sonnet-5';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
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
