import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from 'react';

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
const SUPABASE_URL = 'https://gcotfldbnuatkewauvhv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb3RmbGRibnVhdGtld2F1dmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzM5ODgsImV4cCI6MjA4NDk0OTk4OH0.OvK6e9owY_zRKsxkcAEHcuVRlcMUvmrMOVez_hmuTcM';
const FIRST_USER_EMAIL = 'renetoerner@gmail.com';

const supabase = {
  auth: {
    getSession: async () => {
      const token = localStorage.getItem('sb_access_token');
      const user = localStorage.getItem('sb_user');
      if (token && user) return { data: { session: { access_token: token, user: JSON.parse(user) } }, error: null };
      return { data: { session: null }, error: null };
    },
    signUp: async ({ email, password }) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ email, password, data: {} }),
        });
        const data = await res.json();
        if (data.error || data.msg || data.code) return { data: null, error: { message: data.error_description || data.msg || data.error || 'Registrierung fehlgeschlagen' } };
        if (data.user || data.id) {
          const user = data.user || data;
          if (data.access_token) {
            localStorage.setItem('sb_access_token', data.access_token);
            localStorage.setItem('sb_refresh_token', data.refresh_token);
            localStorage.setItem('sb_user', JSON.stringify(user));
          }
          return { data: { user }, error: null };
        }
        return { data: null, error: { message: 'Unerwartete Antwort vom Server' } };
      } catch (err) { return { data: null, error: { message: err.message } }; }
    },
    signInWithPassword: async ({ email, password }) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.error || !data.access_token) return { data: null, error: { message: data.error_description || data.msg || 'Anmeldung fehlgeschlagen' } };
        localStorage.setItem('sb_access_token', data.access_token);
        localStorage.setItem('sb_refresh_token', data.refresh_token);
        localStorage.setItem('sb_user', JSON.stringify(data.user));
        return { data: { user: data.user }, error: null };
      } catch (err) { return { data: null, error: { message: err.message } }; }
    },
    signOut: async () => {
      localStorage.removeItem('sb_access_token');
      localStorage.removeItem('sb_refresh_token');
      localStorage.removeItem('sb_user');
      return { error: null };
    },
    resetPasswordForEmail: async (email) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ email }),
        });
        if (res.ok) return { error: null };
        const data = await res.json();
        return { error: { message: data.error_description || 'Fehler beim Zurücksetzen' } };
      } catch (err) { return { error: { message: err.message } }; }
    },
  },
  from: (table) => ({
    select: (cols = '*') => ({
      eq: (col, val) => ({
        single: async () => {
          try {
            const token = localStorage.getItem('sb_access_token');
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${cols}&${col}=eq.${val}&limit=1`, {
              headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            return { data: data[0] || null, error: null };
          } catch (err) { return { data: null, error: err }; }
        },
      }),
    }),
    insert: (rows) => ({
      select: () => ({
        single: async () => {
          try {
            const token = localStorage.getItem('sb_access_token');
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=representation' },
              body: JSON.stringify(rows),
            });
            const data = await res.json();
            if (!res.ok) return { data: null, error: { message: data.message || 'Insert failed' } };
            return { data: Array.isArray(data) ? data[0] : data, error: null };
          } catch (err) { return { data: null, error: err }; }
        },
      }),
    }),
    update: (updates) => ({
      eq: (col, val) => ({
        select: () => ({
          single: async () => {
            try {
              const token = localStorage.getItem('sb_access_token');
              const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=representation' },
                body: JSON.stringify(updates),
              });
              const data = await res.json();
              if (!res.ok) return { data: null, error: { message: data.message || 'Update failed' } };
              return { data: Array.isArray(data) ? data[0] : data, error: null };
            } catch (err) { return { data: null, error: err }; }
          },
        }),
      }),
    }),
  }),
};

// ============================================================================
// AUTH CONTEXT
// ============================================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (data?.user) setUser(data.user);
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.user) setUser(data.user);
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const resetPassword = async (email) => {
    return await supabase.auth.resetPasswordForEmail(email);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

// Formatierung
const fmt = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtD = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v || 0);
const fmtP = (v) => new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 2 }).format(v || 0);
const fmtPlain = (v) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

// Immobilien-Typ Farben
const TYP_COLORS = {
  etw: { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#818cf8' },   // Lila - ETW
  efh: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399' },   // Grün - EFH
  mfh: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24' },   // Orange - MFH
  gewerbe: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#f472b6' }, // Pink - Gewerbe
  grundstueck: { bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8', text: '#94a3b8' } // Silber/Grau - Grundstück
};

// Labels für Typ-Badges (kompakte Anzeige)
const TYP_LABELS = {
  etw: 'ETW',
  efh: 'EFH',
  mfh: 'MFH',
  gewerbe: 'GEWERBE',
  grundstueck: 'GRUNDST'
};

const getTypLabel = (typ) => TYP_LABELS[typ] || typ?.toUpperCase() || '';

// Export Funktion - erstellt druckbare Ansicht in iframe
const generateExport = (data, containerRef) => {
  const { s, c, yr, yd, afaG, afaS, afaTot, wkTot, ein, erg, stEff, gwg, ga, BUNDESLAENDER } = data;
  
  // Formatierung
  const f = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
  const f2 = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v || 0);
  const fp = (v) => new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 2 }).format(v || 0);
  
  const html = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 10px; line-height: 1.4; color: #1a1a1a; padding: 15px; background: #fff; }
      .header { background: #6366f1; color: white; padding: 15px 20px; text-align: center; margin-bottom: 15px; }
      .header h1 { font-size: 14px; margin-bottom: 3px; }
      .header p { font-size: 10px; opacity: 0.9; }
      .section { margin-bottom: 12px; }
      .section h2 { font-size: 10px; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; }
      th, td { padding: 4px 6px; text-align: left; border-bottom: 1px solid #e5e5e5; }
      th { background: #f5f5f5; font-size: 8px; text-transform: uppercase; color: #666; }
      .val { text-align: right; font-family: monospace; }
      .note { font-size: 8px; color: #888; }
      .hl td { background: #f0f0ff; font-weight: bold; }
      .accent td { background: #6366f1; color: white; }
      .neg { color: #dc2626; }
      .summary { background: #fafafa; padding: 10px; margin-top: 10px; }
      .cols { display: flex; gap: 10px; }
      .col { flex: 1; background: white; border: 1px solid #e5e5e5; padding: 8px; }
      .result-box { text-align: center; padding: 12px; margin-top: 10px; border-radius: 4px; }
      .result-box.profit { background: #dcfce7; }
      .result-box.loss { background: #fee2e2; }
      .result-box .label { font-size: 9px; color: #666; }
      .result-box .value { font-size: 18px; font-weight: bold; font-family: monospace; margin: 5px 0; }
      .result-box.profit .value { color: #166534; }
      .result-box.loss .value { color: #991b1b; }
      .footer { text-align: center; padding: 15px 0 5px; color: #888; font-size: 8px; border-top: 1px solid #e5e5e5; margin-top: 15px; }
    </style>
  
  <div class="header">
    <h1>${s.typ.toUpperCase()}, ${s.adresse || 'Keine Adresse'}</h1>
    <p>${s.name}${s.eigentuemer ? ` · Eigentümer: ${s.eigentuemer}` : ''}</p>
  </div>
  
  <div class="section">
    <h2>Grunddaten</h2>
    <table>
      <tr><td>Kaufpreis der Immobilie</td><td class="val">${f(s.kaufpreisImmobilie)}</td><td></td></tr>
      ${s.bodenrichtwert > 0 ? `<tr><td>Bodenrichtwert pro qm Grundstück</td><td class="val">${f(s.bodenrichtwert)}</td><td class="note">Grundstückswert: ${f(gwg)}</td></tr>` : ''}
      ${s.grundstueckGroesse > 0 ? `<tr><td>Grundstücksgröße</td><td class="val">${s.grundstueckGroesse} qm</td><td></td></tr>` : ''}
      ${s.kaufpreisStellplatz > 0 ? `<tr><td>Kaufpreis Stellplatz</td><td class="val">${f(s.kaufpreisStellplatz)}</td><td></td></tr>` : ''}
      <tr class="hl"><td><b>Kaufpreis Gesamt</b></td><td class="val"><b>${f(c.kp)}</b></td><td></td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Mieteinnahmen</h2>
    <table>
      <tr><td>Wohnfläche</td><td class="val">${s.wohnflaeche} qm</td><td class="note">× ${f(s.mieteProQm)}/qm</td></tr>
      ${s.anzahlStellplaetze > 0 ? `<tr><td>Stellplätze</td><td class="val">${s.anzahlStellplaetze} Stck.</td><td class="note">× ${f(s.mieteStellplatz)}/Monat</td></tr>` : ''}
      <tr class="hl"><td><b>Miete pro Monat</b></td><td class="val"><b>${f(c.mm)}</b></td><td></td></tr>
      <tr class="hl"><td><b>Jahres-Kaltmiete</b></td><td class="val"><b>${f(c.jm)}</b></td><td></td></tr>
      <tr class="hl"><td><b>Bruttorendite</b></td><td class="val"><b>${fp(c.rendite)}</b></td><td></td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Anschaffungskosten</h2>
    <table>
      <tr><td>+ Kaufpreis Immobilie</td><td class="val">${f(s.kaufpreisImmobilie)}</td><td></td></tr>
      ${s.kaufpreisStellplatz > 0 ? `<tr><td>+ Kaufpreis Stellplatz</td><td class="val">${f(s.kaufpreisStellplatz)}</td><td></td></tr>` : ''}
      ${s.mehrkosten > 0 ? `<tr><td>+ Mehrkosten</td><td class="val">${f(s.mehrkosten)}</td><td></td></tr>` : ''}
      ${s.maklerProvision > 0 ? `<tr><td>+ Vermittlungsprovision (Makler)</td><td class="val">${f(s.maklerProvision)}</td><td></td></tr>` : ''}
      <tr><td>+ Grunderwerbsteuer</td><td class="val">${f(s.grunderwerbsteuer)}</td><td class="note">${BUNDESLAENDER[s.bundesland]?.grest || 6}% vom KP</td></tr>
      <tr><td>+ Notarkosten</td><td class="val">${f(s.notarkosten)}</td><td></td></tr>
      <tr class="hl"><td><b>Anschaffungskosten Gesamt</b></td><td class="val"><b>${f(c.ak)}</b></td><td></td></tr>
      <tr><td>./. Grundstücksanteil (Bodenwert)</td><td class="val neg">-${f(ga)}</td><td class="note">${s.teileigentumsanteil}/10.000stel von ${f(gwg)}</td></tr>
      <tr class="hl"><td><b>Anschaffungskosten Gebäude</b></td><td class="val"><b>${f(c.afaBasis)}</b></td><td></td></tr>
      <tr class="accent"><td><b>AfA linear ${s.afaSatz}%</b></td><td class="val"><b>${f(afaG)}</b></td><td></td></tr>
    </table>
  </div>

  ${s.sonderausstattung?.length > 0 ? `<div class="section">
    <h2>Sonderausstattung (AfA 10%)</h2>
    <table>
      ${s.sonderausstattung.map((sa, i) => `<tr><td>${sa.name || `Position ${i+1}`}</td><td class="val">${f(sa.betrag)}</td></tr>`).join('')}
      <tr class="hl"><td><b>Summe Sonderausstattung</b></td><td class="val"><b>${f(c.saSumme)}</b></td></tr>
      <tr class="accent"><td><b>AfA Sonderausstattung (10%) p.a.</b></td><td class="val"><b>${f(c.afaSA)}</b></td></tr>
    </table>
  </div>` : ''}

  <div class="section">
    <h2>Werbungskosten ${yr}</h2>
    <table>
      ${yd.wk.length > 0 ? yd.wk.map((w, i) => `<tr><td>${w.bez || `Position ${i+1}`}</td><td class="val">${f(w.betrag)}</td></tr>`).join('') : '<tr><td colspan="2" style="color:#888;font-style:italic;text-align:center;padding:10px">Keine Werbungskosten erfasst</td></tr>'}
      <tr class="hl"><td><b>Werbungskosten Gesamt</b></td><td class="val"><b>${f(wkTot)}</b></td></tr>
    </table>
  </div>

  <div class="section summary">
    <h2>Zusammenfassung AfA + Werbungskosten ${yr}</h2>
    <div class="cols">
      <div class="col">
        <table>
          ${c.saSumme > 0 ? `<tr><td>AfA Sonderausstattung (10%) p.a.</td><td class="val">${f(afaS)}</td></tr>` : ''}
          <tr><td>AfA Anschaffungskosten linear (${s.afaSatz}%)</td><td class="val">${f(afaG)}</td></tr>
          <tr><td>Werbungskosten ${yr} Gesamt</td><td class="val">${f(wkTot)}</td></tr>
          <tr class="hl"><td><b>AfA + Werbungskosten ${yr}</b></td><td class="val neg"><b>-${f(afaTot + wkTot)}</b></td></tr>
        </table>
      </div>
      <div class="col">
        <table>
          <tr><td>Mieteinnahmen ${yr}</td><td class="val">${f(yd.miet)}</td></tr>
          ${yd.nkVor > 0 ? `<tr><td>Einnahmen aus NK Vorauszahlung</td><td class="val">${f(yd.nkVor)}</td></tr>` : ''}
          ${yd.nkAbr !== 0 ? `<tr><td>NK-Abrechnung ${yr}</td><td class="val">${f(yd.nkAbr)}</td></tr>` : ''}
          <tr class="hl"><td><b>Einnahmen Gesamt</b></td><td class="val"><b>${f(ein)}</b></td></tr>
        </table>
      </div>
    </div>
    <div class="result-box ${erg < 0 ? 'profit' : 'loss'}">
      <div class="label">Steuerliches Ergebnis ${yr}</div>
      <div class="value">${f2(erg)}</div>
      <div class="label">${erg < 0 ? `→ Steuerersparnis ca. ${f(Math.abs(stEff))} bei ${s.steuersatz}% Steuersatz` : `→ Steuerlast ca. ${f(stEff)} bei ${s.steuersatz}% Steuersatz`}</div>
    </div>
  </div>

  <div class="footer">
    Erstellt mit ImmoHub · ${new Date().toLocaleDateString('de-DE')}
  </div>`;

  return html;
};

// Glasmorphism Icons als SVG-Komponenten
const GlassIcon = ({ children, color, simple }) => (
  <svg viewBox="0 0 40 40" fill="none">
    {!simple && (
      <>
        <defs>
          <linearGradient id={`grad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.9 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.5 }} />
          </linearGradient>
          <filter id={`glow-${color.replace('#','')}`}>
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect x="2" y="2" width="36" height="36" rx="10" fill={`url(#grad-${color.replace('#','')})`} opacity="0.15" />
        <rect x="2" y="2" width="36" height="36" rx="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
      </>
    )}
    <g fill={color} opacity="0.9">
      {children}
    </g>
  </svg>
);

// Objekt Icon - Haus/Pin
const IconObjekt = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M20 8L8 18v14h8v-8h8v8h8V18L20 8z" />
    <circle cx="20" cy="18" r="2" fill="rgba(0,0,0,0.3)" />
  </GlassIcon>
);

// Kaufpreis Icon - Euro/Münzen
const IconKaufpreis = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="20" cy="20" r="10" fill="none" stroke={color} strokeWidth="2.5" />
    <path d="M17 16h6M17 20h6M17 24h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Grundstück/AfA Icon - Gebäude mit Prozent
const IconAfa = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="10" y="14" width="20" height="18" rx="2" />
    <rect x="14" y="18" width="4" height="4" fill="rgba(0,0,0,0.3)" />
    <rect x="22" y="18" width="4" height="4" fill="rgba(0,0,0,0.3)" />
    <rect x="14" y="24" width="4" height="4" fill="rgba(0,0,0,0.3)" />
    <rect x="22" y="24" width="4" height="4" fill="rgba(0,0,0,0.3)" />
    <path d="M10 14l10-6 10 6" fill="none" stroke={color} strokeWidth="2.5" />
  </GlassIcon>
);

// Miete Icon - Schlüssel
const IconMiete = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="15" cy="15" r="6" fill="none" stroke={color} strokeWidth="2.5" />
    <path d="M19 19l12 12M27 27l4-4M30 30l4-4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Finanzierung Icon - Bank/Säulen
const IconFinanz = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M8 14h24l-12-6-12 6z" />
    <rect x="10" y="16" width="3" height="10" rx="1" />
    <rect x="18" y="16" width="3" height="10" rx="1" />
    <rect x="26" y="16" width="3" height="10" rx="1" />
    <rect x="8" y="27" width="24" height="3" rx="1" />
  </GlassIcon>
);

// Sonderausstattung Icon - Küche/Besteck
const IconSonder = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M12 10v10c0 2 1 3 3 3h1v7h2v-7h1c2 0 3-1 3-3V10" fill="none" stroke={color} strokeWidth="2" />
    <path d="M14 10v6M17 10v6M20 10v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M26 10c0 4 2 6 2 10 0 2-1 3-2 3s-2-1-2-3c0-4 2-6 2-10" fill="none" stroke={color} strokeWidth="2" />
    <path d="M26 23v7" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Rendite Icon - Chart aufwärts
const IconRendite = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M8 28l8-8 6 4 10-12" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M26 12h6v6" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Steuer Icon - Dokument mit Haken
const IconSteuer = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="10" y="6" width="20" height="28" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M14 12h12M14 17h12M14 22h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 27l3 3 6-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Info Icon - Kreis mit i
const IconInfo = ({ color }) => (
  <svg viewBox="0 0 40 40" style={{ width: '100%', height: '100%' }}>
    <circle cx="20" cy="20" r="12" fill="none" stroke={color} strokeWidth="2" />
    <circle cx="20" cy="14" r="1.5" fill={color} />
    <path d="M20 18v8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Einnahmen Icon - Geldbündel
const IconEinnahmen = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="8" y="12" width="24" height="16" rx="2" />
    <circle cx="20" cy="20" r="5" fill="rgba(0,0,0,0.3)" />
    <circle cx="12" cy="20" r="1.5" fill="rgba(0,0,0,0.3)" />
    <circle cx="28" cy="20" r="1.5" fill="rgba(0,0,0,0.3)" />
  </GlassIcon>
);

// Werbungskosten Icon - Quittung
const IconWerbung = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M10 8h20v24l-4-3-4 3-4-3-4 3-4-3V8z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M14 14h12M14 19h12M14 24h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Dashboard Icon - Grid Overview
const IconDashboard = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="8" y="8" width="10" height="10" rx="2" />
    <rect x="22" y="8" width="10" height="10" rx="2" />
    <rect x="8" y="22" width="10" height="10" rx="2" />
    <rect x="22" y="22" width="10" height="10" rx="2" />
  </GlassIcon>
);

// Upload Icon - Dokument mit Pfeil
const IconUpload = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="10" y="6" width="20" height="28" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 14v12M16 18l4-4 4 4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Check/Review Icon - Lupe mit Fragezeichen
const IconReview = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="18" cy="18" r="10" fill="none" stroke={color} strokeWidth="2" />
    <path d="M26 26l6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M18 13v6M18 22v1" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Speichern Icon - Diskette
const IconSave = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="8" y="8" width="24" height="24" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M12 8v8h16V8" fill="none" stroke={color} strokeWidth="2" />
    <rect x="12" y="20" width="16" height="8" rx="1" fill="none" stroke={color} strokeWidth="1.5" />
    <rect x="22" y="10" width="4" height="4" fill={color} opacity="0.5" />
  </GlassIcon>
);

// Löschen Icon - Mülleimer
const IconTrash = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M12 14h16v16a2 2 0 01-2 2H14a2 2 0 01-2-2V14z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M10 14h20M16 14v-2a2 2 0 012-2h4a2 2 0 012 2v2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M16 18v10M20 18v10M24 18v10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Baustelle Icon - Kran
const IconConstruction = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M10 32h4V12h-4v20zM14 14h16M14 12l8-4v4" fill="none" stroke={color} strokeWidth="2" />
    <rect x="26" y="14" width="6" height="8" fill="none" stroke={color} strokeWidth="2" />
    <path d="M29 22v6" stroke={color} strokeWidth="2" />
  </GlassIcon>
);

// Chart/Statistik Icon
const IconChart = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="8" y="22" width="6" height="10" rx="1" />
    <rect x="17" y="14" width="6" height="18" rx="1" />
    <rect x="26" y="8" width="6" height="24" rx="1" />
  </GlassIcon>
);

// Zahnrad/Einstellungen Icon
const IconSettings = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="20" cy="20" r="6" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 8v4M20 28v4M8 20h4M28 20h4M11.5 11.5l2.8 2.8M25.7 25.7l2.8 2.8M11.5 28.5l2.8-2.8M25.7 14.3l2.8-2.8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Projektion/Trend Icon
const IconTrend = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M8 28l8-10 6 6 10-14" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8" cy="28" r="2" fill={color} />
    <circle cx="16" cy="18" r="2" fill={color} />
    <circle cx="22" cy="24" r="2" fill={color} />
    <circle cx="32" cy="10" r="2" fill={color} />
  </GlassIcon>
);

// Liquidität/Tropfen Icon
const IconLiquidity = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M20 6c0 0-10 12-10 18a10 10 0 0020 0c0-6-10-18-10-18z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M16 22c0 2.2 1.8 4 4 4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Download Icon
const IconDownload = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="10" y="6" width="20" height="28" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 26v-12M16 22l4 4 4-4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Kopieren Icon
const IconCopy = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="14" y="10" width="18" height="22" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M10 26V10a2 2 0 012-2h14" fill="none" stroke={color} strokeWidth="2" />
    <path d="M18 16h10M18 21h10M18 26h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Check/Häkchen Icon
const IconCheck = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="20" cy="20" r="12" fill="none" stroke={color} strokeWidth="2" />
    <path d="M14 20l4 4 8-8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Warnung Icon
const IconWarning = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M20 6L6 32h28L20 6z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <path d="M20 14v8M20 26v1" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Home Icon
const IconHome = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M8 18l12-10 12 10" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 16v14h16V16" fill="none" stroke={color} strokeWidth="2" />
    <rect x="17" y="22" width="6" height="8" fill="none" stroke={color} strokeWidth="1.5" />
  </GlassIcon>
);

// Plus Icon
const IconPlus = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="20" cy="20" r="12" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 14v12M14 20h12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Close/X Icon
const IconClose = ({ color }) => (
  <GlassIcon color={color} simple>
    <path d="M12 12l16 16M28 12l-16 16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Lupe/Search Icon
const IconSearch = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="18" cy="18" r="10" fill="none" stroke={color} strokeWidth="2.5" />
    <path d="M26 26l8 8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// AI/Robot Icon
const IconAI = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="10" y="12" width="20" height="16" rx="3" fill="none" stroke={color} strokeWidth="2" />
    <circle cx="16" cy="20" r="2" fill={color} />
    <circle cx="24" cy="20" r="2" fill={color} />
    <path d="M16 25h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M20 12v-4M14 8h12" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Arrow Left Icon
const IconArrowLeft = ({ color }) => (
  <GlassIcon color={color} simple>
    <path d="M24 8l-12 12 12 12" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </GlassIcon>
);

// Document/File Icon
const IconDocument = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M12 6h10l8 8v18a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M22 6v8h8" fill="none" stroke={color} strokeWidth="2" />
    <path d="M14 18h12M14 23h12M14 28h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Lightbulb/Idea Icon
const IconIdea = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M20 6a10 10 0 00-6 18v4h12v-4a10 10 0 00-6-18z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M16 32h8M17 28h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path d="M20 12v4M14 14l2 2M26 14l-2 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Sun Icon (Light Mode)
const IconSun = ({ color }) => (
  <GlassIcon color={color} simple>
    <circle cx="20" cy="20" r="6" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 8v4M20 28v4M8 20h4M28 20h4M11.5 11.5l2.8 2.8M25.7 25.7l2.8 2.8M11.5 28.5l2.8-2.8M25.7 14.3l2.8-2.8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Moon Icon (Dark Mode)
const IconMoon = ({ color }) => (
  <GlassIcon color={color} simple>
    <path d="M26 20a10 10 0 01-10 10 10 10 0 01-10-10 10 10 0 0110-10 8 8 0 000 16 8 8 0 008-8 10 10 0 012 2z" fill="none" stroke={color} strokeWidth="2" />
  </GlassIcon>
);

// Undo Icon
const IconUndo = ({ color }) => (
  <GlassIcon color={color} simple>
    <path d="M14 16l-6-6 6-6" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 10h16a8 8 0 018 8 8 8 0 01-8 8H14" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Redo Icon
const IconRedo = ({ color }) => (
  <GlassIcon color={color} simple>
    <path d="M26 16l6-6-6-6" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M32 10H16a8 8 0 00-8 8 8 8 0 008 8h10" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </GlassIcon>
);

// Notes/Notizen Icon
const IconNotes = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="8" y="6" width="24" height="28" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M12 12h16M12 18h16M12 24h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="28" cy="28" r="6" fill={color} opacity="0.3" />
    <path d="M26 28h4M28 26v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </GlassIcon>
);

// Dokumente/Fotos Icon
const IconDocuments = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="6" y="10" width="16" height="20" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <rect x="14" y="6" width="16" height="20" rx="2" fill="none" stroke={color} strokeWidth="2" />
    <path d="M18 13h8M18 18h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="22" cy="24" r="3" fill="none" stroke={color} strokeWidth="1.5" />
  </GlassIcon>
);

// Darlehen/Bank Icon
const IconBank = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M6 16h28M8 16v12M14 16v12M20 16v12M26 16v12M32 16v12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path d="M4 28h32" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path d="M20 6l14 10H6L20 6z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
  </GlassIcon>
);

// Historie/Verlauf Icon
const IconHistory = ({ color }) => (
  <GlassIcon color={color}>
    <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="2" />
    <path d="M20 10v10l6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 8l-4 4M8 8l4 4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Erinnerung/Glocke Icon
const IconBell = ({ color }) => (
  <GlassIcon color={color}>
    <path d="M20 6c-6 0-10 4-10 10v6l-2 4h24l-2-4v-6c0-6-4-10-10-10z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 30c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <circle cx="20" cy="6" r="2" fill={color} />
  </GlassIcon>
);

// List/Auflistung Icon
const IconList = ({ color }) => (
  <GlassIcon color={color}>
    <rect x="6" y="6" width="28" height="28" rx="3" fill="none" stroke={color} strokeWidth="2" />
    <circle cx="12" cy="14" r="2" fill={color} />
    <circle cx="12" cy="22" r="2" fill={color} />
    <circle cx="12" cy="30" r="2" fill={color} />
    <path d="M18 14h12M18 22h12M18 30h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </GlassIcon>
);

// Person Icon
const IconPerson = ({ color }) => (
  <svg viewBox="0 0 40 40" style={{ width: '100%', height: '100%' }}>
    <defs>
      <linearGradient id={`personGrad-${color?.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
        <stop offset="100%" stopColor={color} stopOpacity="0.05" />
      </linearGradient>
    </defs>
    <circle cx="20" cy="14" r="7" fill={`url(#personGrad-${color?.replace('#','')})`} stroke={color} strokeWidth="2" />
    <path d="M8 34c0-6.627 5.373-12 12-12s12 5.373 12 12" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const BUNDESLAENDER = {
  'bayern': { name: 'Bayern', grest: 3.5 },
  'baden-wuerttemberg': { name: 'Baden-Württemberg', grest: 5.0 },
  'hessen': { name: 'Hessen', grest: 6.0 },
  'nrw': { name: 'Nordrhein-Westfalen', grest: 6.5 },
  'berlin': { name: 'Berlin', grest: 6.0 },
  'hamburg': { name: 'Hamburg', grest: 5.5 },
  'niedersachsen': { name: 'Niedersachsen', grest: 5.0 },
  'sachsen': { name: 'Sachsen', grest: 5.5 },
  'thueringen': { name: 'Thüringen', grest: 5.0 },
  'brandenburg': { name: 'Brandenburg', grest: 6.5 },
};

const createEmpty = () => ({
  id: Date.now(),
  saved: false,
  importiert: false, // true wenn aus Dokument importiert
  zuPruefen: [], // Liste der Felder die zu prüfen sind
  notizen: '', // Freitext-Notizen
  dokumente: [], // Array von { name, url, typ }
  beteiligungen: [], // Array von { beteiligterID, anteil }
  darlehen: [], // Array von { name, betrag, zinssatz, tilgung, abschluss, zinsbindungEnde, typ }
  miethistorie: [], // Array von { datum, mieteAlt, mieteNeu, grund }
  erinnerungen: [], // Array von { datum, titel, beschreibung, erledigt }
  stammdaten: {
    name: '', adresse: '', projekt: '', typ: 'etw', bundesland: 'hessen',
    objektstatus: 'neubau',
    nutzung: 'vermietet',
    eigentuemer: '',
    kaufdatum: new Date().toISOString().split('T')[0],
    baujahr: 0,
    wohnungsNr: '',
    etage: '',
    verkehrswert: 0,
    verkehrswertDatum: '',
    kaufpreisImmobilie: 0, kaufpreisStellplatz: 0,
    grundstueckGroesse: 0, bodenrichtwert: 0, teileigentumsanteil: 0,
    wohnflaeche: 0, mieteProQm: 0, mieteStellplatz: 0, anzahlStellplaetze: 1,
    mieteSonderausstattung: 0, // Miete für Küche etc.
    kaltmiete: 0, // Kaltmiete pro Monat
    nebenkostenVorauszahlung: 0, // NK-Vorauszahlung pro Monat
    mieterName: '', // Name des aktuellen Mieters
    mietstatusAktiv: true, // true = vermietet, false = Leerstand
    mietbeginn: '',
    mietende: '', // Mietende (leer = unbefristet)
    kaution: 0, // Kautionsbetrag
    kautionErhalten: false, // Kaution wurde erhalten
    kautionZurueckgezahlt: false, // Kaution wurde zurückgezahlt
    maklerProvision: 0, notarkosten: 0, grunderwerbsteuer: 0, mehrkosten: 0,
    afaSatz: 3, degressiveAfa: 0, baujahr: 2020,
    // Eigenkapital-Details
    eigenkapitalAnteil: 20, 
    eigenkapitalBetrag: 0,
    eigenkapitalHerkunft: 'ersparnis',
    eigenleistung: 0,
    // Förderungen
    kfwZuschuss: 0,
    kfwProgramm: '',
    bafaFoerderung: 0,
    landesFoerderung: 0,
    // Darlehen (Legacy-Felder)
    zinssatz: 3.5, tilgung: 2, laufzeit: 30,
    darlehenAbschluss: new Date().toISOString().split('T')[0],
    tilgungsbeginn: new Date().toISOString().split('T')[0],
    sonderausstattung: [], steuersatz: 42,
  },
  rendite: { mietanpassung: 2, kostenProzent: 6, instandhaltung: 12, mietausfall: 4 },
  steuerJahre: {},
});

const STORAGE_KEY = 'immocalc_v4';
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
const save = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };

const useCalc = (s) => useMemo(() => {
  if (!s) return {};
  const kp = (s.kaufpreisImmobilie || 0) + (s.kaufpreisStellplatz || 0);
  const nk = (s.mehrkosten || 0) + (s.maklerProvision || 0) + (s.grunderwerbsteuer || 0) + (s.notarkosten || 0);
  const ak = kp + nk;
  const gwg = (s.grundstueckGroesse || 0) * (s.bodenrichtwert || 0);
  const ga = s.teileigentumsanteil > 0 ? (s.teileigentumsanteil / 10000) * gwg : 0;
  const afaBasis = ak - ga;
  const afaGeb = afaBasis * ((s.afaSatz || 3) / 100);
  const saSumme = s.sonderausstattung?.reduce((a, i) => a + (i.betrag || 0), 0) || 0;
  const afaSA = s.sonderausstattung?.reduce((a, i) => a + ((i.betrag || 0) * 0.1), 0) || 0;
  // Jahres-Kaltmiete: Kaltmiete + Stellplatz + Sonderausstattung (ohne NK-Vorauszahlung)
  const jm = ((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12;
  return { kp, nk, ak, gwg, ga, afaBasis, afaGeb, saSumme, afaSA, afaGes: afaGeb + afaSA, jm, mm: jm / 12, rendite: kp > 0 ? jm / kp : 0 };
}, [s]);

// Formatierte Zahl mit Tausender-Trennzeichen
const formatNumber = (num) => {
  if (num === '' || num === null || num === undefined) return '';
  const n = typeof num === 'string' ? parseFloat(num.replace(/\./g, '').replace(',', '.')) : num;
  if (isNaN(n)) return '';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
};

// Parse formatierte Zahl zurück
const parseNumber = (str) => {
  if (!str || str === '') return 0;
  // Entferne Tausender-Punkte, ersetze Komma durch Punkt
  const cleaned = str.toString().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Datum formatieren: YYYY-MM-DD zu TT.MM.JJJJ
const formatDateDE = (isoDate) => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};

// Datum parsen: TT.MM.JJJJ zu YYYY-MM-DD
const parseDateDE = (deDate) => {
  if (!deDate) return '';
  // Erlaube auch Eingabe mit / oder -
  const cleaned = deDate.replace(/[\/\-]/g, '.');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return '';
  const [day, month, year] = parts;
  // Validierung
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  let y = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return '';
  // 2-stelliges Jahr zu 4-stellig konvertieren
  if (y < 100) y = y > 50 ? 1900 + y : 2000 + y;
  if (d < 1 || d > 31 || m < 1 || m > 12) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// DateInput Komponente mit deutschem Format und Kalender
const DateInput = ({ value, onChange, placeholder }) => {
  const [displayValue, setDisplayValue] = useState(formatDateDE(value));
  const [isFocused, setIsFocused] = useState(false);
  const hiddenDateRef = React.useRef(null);
  
  React.useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatDateDE(value));
    }
  }, [value, isFocused]);
  
  const handleChange = (e) => {
    const inputVal = e.target.value;
    // Erlaube nur Zahlen und Trennzeichen
    const sanitized = inputVal.replace(/[^0-9.\/\-]/g, '');
    setDisplayValue(sanitized);
  };
  
  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseDateDE(displayValue);
    if (parsed) {
      onChange(parsed);
      setDisplayValue(formatDateDE(parsed));
    } else if (displayValue === '') {
      onChange('');
    } else {
      // Ungültiges Datum - zurücksetzen
      setDisplayValue(formatDateDE(value));
    }
  };
  
  const handleFocus = () => {
    setIsFocused(true);
  };
  
  const openCalendar = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hiddenDateRef.current) {
      // Verschiedene Methoden probieren für Browser-Kompatibilität
      try {
        hiddenDateRef.current.showPicker();
      } catch {
        // Fallback: Focus und Click simulieren
        hiddenDateRef.current.focus();
        hiddenDateRef.current.click();
      }
    }
  };
  
  const handleCalendarChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setDisplayValue(formatDateDE(newValue));
  };
  
  const handleCalendarClick = () => {
    if (hiddenDateRef.current) {
      hiddenDateRef.current.showPicker?.();
    }
  };
  
  return (
    <div className="date-input-wrapper">
      <input 
        type="text" 
        inputMode="numeric"
        value={displayValue} 
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder || "TT.MM.JJJJ"}
        className="date-input-text"
      />
      <div className="date-calendar-btn" onClick={handleCalendarClick} title="Kalender öffnen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <input 
          type="date" 
          ref={hiddenDateRef}
          value={value || ''} 
          onChange={handleCalendarChange}
          className="date-input-native"
          tabIndex={-1}
        />
      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, suffix, step = 1, type = 'number', ph, error }) => {
  const isDate = type === 'date';
  const isYear = type === 'year';
  const isNumber = type === 'number';
  const [displayValue, setDisplayValue] = useState(
    isNumber && value ? formatNumber(value) : 
    isYear && value ? String(value) : 
    (value || '')
  );
  const [isFocused, setIsFocused] = useState(false);
  
  // Sync display value when external value changes (but not during focus)
  React.useEffect(() => {
    if (!isFocused) {
      if (isNumber) {
        setDisplayValue(value ? formatNumber(value) : '');
      } else if (isYear) {
        setDisplayValue(value ? String(value) : '');
      } else {
        setDisplayValue(value || '');
      }
    }
  }, [value, isFocused, isNumber, isYear]);
  
  const handleChange = (e) => {
    const inputVal = e.target.value;
    if (isNumber) {
      // Erlaube nur Zahlen, Punkte und Kommas während der Eingabe
      const sanitized = inputVal.replace(/[^0-9.,\-]/g, '');
      setDisplayValue(sanitized);
      onChange(parseNumber(sanitized));
    } else if (isYear) {
      // Nur Zahlen für Jahr, keine Formatierung
      const sanitized = inputVal.replace(/[^0-9]/g, '');
      setDisplayValue(sanitized);
      onChange(parseInt(sanitized) || 0);
    } else {
      setDisplayValue(inputVal);
      onChange(inputVal);
    }
  };
  
  const handleBlur = () => {
    setIsFocused(false);
    if (isNumber) {
      // Beim Verlassen formatieren
      const num = parseNumber(displayValue);
      setDisplayValue(num ? formatNumber(num) : '');
    }
    // Jahr wird nicht formatiert
  };
  
  const handleFocus = () => {
    setIsFocused(true);
    if (isNumber && displayValue) {
      // Beim Fokus die Rohzahl zeigen (ohne Tausender-Trennung, aber mit Komma als Dezimal)
      const num = parseNumber(displayValue);
      setDisplayValue(num ? num.toString().replace('.', ',') : '');
    }
    // Jahr bleibt unverändert
  };
  
  return (
    <div className="irow">
      <label>{label}</label>
      <div className="ifld-wrap">
        <div className={`ifld ${error ? 'input-error' : ''}`}>
          {isDate ? (
            <DateInput value={value} onChange={onChange} placeholder={ph} />
          ) : (
            <input 
              type="text" 
              inputMode={(isNumber || isYear) ? 'numeric' : 'text'}
              value={displayValue} 
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              placeholder={ph} 
            />
          )}
          {suffix && <span className="suf">{suffix}</span>}
        </div>
        {error && <div className="validation-error">{error}</div>}
      </div>
    </div>
  );
};

// Einfaches formatiertes Zahlen-Input ohne Label-Wrapper
const NumInput = ({ value, onChange, placeholder, className }) => {
  const [displayValue, setDisplayValue] = useState(value ? formatNumber(value) : '');
  const [isFocused, setIsFocused] = useState(false);
  
  React.useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value ? formatNumber(value) : '');
    }
  }, [value, isFocused]);
  
  const handleChange = (e) => {
    const sanitized = e.target.value.replace(/[^0-9.,\-]/g, '');
    setDisplayValue(sanitized);
    onChange(parseNumber(sanitized));
  };
  
  const handleBlur = () => {
    setIsFocused(false);
    const num = parseNumber(displayValue);
    setDisplayValue(num ? formatNumber(num) : '');
  };
  
  const handleFocus = () => {
    setIsFocused(true);
    if (displayValue) {
      const num = parseNumber(displayValue);
      setDisplayValue(num ? num.toString().replace('.', ',') : '');
    }
  };
  
  return (
    <input 
      type="text" 
      inputMode="decimal"
      value={displayValue} 
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
    />
  );
};

const Select = ({ label, value, onChange, options }) => (
  <div className="irow">
    <label>{label}</label>
    <div className="ifld">
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  </div>
);

const Acc = ({ icon, title, sum, open, toggle, color = '#3b82f6', disabled = false, onImport, children }) => (
  <div className={`acc ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} style={{ '--c': color }}>
    <div className="acc-h" onClick={disabled ? undefined : toggle}>
      <div className="acc-i">{icon}</div>
      <div className="acc-info"><div className="acc-t">{title}</div><div className="acc-s">{sum}</div></div>
      {onImport && open && (
        <button 
          className="acc-import-btn" 
          onClick={(e) => { e.stopPropagation(); onImport(); }}
          title="Aus Dokument importieren"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Importieren</span>
        </button>
      )}
      {!disabled && <div className="acc-tog">{open ? '−' : '+'}</div>}
    </div>
    {open && !disabled && <div className="acc-body">{children}</div>}
  </div>
);

// Modal
const Modal = ({ items, onSelect, onNew, onClose, onDel, onOpenImport, onDuplicate }) => {
  const [showDataModal, setShowDataModal] = useState(false);
  
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h"><h2><span className="modal-icon"><IconObjekt color="#6366f1" /></span>Immobilie wählen</h2><button onClick={onClose}>×</button></div>
        <div className="modal-b">
          {items.length === 0 ? (
            <div className="empty"><span className="empty-icon"><IconConstruction color="#6366f1" /></span><p>Noch keine Immobilien gespeichert</p></div>
          ) : (
            <div className="immo-list">
              {items.map(i => (
                <div key={i.id} className="immo-card" onClick={() => onSelect(i)} style={{ borderLeftColor: TYP_COLORS[i.stammdaten.typ]?.border }}>
                  <div className="immo-info">
                    <div className="immo-name">
                      <span className="immo-typ-tag" style={{ background: TYP_COLORS[i.stammdaten.typ]?.bg, borderColor: TYP_COLORS[i.stammdaten.typ]?.border, color: TYP_COLORS[i.stammdaten.typ]?.text }}>{getTypLabel(i.stammdaten.typ)}</span>
                      {i.stammdaten.name}
                      {i.importiert && i.zuPruefen?.length > 0 && <span className="review-badge"><span className="review-badge-icon"><IconWarning color="#f59e0b" /></span>{i.zuPruefen.length} zu prüfen</span>}
                    </div>
                    <div className="immo-addr">{i.stammdaten.adresse || 'Keine Adresse'}</div>
                    <div className="immo-meta">{i.stammdaten.wohnflaeche} qm · {fmt(i.stammdaten.kaufpreisImmobilie)}</div>
                  </div>
                  <div className="immo-actions">
                    <button className="dup-sm" onClick={e => { e.stopPropagation(); onDuplicate(i); }} title="Duplizieren"><IconCopy color="#6366f1" /></button>
                    <button className="del-sm" onClick={e => { e.stopPropagation(); onDel(i.id); }} title="Löschen"><IconTrash color="#ef4444" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-f">
          <button className="btn-pri" onClick={onNew}>+ Neue Immobilie</button>
          <button className="btn-import" onClick={onOpenImport}><span className="btn-import-icon"><IconUpload color="#6366f1" /></span>Aus Dokument importieren</button>
        </div>
        <div className="modal-f2">
          <button className="btn-data" onClick={() => setShowDataModal(true)}><span className="btn-data-icon"><IconSave color="#6366f1" /></span>Daten verwalten</button>
        </div>
      </div>
      {showDataModal && <DataModal items={items} onClose={() => setShowDataModal(false)} />}
    </div>
  );
};

// Daten Export/Import Modal
// Beteiligte Modal
const BeteiligteModal = ({ beteiligte, onClose, onAdd, onDelete, onToggle, aktiveBeteiligte }) => {
  const [newName, setNewName] = useState('');
  const alleAktiv = aktiveBeteiligte.length === 0;
  
  const handleAdd = () => {
    if (newName.trim()) {
      onAdd({
        id: 'bet_' + Date.now(),
        name: newName.trim(),
        farbe: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][beteiligte.length % 6]
      });
      setNewName('');
    }
  };
  
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal bet-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconPerson color="#6366f1" /></span>Beteiligte verwalten</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-b">
          <div className="bet-list">
            <div 
              className={`bet-item ${alleAktiv ? 'active' : ''}`}
              onClick={() => onToggle(null)}
            >
              <div className="bet-icon all"><IconDashboard color="#6366f1" /></div>
              <span>Alle Immobilien</span>
              {alleAktiv && <span className="bet-check">✓</span>}
            </div>
            {beteiligte.map(b => {
              const isActive = aktiveBeteiligte.includes(b.id);
              return (
                <div 
                  key={b.id} 
                  className={`bet-item ${isActive ? 'active' : ''}`}
                  onClick={() => onToggle(b.id)}
                >
                  <div className="bet-icon" style={{ borderColor: b.farbe }}><IconPerson color={b.farbe} /></div>
                  <span>{b.name}</span>
                  {isActive && <span className="bet-check">✓</span>}
                  <button className="bet-del" onClick={(e) => { e.stopPropagation(); onDelete(b.id); }} title="Löschen">×</button>
                </div>
              );
            })}
          </div>
          
          <div className="bet-add">
            <input 
              type="text" 
              value={newName} 
              onChange={e => setNewName(e.target.value)}
              placeholder="Name des Beteiligten..."
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} disabled={!newName.trim()}>
              <span className="btn-icon-sm"><IconCheck color="#fff" /></span>Hinzufügen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DataModal = ({ items, onClose }) => {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [showImport, setShowImport] = useState(false);
  
  const handleExport = () => {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      app: 'ImmoHub',
      immobilien: items
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ImmoHub-Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setImportText(event.target.result);
      setImportError('');
    };
    reader.readAsText(file);
  };
  
  const handleImport = () => {
    try {
      const data = JSON.parse(importText);
      
      if (!data.immobilien || !Array.isArray(data.immobilien)) {
        throw new Error('Ungültiges Dateiformat');
      }
      
      // Daten in localStorage speichern
      localStorage.setItem('immoData', JSON.stringify(data.immobilien));
      setImportSuccess(`✓ ${data.immobilien.length} Immobilie(n) importiert! Seite wird neu geladen...`);
      setImportError('');
      
      // Seite neu laden um Daten zu übernehmen
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (err) {
      setImportError('Fehler beim Import: ' + err.message);
      setImportSuccess('');
    }
  };
  
  return (
    <div className="modal-bg data-modal-bg" onClick={onClose}>
      <div className="modal data-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconSave color="#6366f1" /></span>Daten verwalten</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-b">
          {!showImport ? (
            <>
              <div className="data-section">
                <h3><span className="section-icon"><IconDownload color="#10b981" /></span>Daten exportieren</h3>
                <p>Speichere alle Immobilien als JSON-Datei. Diese kannst du als Backup in deinem iCloud-Ordner ablegen.</p>
                <button className="btn-export-data" onClick={handleExport}>
                  <span className="btn-icon-sm"><IconDownload color="#fff" /></span>Backup herunterladen ({items.length} Immobilie{items.length !== 1 ? 'n' : ''})
                </button>
              </div>
              
              <div className="data-divider"><span>oder</span></div>
              
              <div className="data-section">
                <h3><span className="section-icon"><IconUpload color="#3b82f6" /></span>Daten importieren</h3>
                <p>Lade ein zuvor erstelltes Backup wieder ein. <strong>Achtung:</strong> Dies überschreibt alle aktuellen Daten!</p>
                <button className="btn-import-data" onClick={() => setShowImport(true)}>
                  <span className="btn-icon-sm"><IconUpload color="#fff" /></span>Backup laden
                </button>
              </div>
            </>
          ) : (
            <div className="data-section">
              <h3><span className="section-icon"><IconUpload color="#3b82f6" /></span>Backup-Datei auswählen</h3>
              
              <input 
                type="file" 
                accept=".json"
                onChange={handleFileSelect}
                className="file-input-json"
              />
              
              {importText && (
                <div className="import-preview">
                  <span>✓ Datei geladen</span>
                  <small>{(importText.length / 1024).toFixed(1)} KB</small>
                </div>
              )}
              
              {importError && <div className="import-error">{importError}</div>}
              {importSuccess && <div className="import-success">{importSuccess}</div>}
              
              <div className="import-actions-data">
                <button className="btn-back" onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }}><span className="btn-icon-sm"><IconArrowLeft color="#fafafa" /></span>Zurück</button>
                <button className="btn-do-import" onClick={handleImport} disabled={!importText}>
                  <span className="btn-icon-sm"><IconWarning color="#000" /></span>Importieren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Einzelne importierte Immobilie Karte
const ParsedImmoCard = ({ immo, idx, total, formatFieldName, formatValue, handleImport, buttonLabel }) => {
  const [showMore, setShowMore] = useState(false);
  
  // Darlehen separat behandeln
  const darlehenCount = immo.darlehen?.length || 0;
  
  const allFields = Object.entries(immo)
    .filter(([k]) => !['gefundeneFelder', 'zuPruefen', 'quellenDokument', 'dokumentTyp', 'lfdNr', 'darlehen'].includes(k) && immo[k] !== undefined && immo[k] !== null && immo[k] !== '' && !Array.isArray(immo[k]));
  const mainFields = allFields.slice(0, 8);
  const extraFields = allFields.slice(8);
  
  return (
    <div className="parsed-immo">
      <div className="parsed-immo-header">
        <span className="parsed-icon"><IconObjekt color="#6366f1" /></span>
        <div>
          <strong>{immo.name || immo.adresse || `Immobilie ${immo.lfdNr || idx + 1}`}</strong>
          <small>
            {immo.zuPruefen?.length || 0} Felder
            {darlehenCount > 0 && <span className="parsed-darlehen-badge"> · {darlehenCount} Darlehen</span>}
            {total > 1 && <span className="parsed-immo-idx"> · #{idx + 1} von {total}</span>}
          </small>
        </div>
        {immo.quellenDokument && (
          <span className="parsed-source-badge">{immo.quellenDokument}</span>
        )}
      </div>
      <div className="parsed-fields">
        {mainFields.map(([key, value]) => (
          <div key={key} className="pf">
            <span>{formatFieldName(key)}</span>
            <span>{formatValue(key, value)}</span>
          </div>
        ))}
        
        {/* Darlehen anzeigen */}
        {darlehenCount > 0 && (
          <div className="pf pf-darlehen">
            <span><IconFinanz color="#3b82f6" /> Darlehen</span>
            <span>{darlehenCount}× ({immo.darlehen.reduce((s, d) => s + (d.betrag || 0), 0).toLocaleString('de-DE')} €)</span>
          </div>
        )}
        
        {extraFields.length > 0 && !showMore && (
          <button className="pf-more-btn" onClick={() => setShowMore(true)}>
            + {extraFields.length} weitere Felder anzeigen
          </button>
        )}
        {showMore && extraFields.map(([key, value]) => (
          <div key={key} className="pf pf-extra">
            <span>{formatFieldName(key)}</span>
            <span>{formatValue(key, value)}</span>
          </div>
        ))}
        {showMore && darlehenCount > 0 && (
          <div className="pf-darlehen-details">
            {immo.darlehen.map((d, i) => (
              <div key={i} className="pf-darlehen-item">
                <strong>{d.name || d.institut || `Darlehen ${i + 1}`}</strong>
                <span>{d.betrag?.toLocaleString('de-DE')} € · {d.zinssatz}% · {d.tilgung}% Tilg.</span>
              </div>
            ))}
          </div>
        )}
        {showMore && (
          <button className="pf-more-btn" onClick={() => setShowMore(false)}>
            − Weniger anzeigen
          </button>
        )}
      </div>
      <button className="btn-import-immo" onClick={() => handleImport(immo)}>
        <><span className="btn-icon-sm"><IconCheck color="#fff" /></span>{buttonLabel || 'Importieren & Prüfen'}</>
      </button>
    </div>
  );
};

// Import Modal mit echter KI-Dokumentenanalyse
const ImportModal = ({ onClose, onImport, existingImmo = null }) => {
  const [files, setFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [allParsedData, setAllParsedData] = useState([]);
  const [error, setError] = useState(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeDecisions, setMergeDecisions] = useState({});
  const [documentType, setDocumentType] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null); // 'processing', 'done', null
  const fileInputRef = React.useRef(null);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setCurrentFileIndex(0);
      setAllParsedData([]);
      processFile(selectedFiles[0]);
    }
  };

  const processFile = (selectedFile) => {
    setError(null);
    setParsedData(null);
    setMergeMode(false);
    setMergeDecisions({});
    setDocumentType(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      setBase64Data(result.split(',')[1]);
      if (selectedFile.type.startsWith('image/')) {
        setPreview(result);
      } else {
        setPreview(null);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
      setCurrentFileIndex(0);
      setAllParsedData([]);
      processFile(droppedFiles[0]);
    }
  };

  const currentFile = files[currentFileIndex];

  const getMediaType = () => {
    if (!currentFile) return null;
    if (currentFile.type === 'application/pdf') return 'application/pdf';
    if (currentFile.type === 'image/png') return 'image/png';
    if (currentFile.type === 'image/jpeg') return 'image/jpeg';
    if (currentFile.type === 'image/webp') return 'image/webp';
    return currentFile.type;
  };

  const parseDocument = async () => {
    if (!currentFile || !base64Data) return;
    setParsing(true);
    setError(null);
    setProcessingStatus('processing');
    
    const mediaType = getMediaType();
    const isPDF = mediaType === 'application/pdf';
    
    const systemPrompt = `Du bist ein Experte für die Analyse von Immobiliendokumenten. 
Analysiere das Dokument und extrahiere alle relevanten Daten.

SCHRITT 1: Erkenne den Dokumenttyp:
- "kaufvertrag" - Kaufvertrag, Exposé (meist 1 Immobilie)
- "mietvertrag" - Mietvertrag, Mieterhöhung (meist 1 Immobilie)
- "darlehen_liste" - Liste/Übersicht von Darlehen/Finanzierungen (MEHRERE Darlehen!)
- "darlehen" - Einzelner Darlehensvertrag, Finanzierungsbestätigung
- "nebenkostenabrechnung" - Nebenkostenabrechnung, Hausgeldabrechnung
- "grundbuch" - Grundbuchauszug, Flurkarte
- "auflistung" - Vermögensübersicht, Aufstellung mehrerer Immobilien, Portfolio-Übersicht (MEHRERE Immobilien!)
- "sonstiges" - Andere Dokumente

SCHRITT 2: Extrahiere die relevanten Felder je nach Dokumenttyp.

WICHTIG - LAUFENDE NUMMERN & ZUORDNUNG:
- Wenn Einträge nummeriert sind (1, 2, 3... oder Nr. 1, Nr. 2...), dann erfasse die "lfdNr" (laufende Nummer)!
- Diese Nummer dient zur Zuordnung zwischen verschiedenen Dokumenten (z.B. Immobilie 1 gehört zu Darlehen 1)
- Bei Darlehen: Erfasse auch welcher Immobilie es zugeordnet ist (über "lfdNr" oder "immobilienNr")

WICHTIG - DARLEHEN:
- Darlehen werden im Array "darlehen" erfasst (NICHT als einzelne Felder!)
- Jedes Darlehen hat: name, institut, betrag, zinssatz, tilgung, monatsrate, laufzeit, zinsbindungJahre, etc.
- Bei einer Darlehensübersicht: JEDES Darlehen als separates Objekt im Array!

WICHTIG - WERBUNGSKOSTEN:
- Werbungskosten sind Kosten die steuerlich absetzbar sind (z.B. Hausgeld, Verwaltungskosten, Reparaturen, Versicherungen)
- Erfasse sie im Array "werbungskosten" mit Jahr, Bezeichnung und Betrag
- Beispiele: Hausgeld, Verwaltungskosten, Instandhaltungsrücklage, Versicherungen, Kontoführung, Fahrtkosten

Antworte NUR mit einem validen JSON-Objekt. Keine Erklärungen, kein Markdown.

Format:
{
  "dokumentTyp": "kaufvertrag|mietvertrag|darlehen|darlehen_liste|nebenkostenabrechnung|grundbuch|auflistung|sonstiges",
  "dokumentBeschreibung": "Kurze Beschreibung was für ein Dokument es ist",
  "immobilien": [{
    "lfdNr": 1,
    "name": "Bezeichnung/Name der Immobilie",
    "eigentuemer": "Name des Eigentümers",
    "mieterName": "Name des Mieters",
    "adresse": "Vollständige Adresse",
    "wohnungsNr": "Wohnungsnummer",
    "etage": "Etage",
    "typ": "etw|mfh|efh|gewerbe|grundstueck",
    "objektstatus": "neubau|bestand",
    "nutzung": "vermietet|eigengenutzt",
    "bundesland": "hessen",
    "kaufdatum": "YYYY-MM-DD",
    "baujahr": 2020,
    "verkehrswert": 280000,
    "kaufpreisImmobilie": 250000,
    "kaufpreisStellplatz": 15000,
    "wohnflaeche": 85.5,
    "mieteProQm": 12.50,
    "kaltmiete": 1000,
    "nebenkostenVorauszahlung": 200,
    "mieteSonderausstattung": 50,
    "mietbeginn": "YYYY-MM-DD",
    "mietende": "YYYY-MM-DD",
    "mieteStellplatz": 50,
    "kaution": 3000,
    "anzahlStellplaetze": 1,
    "maklerProvision": 0,
    "grunderwerbsteuer": 0,
    "notarkosten": 0,
    "eigenkapitalAnteil": 20,
    "eigenkapitalBetrag": 50000,
    "afaSatz": 3,
    "grundstueckGroesse": 500,
    "bodenrichtwert": 150,
    "darlehen": [{
      "name": "Hauptdarlehen",
      "institut": "Sparkasse",
      "kontonummer": "123456789",
      "typ": "annuitaeten|tilgung|endfaellig|kfw|bauspar|privat",
      "betrag": 200000,
      "zinssatz": 3.5,
      "effektivzins": 3.65,
      "tilgung": 2,
      "monatsrate": 916.67,
      "sondertilgung": 5,
      "abschluss": "YYYY-MM-DD",
      "ersteRate": "YYYY-MM-DD",
      "laufzeit": 30,
      "zinsbindungJahre": 10,
      "zinsbindungEnde": "YYYY-MM-DD",
      "restschuld": 180000
    }],
    "werbungskosten": [{
      "jahr": 2024,
      "bez": "Hausgeld",
      "betrag": 3600
    }, {
      "jahr": 2024,
      "bez": "Verwaltungskosten",
      "betrag": 300
    }],
    "gefundeneFelder": ["liste", "der", "extrahierten", "felder"]
  }],
  "darlehen_ohne_zuordnung": [{
    "lfdNr": 1,
    "immobilienNr": 1,
    "name": "Darlehen für Immobilie 1",
    "institut": "Bank XY",
    "betrag": 200000,
    "zinssatz": 3.5,
    "tilgung": 2,
    "monatsrate": 916.67,
    "zinsbindungJahre": 10
  }]
}

Wichtig:
- Zahlen als Nummern, nicht als Strings
- "lfdNr" und "immobilienNr" sind wichtig für die Zuordnung!
- Bei Darlehen-Liste ohne direkte Immobilien-Infos: Nutze "darlehen_ohne_zuordnung" mit "immobilienNr" zur späteren Zuordnung
- Bei Immobilien-Liste mit Finanzierungsinfos: Packe die Darlehen direkt ins "darlehen" Array der jeweiligen Immobilie
- Bei MEHREREN Einträgen: JEDER als separates Objekt im jeweiligen Array!
- "gefundeneFelder" enthält die Namen aller extrahierten Felder`;

    try {
      const fullPrompt = systemPrompt + "\n\nAnalysiere dieses Dokument. Erkenne den Dokumenttyp, extrahiere alle Immobilien- und Darlehensdaten. Achte auf laufende Nummern zur Zuordnung. Antworte nur mit JSON.";

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mediaType,
          systemPrompt: fullPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API Fehler: ${response.status}`);
      }

      const data = await response.json();
      const textContent = data.text || '';
      
      // Prüfen ob Antwort leer
      if (!textContent) {
        throw new Error('Keine Antwort vom Server erhalten.');
      }
      
      // JSON aus der Antwort extrahieren
      let jsonStr = textContent.trim();
      // Falls in Markdown Code-Block
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      // Versuche JSON zu reparieren wenn es abgeschnitten wurde
      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch (parseError) {
        // Versuche abgeschnittenes JSON zu reparieren
        console.warn('JSON parse error, trying to repair...', parseError);
        
        // Finde die letzte vollständige Immobilie
        const lastCompleteIndex = jsonStr.lastIndexOf('},');
        if (lastCompleteIndex > 0) {
          // Schneide ab und schließe das Array/Objekt
          let repairedJson = jsonStr.substring(0, lastCompleteIndex + 1);
          
          // Zähle offene Klammern
          const openBrackets = (repairedJson.match(/\[/g) || []).length;
          const closeBrackets = (repairedJson.match(/\]/g) || []).length;
          const openBraces = (repairedJson.match(/\{/g) || []).length;
          const closeBraces = (repairedJson.match(/\}/g) || []).length;
          
          // Schließe offene Klammern
          for (let i = 0; i < openBrackets - closeBrackets; i++) repairedJson += ']';
          for (let i = 0; i < openBraces - closeBraces; i++) repairedJson += '}';
          
          try {
            result = JSON.parse(repairedJson);
            console.log('JSON repaired successfully');
          } catch (repairError) {
            throw new Error(`JSON konnte nicht repariert werden. Bitte versuche es mit kleineren Dokumenten.`);
          }
        } else {
          throw parseError;
        }
      }
      
      const immoArray = Array.isArray(result.immobilien) ? result.immobilien : [];
      const darlehenOhneZuordnung = Array.isArray(result.darlehen_ohne_zuordnung) ? result.darlehen_ohne_zuordnung : [];
      
      // Wenn nur Darlehen gefunden wurden (keine Immobilien), trotzdem speichern
      if (immoArray.length === 0 && darlehenOhneZuordnung.length === 0) {
        setError('Keine Immobilien- oder Darlehensdaten im Dokument gefunden.');
        setParsing(false);
        setProcessingStatus(null);
        return;
      }

      const newParsedData = {
        filename: currentFile.name,
        dokumentTyp: result.dokumentTyp || 'sonstiges',
        dokumentBeschreibung: result.dokumentBeschreibung || 'Dokument',
        immobilien: immoArray.map(immo => ({
          ...immo,
          zuPruefen: immo.gefundeneFelder || Object.keys(immo).filter(k => !['gefundeneFelder', 'zuPruefen', 'darlehen'].includes(k))
        })),
        darlehenOhneZuordnung: darlehenOhneZuordnung
      };

      setDocumentType(result.dokumentTyp || 'sonstiges');
      
      // Speichere geparste Daten und kombiniere mit vorherigen
      const updatedAllParsed = [...allParsedData, newParsedData];
      setAllParsedData(updatedAllParsed);
      
      // Alle Immobilien und Darlehen sammeln
      let allImmobilien = updatedAllParsed.flatMap(pd => 
        pd.immobilien.map(immo => ({
          ...immo,
          quellenDokument: pd.filename,
          dokumentTyp: pd.dokumentTyp
        }))
      );
      
      // Alle Darlehen ohne Zuordnung sammeln
      const allDarlehenOhneZuordnung = updatedAllParsed.flatMap(pd => 
        (pd.darlehenOhneZuordnung || []).map(d => ({
          ...d,
          quellenDokument: pd.filename
        }))
      );
      
      // ZUORDNUNG: Darlehen zu Immobilien basierend auf lfdNr/immobilienNr
      if (allDarlehenOhneZuordnung.length > 0 && allImmobilien.length > 0) {
        allImmobilien = allImmobilien.map(immo => {
          // Finde passende Darlehen für diese Immobilie
          const passendeDarlehen = allDarlehenOhneZuordnung.filter(d => {
            // Matching über lfdNr/immobilienNr
            if (d.immobilienNr && immo.lfdNr && d.immobilienNr === immo.lfdNr) return true;
            if (d.lfdNr && immo.lfdNr && d.lfdNr === immo.lfdNr) return true;
            // Matching über Name/Adresse falls vorhanden
            if (d.immobilienName && immo.name && d.immobilienName.toLowerCase().includes(immo.name.toLowerCase())) return true;
            return false;
          });
          
          if (passendeDarlehen.length > 0) {
            // Darlehen zum darlehen-Array der Immobilie hinzufügen
            const existingDarlehen = immo.darlehen || [];
            const neueDarlehen = passendeDarlehen.map(d => ({
              name: d.name || `Darlehen ${d.lfdNr || ''}`,
              institut: d.institut || d.bank || '',
              kontonummer: d.kontonummer || '',
              typ: d.typ || 'annuitaeten',
              betrag: d.betrag || d.darlehenssumme || 0,
              zinssatz: d.zinssatz || d.sollzins || 0,
              effektivzins: d.effektivzins || 0,
              tilgung: d.tilgung || d.anfangstilgung || 2,
              monatsrate: d.monatsrate || d.rate || 0,
              sondertilgung: d.sondertilgung || 5,
              abschluss: d.abschluss || d.abschlussdatum || '',
              ersteRate: d.ersteRate || '',
              laufzeit: d.laufzeit || 0,
              zinsbindungJahre: d.zinsbindungJahre || d.zinsbindung || 10,
              zinsbindungEnde: d.zinsbindungEnde || '',
              restschuld: d.restschuld || 0
            }));
            
            return {
              ...immo,
              darlehen: [...existingDarlehen, ...neueDarlehen],
              zuPruefen: [...(immo.zuPruefen || []), 'darlehen']
            };
          }
          return immo;
        });
      }
      
      // Falls es nur Darlehen gibt (keine Immobilien), erstelle Dummy-Immobilien
      if (allImmobilien.length === 0 && allDarlehenOhneZuordnung.length > 0) {
        // Gruppiere Darlehen nach immobilienNr
        const darlehenByImmo = {};
        allDarlehenOhneZuordnung.forEach(d => {
          const key = d.immobilienNr || d.lfdNr || 'unknown';
          if (!darlehenByImmo[key]) darlehenByImmo[key] = [];
          darlehenByImmo[key].push(d);
        });
        
        allImmobilien = Object.entries(darlehenByImmo).map(([key, darlehen]) => ({
          name: `Immobilie ${key}`,
          lfdNr: parseInt(key) || 0,
          quellenDokument: darlehen[0]?.quellenDokument,
          dokumentTyp: 'darlehen_liste',
          darlehen: darlehen.map(d => ({
            name: d.name || `Darlehen`,
            institut: d.institut || d.bank || '',
            betrag: d.betrag || d.darlehenssumme || 0,
            zinssatz: d.zinssatz || 0,
            tilgung: d.tilgung || 2,
            monatsrate: d.monatsrate || 0,
            zinsbindungJahre: d.zinsbindungJahre || d.zinsbindung || 10
          })),
          zuPruefen: ['name', 'adresse', 'darlehen']
        }));
      }

      setParsedData({
        filename: files.map(f => f.name).join(', '),
        dokumentTyp: updatedAllParsed.map(p => p.dokumentTyp).join(' + '),
        dokumentBeschreibung: updatedAllParsed.map(p => p.dokumentBeschreibung).join(' | '),
        immobilien: allImmobilien,
        quellenDokumente: updatedAllParsed
      });
      
      setProcessingStatus('done');
      
    } catch (err) {
      console.error('Parse error:', err);
      setError(`Fehler beim Analysieren: ${err.message}`);
      setProcessingStatus(null);
    }
    
    setParsing(false);
  };

  const processNextFile = () => {
    if (currentFileIndex < files.length - 1) {
      const nextIndex = currentFileIndex + 1;
      setCurrentFileIndex(nextIndex);
      processFile(files[nextIndex]);
      setProcessingStatus(null);
    }
  };

  const handleImport = (immoData) => {
    const { gefundeneFelder, zuPruefen, quellenDokument, dokumentTyp, lfdNr, darlehen, werbungskosten, ...cleanData } = immoData;
    
    // Darlehen separat verarbeiten (nicht in stammdaten)
    const darlehenArray = Array.isArray(darlehen) ? darlehen.map(d => ({
      name: d.name || '',
      institut: d.institut || '',
      kontonummer: d.kontonummer || '',
      typ: d.typ || 'annuitaeten',
      betrag: d.betrag || 0,
      zinssatz: d.zinssatz || 0,
      effektivzins: d.effektivzins || 0,
      tilgung: d.tilgung || 2,
      monatsrate: d.monatsrate || 0,
      sondertilgung: d.sondertilgung || 5,
      abschluss: d.abschluss || '',
      ersteRate: d.ersteRate || '',
      laufzeit: d.laufzeit || 0,
      zinsbindungJahre: d.zinsbindungJahre || 10,
      zinsbindungEnde: d.zinsbindungEnde || '',
      restschuld: d.restschuld || 0
    })) : [];
    
    // Werbungskosten nach Jahr gruppieren für steuerJahre
    const steuerJahre = {};
    if (Array.isArray(werbungskosten) && werbungskosten.length > 0) {
      werbungskosten.forEach(wk => {
        const jahr = wk.jahr || new Date().getFullYear();
        if (!steuerJahre[jahr]) {
          steuerJahre[jahr] = { wk: [], miet: 0, nkVor: 0, nkAbr: 0 };
        }
        steuerJahre[jahr].wk.push({
          bez: wk.bez || 'Werbungskosten',
          betrag: wk.betrag || 0
        });
      });
    }
    
    const newImmo = {
      ...createEmpty(),
      importiert: true,
      zuPruefen: zuPruefen || gefundeneFelder || [],
      darlehen: darlehenArray,
      steuerJahre: Object.keys(steuerJahre).length > 0 ? steuerJahre : {},
      stammdaten: {
        ...createEmpty().stammdaten,
        ...cleanData,
      }
    };
    onImport(newImmo);
  };

  // Für Merge mit bestehender Immobilie
  const prepareMerge = (immoData) => {
    if (!existingImmo) {
      handleImport(immoData);
      return;
    }
    
    const { gefundeneFelder, zuPruefen, ...newData } = immoData;
    const existing = existingImmo.stammdaten;
    
    const decisions = {};
    const autoFill = [];
    const conflicts = [];
    const unchanged = [];
    
    // Alle Felder durchgehen
    Object.entries(newData).forEach(([key, newValue]) => {
      if (newValue === undefined || newValue === null || newValue === '' || newValue === 0) return;
      
      const existingValue = existing[key];
      const isEmpty = existingValue === undefined || existingValue === null || existingValue === '' || existingValue === 0;
      
      if (isEmpty) {
        // Feld ist leer -> automatisch übernehmen
        autoFill.push({ key, newValue });
        decisions[key] = 'new';
      } else if (existingValue === newValue) {
        // Werte sind identisch -> nichts tun
        unchanged.push({ key, value: existingValue });
      } else {
        // Konflikt -> User entscheiden lassen
        conflicts.push({ key, existingValue, newValue });
        decisions[key] = 'keep'; // Default: behalten
      }
    });
    
    setMergeDecisions(decisions);
    setParsedData(prev => ({
      ...prev,
      mergeData: { newData, autoFill, conflicts, unchanged }
    }));
    setMergeMode(true);
  };

  const handleMergeDecision = (field, decision) => {
    setMergeDecisions(prev => ({ ...prev, [field]: decision }));
  };

  const executeMerge = () => {
    if (!existingImmo || !parsedData?.mergeData) return;
    
    const { newData, autoFill, conflicts } = parsedData.mergeData;
    const updatedStammdaten = { ...existingImmo.stammdaten };
    const mergedFields = [];
    
    // Auto-fill Felder übernehmen
    autoFill.forEach(({ key, newValue }) => {
      updatedStammdaten[key] = newValue;
      mergedFields.push(key);
    });
    
    // Konflikte nach User-Entscheidung
    conflicts.forEach(({ key, newValue }) => {
      if (mergeDecisions[key] === 'new') {
        updatedStammdaten[key] = newValue;
        mergedFields.push(key);
      }
    });
    
    const updatedImmo = {
      ...existingImmo,
      importiert: true,
      zuPruefen: mergedFields,
      stammdaten: updatedStammdaten,
    };
    
    onImport(updatedImmo);
  };

  const getDocTypeIcon = (docType) => {
    switch (docType) {
      case 'kaufvertrag': return <IconKaufpreis color="#10b981" />;
      case 'mietvertrag': return <IconMiete color="#ec4899" />;
      case 'darlehen': return <IconFinanz color="#3b82f6" />;
      case 'nebenkostenabrechnung': return <IconWerbung color="#f59e0b" />;
      case 'grundbuch': return <IconObjekt color="#8b5cf6" />;
      case 'auflistung': return <IconList color="#06b6d4" />;
      default: return <IconSteuer color="#6366f1" />;
    }
  };

  const getDocTypeName = (docType) => {
    const names = {
      kaufvertrag: 'Kaufvertrag / Exposé',
      mietvertrag: 'Mietvertrag',
      darlehen: 'Darlehensvertrag',
      darlehen_liste: 'Darlehen-Übersicht',
      nebenkostenabrechnung: 'Nebenkostenabrechnung',
      grundbuch: 'Grundbuchauszug',
      auflistung: 'Auflistung / Übersicht',
      sonstiges: 'Sonstiges Dokument'
    };
    return names[docType] || 'Dokument';
  };

  const formatFieldName = (field) => {
    const names = {
      name: 'Name', adresse: 'Adresse', typ: 'Typ', objektstatus: 'Status',
      nutzung: 'Nutzung', eigentuemer: 'Eigentümer', mieterName: 'Mieter',
      bundesland: 'Bundesland', kaufdatum: 'Kaufdatum', baujahr: 'Baujahr',
      wohnungsNr: 'Wohnungs-Nr.', etage: 'Etage',
      verkehrswert: 'Verkehrswert', verkehrswertDatum: 'Bewertungsdatum',
      kaufpreisImmobilie: 'Kaufpreis', kaufpreisStellplatz: 'Stellplatz-Preis',
      wohnflaeche: 'Wohnfläche', mieteProQm: 'Miete/qm', mieteStellplatz: 'Miete Stellplatz',
      kaltmiete: 'Kaltmiete', warmmiete: 'Warmmiete', mietbeginn: 'Mietbeginn', mietende: 'Mietende',
      anzahlStellplaetze: 'Stellplätze', mieteSonderausstattung: 'Miete Sonderausst.',
      nebenkostenVorauszahlung: 'NK-Vorauszahlung', kaution: 'Kaution',
      maklerProvision: 'Makler', grunderwerbsteuer: 'GrESt', notarkosten: 'Notar',
      darlehenssumme: 'Darlehenssumme', darlehenAbschluss: 'Darlehen Abschluss',
      zinsbindung: 'Zinsbindung', monatlicheRate: 'Monatl. Rate', laufzeit: 'Laufzeit',
      eigenkapitalAnteil: 'EK-Anteil', zinssatz: 'Zinssatz', tilgung: 'Tilgung',
      afaSatz: 'AfA-Satz', steuersatz: 'Steuersatz',
      grundstueckGroesse: 'Grundstück', bodenrichtwert: 'Bodenrichtwert'
    };
    return names[field] || field;
  };

  const formatValue = (field, value) => {
    if (value === undefined || value === null) return '–';
    if (['kaufpreisImmobilie', 'kaufpreisStellplatz', 'maklerProvision', 'grunderwerbsteuer', 'notarkosten', 'verkehrswert', 'darlehenssumme', 'kaltmiete', 'warmmiete', 'nebenkostenVorauszahlung', 'monatlicheRate', 'kaution'].includes(field)) {
      return fmt(value);
    }
    if (['mieteProQm', 'mieteStellplatz', 'mieteSonderausstattung', 'bodenrichtwert'].includes(field)) {
      return `${value} €`;
    }
    if (['eigenkapitalAnteil', 'zinssatz', 'tilgung', 'afaSatz', 'steuersatz'].includes(field)) {
      return `${value}%`;
    }
    if (field === 'wohnflaeche' || field === 'grundstueckGroesse') return `${value} qm`;
    if (field === 'laufzeit' || field === 'zinsbindung') return `${value} Jahre`;
    return String(value);
  };

  // Merge-Ansicht rendern
  const renderMergeView = () => {
    const { mergeData } = parsedData;
    const { autoFill, conflicts, unchanged } = mergeData;
    
    return (
      <div className="merge-view">
        <div className="merge-header">
          <div className="merge-header-icon">{getDocTypeIcon(documentType)}</div>
          <div className="merge-header-info">
            <strong>{getDocTypeName(documentType)}</strong>
            <small>Daten werden mit "{existingImmo.stammdaten.name}" zusammengeführt</small>
          </div>
        </div>
        
        {autoFill.length > 0 && (
          <div className="merge-section">
            <div className="merge-section-header auto">
              <span className="merge-badge auto">🟢 Wird automatisch ergänzt</span>
              <small>{autoFill.length} Feld{autoFill.length !== 1 ? 'er' : ''}</small>
            </div>
            <div className="merge-fields">
              {autoFill.map(({ key, newValue }) => (
                <div key={key} className="merge-field auto">
                  <span className="merge-field-name">{formatFieldName(key)}</span>
                  <span className="merge-field-value new">{formatValue(key, newValue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {conflicts.length > 0 && (
          <div className="merge-section">
            <div className="merge-section-header conflict">
              <span className="merge-badge conflict">🔄 Abweichung – bitte entscheiden</span>
              <small>{conflicts.length} Feld{conflicts.length !== 1 ? 'er' : ''}</small>
            </div>
            <div className="merge-conflicts">
              {conflicts.map(({ key, existingValue, newValue }) => (
                <div key={key} className="merge-conflict">
                  <div className="merge-conflict-header">
                    <strong>{formatFieldName(key)}</strong>
                  </div>
                  <div className="merge-conflict-options">
                    <label className={`merge-option ${mergeDecisions[key] === 'keep' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name={`merge-${key}`} 
                        checked={mergeDecisions[key] === 'keep'} 
                        onChange={() => handleMergeDecision(key, 'keep')}
                      />
                      <span className="merge-option-label">
                        <span className="merge-option-tag keep">Behalten</span>
                        <span className="merge-option-value">{formatValue(key, existingValue)}</span>
                      </span>
                    </label>
                    <label className={`merge-option ${mergeDecisions[key] === 'new' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name={`merge-${key}`} 
                        checked={mergeDecisions[key] === 'new'} 
                        onChange={() => handleMergeDecision(key, 'new')}
                      />
                      <span className="merge-option-label">
                        <span className="merge-option-tag new">Übernehmen</span>
                        <span className="merge-option-value">{formatValue(key, newValue)}</span>
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {unchanged.length > 0 && (
          <div className="merge-section">
            <div className="merge-section-header unchanged">
              <span className="merge-badge unchanged">⚪ Unverändert</span>
              <small>{unchanged.length} Feld{unchanged.length !== 1 ? 'er' : ''}</small>
            </div>
            <div className="merge-fields collapsed">
              {unchanged.slice(0, 3).map(({ key, value }) => (
                <div key={key} className="merge-field unchanged">
                  <span className="merge-field-name">{formatFieldName(key)}</span>
                  <span className="merge-field-value">{formatValue(key, value)}</span>
                </div>
              ))}
              {unchanged.length > 3 && (
                <div className="merge-field-more">+ {unchanged.length - 3} weitere</div>
              )}
            </div>
          </div>
        )}
        
        <div className="merge-actions">
          <button className="btn-back" onClick={() => setMergeMode(false)}>
            <span className="btn-icon-sm"><IconArrowLeft color="var(--text)" /></span>Zurück
          </button>
          <button className="btn-merge" onClick={executeMerge}>
            <span className="btn-icon-sm"><IconCheck color="#fff" /></span>
            Änderungen übernehmen
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconUpload color="#6366f1" /></span>
            {mergeMode ? 'Daten zusammenführen' : 'Dokument importieren'}
          </h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          {mergeMode && parsedData?.mergeData ? (
            renderMergeView()
          ) : !parsedData ? (
            <>
              {existingImmo && (
                <div className="import-target-info">
                  <span className="import-target-icon"><IconObjekt color="#6366f1" /></span>
                  <div>
                    <strong>Daten ergänzen für:</strong>
                    <span>{existingImmo.stammdaten.name}</span>
                  </div>
                </div>
              )}
              
              <div 
                className={`upload-zone ${files.length > 0 ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileSelect}
                  multiple
                  style={{ display: 'none' }}
                />
                {preview ? (
                  <img src={preview} alt="Preview" className="upload-preview" />
                ) : files.length > 0 ? (
                  <>
                    <div className="upload-icon"><IconSteuer color="#6366f1" /></div>
                    <p>{files.length} Dokument{files.length > 1 ? 'e' : ''} ausgewählt</p>
                    <small>{files.map(f => f.name).join(', ')}</small>
                  </>
                ) : (
                  <>
                    <div className="upload-icon"><IconUpload color="#6366f1" /></div>
                    <p>Dokumente hierher ziehen oder klicken</p>
                    <small>PDF, PNG, JPG • Mehrere Dateien möglich (z.B. Exposé + Darlehensvertrag)</small>
                  </>
                )}
              </div>
              
              {files.length > 0 && (
                <div className="files-list">
                  {files.map((f, i) => (
                    <div key={i} className={`file-item ${i === currentFileIndex ? 'current' : ''} ${i < currentFileIndex || (i === currentFileIndex && processingStatus === 'done') ? 'done' : ''}`}>
                      <span className="file-status">
                        {i < currentFileIndex || (i === currentFileIndex && processingStatus === 'done') ? '✓' : 
                         i === currentFileIndex && parsing ? '⏳' : 
                         (i + 1)}
                      </span>
                      <span className="file-name">{f.name}</span>
                      <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              )}
              
              {error && <div className="import-error">❌ {error}</div>}
              
              <div className="import-hint">
                <strong><span className="hint-icon"><IconAI color="#6366f1" /></span>KI-gestützte Analyse</strong>
                {existingImmo 
                  ? 'Das Dokument wird analysiert. Neue Daten werden ergänzt, bei Abweichungen kannst du entscheiden.'
                  : 'Das Dokument wird von Claude analysiert. Alle gefundenen Immobiliendaten werden extrahiert und als "zu prüfen" markiert.'
                }
              </div>
              
              <div className="import-doctype-hint">
                <strong>Unterstützte Dokumenttypen:</strong>
                <div className="doctype-list">
                  <span><span className="doctype-icon"><IconKaufpreis color="#10b981" /></span>Kaufvertrag/Exposé</span>
                  <span><span className="doctype-icon"><IconMiete color="#ec4899" /></span>Mietvertrag</span>
                  <span><span className="doctype-icon"><IconFinanz color="#3b82f6" /></span>Darlehensvertrag</span>
                  <span><span className="doctype-icon"><IconWerbung color="#f59e0b" /></span>Nebenkostenabrechnung</span>
                  <span><span className="doctype-icon"><IconObjekt color="#8b5cf6" /></span>Grundbuchauszug</span>
                  <span><span className="doctype-icon"><IconList color="#06b6d4" /></span>Auflistung/Übersicht</span>
                </div>
              </div>
            </>
          ) : (
            <div className="parse-results">
              <div className="parse-header">
                <span className="parse-icon-wrap">{getDocTypeIcon(documentType)}</span>
                <div>
                  <strong>{getDocTypeName(documentType)}</strong>
                  <small>{parsedData.dokumentBeschreibung || parsedData.filename}</small>
                </div>
              </div>
              
              <div className="parse-found-info-bar">
                <span className="parse-found-count">
                  <strong>{parsedData.immobilien.length}</strong> Immobilie{parsedData.immobilien.length !== 1 ? 'n' : ''} gefunden
                  {parsedData.immobilien.some(i => i.darlehen?.length > 0) && (
                    <span className="parse-darlehen-hint"> (inkl. Darlehen)</span>
                  )}
                </span>
                {parsedData.immobilien.length > 1 && !existingImmo && (
                  <button 
                    className="btn-import-all"
                    onClick={() => {
                      // Alle Immobilien als Array importieren (mit Darlehen!)
                      const allImmos = parsedData.immobilien.map(immo => {
                        const { gefundeneFelder, zuPruefen, quellenDokument, dokumentTyp, lfdNr, darlehen, ...cleanData } = immo;
                        
                        // Darlehen separat verarbeiten
                        const darlehenArray = Array.isArray(darlehen) ? darlehen.map(d => ({
                          name: d.name || '',
                          institut: d.institut || '',
                          kontonummer: d.kontonummer || '',
                          typ: d.typ || 'annuitaeten',
                          betrag: d.betrag || 0,
                          zinssatz: d.zinssatz || 0,
                          effektivzins: d.effektivzins || 0,
                          tilgung: d.tilgung || 2,
                          monatsrate: d.monatsrate || 0,
                          sondertilgung: d.sondertilgung || 5,
                          abschluss: d.abschluss || '',
                          ersteRate: d.ersteRate || '',
                          laufzeit: d.laufzeit || 0,
                          zinsbindungJahre: d.zinsbindungJahre || 10,
                          zinsbindungEnde: d.zinsbindungEnde || '',
                          restschuld: d.restschuld || 0
                        })) : [];
                        
                        return {
                          ...createEmpty(),
                          id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                          importiert: true,
                          zuPruefen: zuPruefen || gefundeneFelder || [],
                          darlehen: darlehenArray,
                          stammdaten: {
                            ...createEmpty().stammdaten,
                            ...cleanData,
                          }
                        };
                      });
                      onImport(allImmos);
                    }}
                  >
                    <IconCheck color="#fff" /> Alle {parsedData.immobilien.length} importieren
                  </button>
                )}
              </div>
              
              <div className="parsed-immos-scroll">
                {parsedData.immobilien.map((immo, idx) => (
                  <ParsedImmoCard 
                    key={idx}
                    immo={immo}
                    idx={idx}
                    total={parsedData.immobilien.length}
                    formatFieldName={formatFieldName}
                    formatValue={formatValue}
                    handleImport={existingImmo ? prepareMerge : handleImport}
                    buttonLabel={existingImmo ? 'Zusammenführen' : 'Importieren'}
                  />
                ))}
              </div>
              
              {parsedData.immobilien.length > 1 && !existingImmo && (
                <div className="parse-multi-hint">
                  <IconInfo color="#3b82f6" />
                  <span>Bei "Alle importieren" werden alle Immobilien direkt gespeichert (mit "zu prüfen" Markierung). Die erste wird zur Bearbeitung geöffnet, die anderen findest du in der Übersicht.</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="modal-f">
          {!parsedData ? (
            <>
              <button className="btn-pri" onClick={parseDocument} disabled={files.length === 0 || parsing}>
                {parsing ? (
                  <><span className="spinner"></span> Analysiere Dokument {currentFileIndex + 1}/{files.length}...</>
                ) : (
                  <><span className="btn-icon-sm"><IconSearch color="#fff" /></span>
                    {files.length > 1 ? `${files.length} Dokumente analysieren` : 'Dokument analysieren'}
                  </>
                )}
              </button>
              {processingStatus === 'done' && currentFileIndex < files.length - 1 && (
                <button className="btn-sec" onClick={processNextFile}>
                  <span className="btn-icon-sm"><IconArrowLeft color="#fafafa" style={{ transform: 'rotate(180deg)' }} /></span>
                  Nächstes Dokument ({currentFileIndex + 2}/{files.length})
                </button>
              )}
            </>
          ) : (
            <button className="btn-sec" onClick={() => { setParsedData(null); setFiles([]); setCurrentFileIndex(0); setAllParsedData([]); setPreview(null); setBase64Data(null); setProcessingStatus(null); }}>
              <span className="btn-icon-sm"><IconArrowLeft color="#fafafa" /></span>Andere Dokumente
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Tilgungsplan Modal
const TilgungsplanModal = ({ darlehen, onClose }) => {
  const [jahre, setJahre] = useState(Math.min(darlehen.laufzeit || darlehen.zinsbindungJahre || 15, 30));
  
  const berechne = () => {
    const betrag = darlehen.betrag || 0;
    const zinssatz = (darlehen.zinssatz || 0) / 100;
    const tilgung = (darlehen.tilgung || 2) / 100;
    
    let restschuld = darlehen.restschuld || betrag;
    const monatsrate = darlehen.monatsrate || (betrag * (zinssatz + tilgung) / 12);
    
    const plan = [];
    let gesamtZinsen = 0;
    let gesamtTilgung = 0;
    
    for (let j = 1; j <= jahre; j++) {
      const zinsenJahr = restschuld * zinssatz;
      const tilgungJahr = Math.min(monatsrate * 12 - zinsenJahr, restschuld);
      
      gesamtZinsen += zinsenJahr;
      gesamtTilgung += tilgungJahr;
      restschuld = Math.max(0, restschuld - tilgungJahr);
      
      plan.push({
        jahr: j,
        zinsen: zinsenJahr,
        tilgung: tilgungJahr,
        rate: zinsenJahr + tilgungJahr,
        restschuld: restschuld
      });
      
      if (restschuld <= 0) break;
    }
    
    return { plan, gesamtZinsen, gesamtTilgung, monatsrate };
  };
  
  const { plan, gesamtZinsen, gesamtTilgung, monatsrate } = berechne();
  
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tilgungsplan-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconChart color="#3b82f6" /></span>Tilgungsplan</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          <div className="tp-header">
            <div className="tp-info">
              <strong>{darlehen.name || darlehen.institut || 'Darlehen'}</strong>
              <span>{fmt(darlehen.betrag)} · {darlehen.zinssatz}% Zins · {darlehen.tilgung}% Tilgung</span>
            </div>
            <div className="tp-rate">
              <span>Monatsrate</span>
              <strong>{fmt(monatsrate)}</strong>
            </div>
          </div>
          
          <div className="tp-control">
            <label>Zeitraum:</label>
            <input type="range" min="5" max="30" value={jahre} onChange={e => setJahre(parseInt(e.target.value))} />
            <span>{jahre} Jahre</span>
          </div>
          
          <div className="tp-summary">
            <div className="tp-sum-item">
              <span>Gesamtzinsen</span>
              <b className="neg">{fmt(gesamtZinsen)}</b>
            </div>
            <div className="tp-sum-item">
              <span>Gesamttilgung</span>
              <b className="pos">{fmt(gesamtTilgung)}</b>
            </div>
            <div className="tp-sum-item">
              <span>Restschuld nach {jahre} J.</span>
              <b>{fmt(plan[plan.length - 1]?.restschuld || 0)}</b>
            </div>
          </div>
          
          {/* Grafische Darstellung */}
          <div className="tp-chart">
            <div className="tp-chart-bars">
              {plan.map((p, i) => (
                <div key={i} className="tp-bar-group" title={`Jahr ${p.jahr}: ${fmt(p.restschuld)} Restschuld`}>
                  <div className="tp-bar-stack">
                    <div className="tp-bar-zinsen" style={{ height: `${(p.zinsen / (plan[0]?.rate || 1)) * 100}%` }}></div>
                    <div className="tp-bar-tilgung" style={{ height: `${(p.tilgung / (plan[0]?.rate || 1)) * 100}%` }}></div>
                  </div>
                  {(i === 0 || i === plan.length - 1 || i % 5 === 4) && <span className="tp-bar-label">{p.jahr}</span>}
                </div>
              ))}
            </div>
            <div className="tp-chart-legend">
              <span><span className="tp-dot zinsen"></span>Zinsen</span>
              <span><span className="tp-dot tilgung"></span>Tilgung</span>
            </div>
          </div>
          
          {/* Tabelle */}
          <div className="tp-table-wrap">
            <table className="tp-table">
              <thead>
                <tr>
                  <th>Jahr</th>
                  <th>Zinsen</th>
                  <th>Tilgung</th>
                  <th>Rate</th>
                  <th>Restschuld</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(p => (
                  <tr key={p.jahr}>
                    <td>{p.jahr}</td>
                    <td className="neg">{fmt(p.zinsen)}</td>
                    <td className="pos">{fmt(p.tilgung)}</td>
                    <td>{fmt(p.rate)}</td>
                    <td><strong>{fmt(p.restschuld)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="modal-f">
          <button className="btn-sec" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
};

// Anschlussfinanzierung-Rechner Modal
const AnschlussfinanzierungModal = ({ darlehen, onClose }) => {
  const [neuerZins, setNeuerZins] = useState(darlehen.zinssatz + 1);
  const [neueTilgung, setNeueTilgung] = useState(darlehen.tilgung || 2);
  const [sondertilgung, setSondertilgung] = useState(0);
  
  const restschuld = darlehen.restschuld || darlehen.betrag * 0.8;
  const restschuldNachSonder = restschuld - sondertilgung;
  
  const berechneRate = (betrag, zins, tilg) => betrag * ((zins + tilg) / 100) / 12;
  
  const alteRate = berechneRate(restschuld, darlehen.zinssatz, darlehen.tilgung || 2);
  const neueRate = berechneRate(restschuldNachSonder, neuerZins, neueTilgung);
  const differenz = neueRate - alteRate;
  
  // Szenarien
  const szenarien = [
    { name: 'Optimistisch', zins: darlehen.zinssatz },
    { name: 'Moderat', zins: darlehen.zinssatz + 1 },
    { name: 'Pessimistisch', zins: darlehen.zinssatz + 2 },
    { name: 'Worst Case', zins: darlehen.zinssatz + 3 },
  ];
  
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal anschluss-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconFinanz color="#f59e0b" /></span>Anschlussfinanzierung</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          <div className="anschluss-info">
            <div className="anschluss-info-row">
              <span>Aktuelles Darlehen</span>
              <strong>{darlehen.name || darlehen.institut}</strong>
            </div>
            <div className="anschluss-info-row">
              <span>Restschuld (geschätzt)</span>
              <strong>{fmt(restschuld)}</strong>
            </div>
            <div className="anschluss-info-row">
              <span>Zinsbindung endet</span>
              <strong>{darlehen.zinsbindungEnde ? new Date(darlehen.zinsbindungEnde).toLocaleDateString('de-DE') : 'Nicht angegeben'}</strong>
            </div>
          </div>
          
          <div className="anschluss-inputs">
            <h4>Neue Konditionen simulieren</h4>
            <div className="anschluss-input-row">
              <label>Sondertilgung vor Ablauf</label>
              <NumInput value={sondertilgung} onChange={setSondertilgung} /> €
            </div>
            <div className="anschluss-input-row">
              <label>Neuer Zinssatz</label>
              <NumInput value={neuerZins} onChange={setNeuerZins} /> %
            </div>
            <div className="anschluss-input-row">
              <label>Neue Tilgung</label>
              <NumInput value={neueTilgung} onChange={setNeueTilgung} /> %
            </div>
          </div>
          
          <div className="anschluss-result">
            <div className="anschluss-result-item">
              <span>Neue Restschuld</span>
              <b>{fmt(restschuldNachSonder)}</b>
            </div>
            <div className="anschluss-result-item">
              <span>Alte Rate</span>
              <b>{fmt(alteRate)}/Mon.</b>
            </div>
            <div className="anschluss-result-item highlight">
              <span>Neue Rate</span>
              <b className={differenz > 0 ? 'neg' : 'pos'}>{fmt(neueRate)}/Mon.</b>
            </div>
            <div className="anschluss-result-item">
              <span>Differenz</span>
              <b className={differenz > 0 ? 'neg' : 'pos'}>{differenz > 0 ? '+' : ''}{fmt(differenz)}/Mon.</b>
            </div>
          </div>
          
          <h4>Szenarien-Vergleich</h4>
          <div className="anschluss-szenarien">
            {szenarien.map((s, i) => {
              const rate = berechneRate(restschuldNachSonder, s.zins, neueTilgung);
              const diff = rate - alteRate;
              return (
                <div key={i} className={`szenario-card ${i === 1 ? 'active' : ''}`}>
                  <span className="szenario-name">{s.name}</span>
                  <span className="szenario-zins">{s.zins.toFixed(1)}% Zins</span>
                  <span className="szenario-rate">{fmt(rate)}/Mon.</span>
                  <span className={`szenario-diff ${diff > 0 ? 'neg' : 'pos'}`}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="modal-f">
          <button className="btn-sec" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
};

// Jahresübersicht / Reporting Modal
const JahresreportModal = ({ immobilien, onClose }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // Berechne Jahreswerte
  const berechneJahr = (year) => {
    let einnahmen = 0;
    let darlehenskosten = 0;
    let nkVorauszahlung = 0;
    
    immobilien.forEach(immo => {
      const s = immo.stammdaten;
      // Mieteinnahmen
      const monatsmiete = (s.wohnflaeche || 0) * (s.mieteProQm || 0) + (s.anzahlStellplaetze || 0) * (s.mieteStellplatz || 0);
      einnahmen += monatsmiete * 12;
      
      // Darlehensraten
      (immo.darlehen || []).forEach(d => {
        darlehenskosten += (d.monatsrate || 0) * 12;
      });
      
      // NK-Vorauszahlung
      nkVorauszahlung += (s.nebenkostenVorauszahlung || 0) * 12;
    });
    
    const cashflow = einnahmen - darlehenskosten - nkVorauszahlung;
    
    return { year, einnahmen, darlehenskosten, nkVorauszahlung, cashflow };
  };
  
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const jahresData = years.map(y => berechneJahr(y));
  const selectedData = berechneJahr(selectedYear);
  
  const maxValue = Math.max(...jahresData.map(d => Math.max(d.einnahmen, d.darlehenskosten + d.nkVorauszahlung)));
  
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal jahresreport-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconChart color="#10b981" /></span>Jahresübersicht</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          <div className="jr-year-selector">
            {years.map(y => (
              <button key={y} className={`jr-year-btn ${y === selectedYear ? 'active' : ''}`} onClick={() => setSelectedYear(y)}>
                {y}
              </button>
            ))}
          </div>
          
          <div className="jr-summary">
            <div className="jr-sum-card pos">
              <span>Mieteinnahmen</span>
              <b>{fmt(selectedData.einnahmen)}</b>
              <small>{fmt(selectedData.einnahmen / 12)}/Monat</small>
            </div>
            <div className="jr-sum-card neg">
              <span>Darlehenskosten</span>
              <b>{fmt(selectedData.darlehenskosten)}</b>
              <small>{fmt(selectedData.darlehenskosten / 12)}/Monat</small>
            </div>
            <div className="jr-sum-card neutral">
              <span>NK-Vorauszahlung</span>
              <b>{fmt(selectedData.nkVorauszahlung)}</b>
              <small>{fmt(selectedData.nkVorauszahlung / 12)}/Monat</small>
            </div>
            <div className={`jr-sum-card ${selectedData.cashflow >= 0 ? 'pos' : 'neg'} highlight`}>
              <span>Cashflow</span>
              <b>{fmt(selectedData.cashflow)}</b>
              <small>{fmt(selectedData.cashflow / 12)}/Monat</small>
            </div>
          </div>
          
          <h4>Jahresvergleich</h4>
          <div className="jr-chart">
            {jahresData.map((d, i) => (
              <div key={i} className={`jr-chart-col ${d.year === selectedYear ? 'active' : ''}`}>
                <div className="jr-bars">
                  <div className="jr-bar einnahmen" style={{ height: `${(d.einnahmen / maxValue) * 100}%` }} title={`Einnahmen: ${fmt(d.einnahmen)}`}></div>
                  <div className="jr-bar ausgaben" style={{ height: `${((d.darlehenskosten + d.nkVorauszahlung) / maxValue) * 100}%` }} title={`Ausgaben: ${fmt(d.darlehenskosten + d.nkVorauszahlung)}`}></div>
                </div>
                <span className="jr-year-label">{d.year}</span>
                <span className={`jr-cashflow ${d.cashflow >= 0 ? 'pos' : 'neg'}`}>{d.cashflow >= 0 ? '+' : ''}{(d.cashflow / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
          <div className="jr-legend">
            <span><span className="jr-dot einnahmen"></span>Einnahmen</span>
            <span><span className="jr-dot ausgaben"></span>Ausgaben</span>
          </div>
          
          <h4>Aufschlüsselung nach Immobilie</h4>
          <div className="jr-immo-list">
            {immobilien.map((immo, i) => {
              const s = immo.stammdaten;
              const miete = ((s.wohnflaeche || 0) * (s.mieteProQm || 0) + (s.anzahlStellplaetze || 0) * (s.mieteStellplatz || 0)) * 12;
              const darlehen = (immo.darlehen || []).reduce((sum, d) => sum + (d.monatsrate || 0) * 12, 0);
              const cf = miete - darlehen;
              return (
                <div key={i} className="jr-immo-row">
                  <span className="jr-immo-name">{s.name}</span>
                  <span className="jr-immo-miete pos">+{fmt(miete)}</span>
                  <span className="jr-immo-darlehen neg">-{fmt(darlehen)}</span>
                  <span className={`jr-immo-cf ${cf >= 0 ? 'pos' : 'neg'}`}>{cf >= 0 ? '+' : ''}{fmt(cf)}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="modal-f">
          <button className="btn-sec" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
};

// Nebenkostenabrechnung
const NebenkostenSection = ({ immo, onUpdate }) => {
  const s = immo.stammdaten;
  const [abrechnungen, setAbrechnungen] = useState(immo.nebenkostenabrechnungen || []);
  const [showForm, setShowForm] = useState(false);
  const [newAbr, setNewAbr] = useState({ jahr: new Date().getFullYear() - 1, vorauszahlung: 0, abrechnung: 0, nachzahlung: 0 });
  
  const berechneNachzahlung = () => {
    const voraus = (s.nebenkostenVorauszahlung || 0) * 12;
    return newAbr.abrechnung - voraus;
  };
  
  const addAbrechnung = () => {
    const nachzahlung = berechneNachzahlung();
    const updated = [...abrechnungen, { ...newAbr, vorauszahlung: (s.nebenkostenVorauszahlung || 0) * 12, nachzahlung }];
    setAbrechnungen(updated);
    onUpdate({ ...immo, nebenkostenabrechnungen: updated });
    setShowForm(false);
    setNewAbr({ jahr: new Date().getFullYear() - 1, vorauszahlung: 0, abrechnung: 0, nachzahlung: 0 });
  };
  
  const removeAbrechnung = (idx) => {
    const updated = abrechnungen.filter((_, i) => i !== idx);
    setAbrechnungen(updated);
    onUpdate({ ...immo, nebenkostenabrechnungen: updated });
  };
  
  return (
    <div className="nk-section">
      <p className="hint">Jährliche Nebenkostenabrechnungen erfassen und Nachzahlung/Guthaben berechnen</p>
      
      {abrechnungen.length > 0 && (
        <div className="nk-list">
          {abrechnungen.sort((a, b) => b.jahr - a.jahr).map((abr, idx) => (
            <div key={idx} className="nk-item">
              <span className="nk-jahr">{abr.jahr}</span>
              <span className="nk-voraus">Voraus: {fmt(abr.vorauszahlung)}</span>
              <span className="nk-tatsaechlich">Kosten: {fmt(abr.abrechnung)}</span>
              <span className={`nk-ergebnis ${abr.nachzahlung > 0 ? 'neg' : 'pos'}`}>
                {abr.nachzahlung > 0 ? 'Nachz.' : 'Guthaben'}: {fmt(Math.abs(abr.nachzahlung))}
              </span>
              <button className="btn-del-small" onClick={() => removeAbrechnung(idx)}>×</button>
            </div>
          ))}
        </div>
      )}
      
      {showForm && (
        <div className="nk-form">
          <div className="nk-form-row">
            <label>Jahr</label>
            <input type="text" inputMode="numeric" value={newAbr.jahr} onChange={e => setNewAbr({ ...newAbr, jahr: parseInt(e.target.value) || new Date().getFullYear() - 1 })} />
          </div>
          <div className="nk-form-row">
            <label>Vorauszahlung (Jahr)</label>
            <span className="nk-calc">{fmt((s.nebenkostenVorauszahlung || 0) * 12)}</span>
          </div>
          <div className="nk-form-row">
            <label>Tatsächliche Kosten</label>
            <NumInput value={newAbr.abrechnung} onChange={v => setNewAbr({ ...newAbr, abrechnung: v })} /> €
          </div>
          <div className="nk-form-row result">
            <label>{berechneNachzahlung() > 0 ? 'Nachzahlung' : 'Guthaben'}</label>
            <span className={berechneNachzahlung() > 0 ? 'neg' : 'pos'}>{fmt(Math.abs(berechneNachzahlung()))}</span>
          </div>
          <div className="nk-form-buttons">
            <button className="btn-add" onClick={addAbrechnung}>Speichern</button>
            <button className="btn-cancel" onClick={() => setShowForm(false)}>Abbrechen</button>
          </div>
        </div>
      )}
      
      {!showForm && (
        <button className="btn-add" onClick={() => setShowForm(true)}>+ Abrechnung hinzufügen</button>
      )}
    </div>
  );
};

// Mieter-Verwaltung
// Toast Notification Component
const Toast = ({ toast }) => {
  if (!toast) return null;
  
  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-icon">
        {toast.type === 'success' && <IconCheck color="#fff" />}
        {toast.type === 'warning' && <IconInfo color="#fff" />}
        {toast.type === 'error' && <IconClose color="#fff" />}
      </span>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
};

// Darlehen Import Modal
// Miethistorie Import Modal
const MiethistorieImportModal = ({ onClose, onImport }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsedMiethistorie, setParsedMiethistorie] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = React.useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) processFile(selectedFile);
  };

  const processFile = (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setParsedMiethistorie(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      setBase64Data(result.split(',')[1]);
      if (selectedFile.type.startsWith('image/')) {
        setPreview(result);
      } else {
        setPreview(null);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  };

  const getMediaType = () => {
    if (!file) return null;
    if (file.type === 'application/pdf') return 'application/pdf';
    if (file.type.startsWith('image/')) return file.type;
    return file.type;
  };

  const parseDocument = async () => {
    if (!file || !base64Data) return;
    setParsing(true);
    setError(null);
    
    const mediaType = getMediaType();
    const isPDF = mediaType === 'application/pdf';
    
    const systemPrompt = `Du bist ein Experte für die Analyse von Mietverträgen.
Extrahiere die Mietdaten aus dem Dokument für die Miethistorie.

Antworte NUR mit einem validen JSON-Objekt. Keine Erklärungen, kein Markdown.

Format:
{
  "miethistorie": [{
    "von": "2020-01-01",
    "bis": "2024-12-31",
    "kaltmiete": 800,
    "nebenkosten": 200,
    "stellplatz": 50,
    "sonstiges": 0,
    "grund": "Mieter: Familie Müller"
  }]
}

Wichtig:
- Extrahiere Mietbeginn (von) und Mietende (bis) wenn vorhanden
- kaltmiete = Grundmiete/Nettokaltmiete pro Monat
- nebenkosten = NK-Vorauszahlung/Betriebskosten pro Monat
- stellplatz = Miete für Stellplatz/Garage pro Monat
- sonstiges = Sonstige Mietbestandteile (z.B. Küche, Möbel) pro Monat
- grund = Mieter-Name oder Anmerkungen zum Mietverhältnis
- Zahlen als Nummern, nicht als Strings
- Datumsformat: YYYY-MM-DD
- Bei unklaren Werten 0 oder leer lassen`;

    try {
      const fullPrompt = systemPrompt + "\n\nExtrahiere die Mietdaten aus diesem Mietvertrag für die Miethistorie. Antworte nur mit JSON.";

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mediaType,
          systemPrompt: fullPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API Fehler: ${response.status}`);
      }

      const data = await response.json();
      const textContent = data.text || '';
      
      let jsonStr = textContent.trim();
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      if (parsed.miethistorie && parsed.miethistorie.length > 0) {
        setParsedMiethistorie(parsed.miethistorie);
      } else {
        setError('Keine Mietdaten im Dokument gefunden');
      }
    } catch (err) {
      setError(`Fehler: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleImportAll = () => {
    if (parsedMiethistorie) {
      onImport(parsedMiethistorie);
      onClose();
    }
  };

  const handleImportSingle = (eintrag) => {
    onImport([eintrag]);
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-import" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconHistory color="#ec4899" /></span>Miethistorie importieren</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          {!parsedMiethistorie ? (
            <>
              <div 
                className={`upload-zone ${file ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {preview ? (
                  <img src={preview} alt="Preview" className="upload-preview" />
                ) : file ? (
                  <>
                    <div className="upload-icon"><IconHistory color="#ec4899" /></div>
                    <p>{file.name}</p>
                    <small>Bereit zur Analyse</small>
                  </>
                ) : (
                  <>
                    <div className="upload-icon"><IconUpload color="#ec4899" /></div>
                    <p>Alten Mietvertrag hierher ziehen</p>
                    <small>PDF, PNG, JPG • Mietvertrag, Mieterhöhung, Nachtrag</small>
                  </>
                )}
              </div>
              
              {error && <div className="import-error">❌ {error}</div>}
              
              <div className="import-hint" style={{ borderColor: 'rgba(236,72,153,0.3)', background: 'rgba(236,72,153,0.05)' }}>
                <strong><span className="hint-icon"><IconAI color="#ec4899" /></span>KI-Analyse</strong>
                Das Dokument wird analysiert und die Mietdaten für die Historie extrahiert.
              </div>
            </>
          ) : (
            <div className="parsed-darlehen">
              <div className="parsed-darlehen-header" style={{ background: 'rgba(236,72,153,0.1)' }}>
                <span className="parsed-icon"><IconCheck color="#22c55e" /></span>
                <span>{parsedMiethistorie.length} Mietperiode{parsedMiethistorie.length !== 1 ? 'n' : ''} gefunden</span>
              </div>
              
              <div className="parsed-darlehen-list">
                {parsedMiethistorie.map((m, i) => {
                  const warmmiete = (m.kaltmiete || 0) + (m.nebenkosten || 0) + (m.stellplatz || 0) + (m.sonstiges || 0);
                  return (
                    <div key={i} className="parsed-darlehen-card" style={{ borderColor: 'rgba(236,72,153,0.3)' }}>
                      <div className="pdc-header">
                        <strong>{m.grund || `Mietperiode ${i + 1}`}</strong>
                        <small>{m.von ? formatDateDE(m.von) : '?'} – {m.bis ? formatDateDE(m.bis) : 'offen'}</small>
                      </div>
                      <div className="pdc-details">
                        {m.kaltmiete > 0 && <span><b>Kaltmiete:</b> {fmt(m.kaltmiete)}</span>}
                        {m.nebenkosten > 0 && <span><b>NK:</b> {fmt(m.nebenkosten)}</span>}
                        {m.stellplatz > 0 && <span><b>Stellplatz:</b> {fmt(m.stellplatz)}</span>}
                        {m.sonstiges > 0 && <span><b>Sonstiges:</b> {fmt(m.sonstiges)}</span>}
                        <span><b>Gesamt:</b> {fmt(warmmiete)}/Mon.</span>
                      </div>
                      <button className="btn-import-single" style={{ borderColor: '#ec4899', color: '#ec4899' }} onClick={() => handleImportSingle(m)}>
                        Nur diesen importieren
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-f">
          {!parsedMiethistorie ? (
            <button className="btn-pri" style={{ background: '#ec4899' }} onClick={parseDocument} disabled={!file || parsing}>
              {parsing ? (
                <><span className="spinner"></span> Analysiere...</>
              ) : (
                <><span className="btn-icon-sm"><IconSearch color="#fff" /></span>Dokument analysieren</>
              )}
            </button>
          ) : (
            <>
              <button className="btn-sec" onClick={() => { setParsedMiethistorie(null); setFile(null); setPreview(null); }}>
                ← Anderes Dokument
              </button>
              <button className="btn-pri" style={{ background: '#ec4899' }} onClick={handleImportAll}>
                <span className="btn-icon-sm"><IconCheck color="#fff" /></span>
                Alle {parsedMiethistorie.length} importieren
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const DarlehenImportModal = ({ onClose, onImport }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsedDarlehen, setParsedDarlehen] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = React.useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) processFile(selectedFile);
  };

  const processFile = (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setParsedDarlehen(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      setBase64Data(result.split(',')[1]);
      if (selectedFile.type.startsWith('image/')) {
        setPreview(result);
      } else {
        setPreview(null);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  };

  const getMediaType = () => {
    if (!file) return null;
    if (file.type === 'application/pdf') return 'application/pdf';
    if (file.type.startsWith('image/')) return file.type;
    return file.type;
  };

  const parseDocument = async () => {
    if (!file || !base64Data) return;
    setParsing(true);
    setError(null);
    
    const mediaType = getMediaType();
    const isPDF = mediaType === 'application/pdf';
    
    const systemPrompt = `Du bist ein Experte für die Analyse von Darlehensverträgen und Finanzierungsdokumenten.
Extrahiere alle Darlehen aus dem Dokument.

Antworte NUR mit einem validen JSON-Objekt. Keine Erklärungen, kein Markdown.

Format:
{
  "darlehen": [{
    "name": "Bezeichnung des Darlehens",
    "institut": "Name der Bank/des Instituts",
    "kontonummer": "Darlehenskontonummer falls vorhanden",
    "typ": "annuitaeten|tilgung|endfaellig|kfw|bauspar|privat|forward|sonstig",
    "betrag": 200000,
    "zinssatz": 3.5,
    "effektivzins": 3.65,
    "tilgung": 2,
    "monatsrate": 916.67,
    "sondertilgung": 5,
    "abschluss": "2024-01-15",
    "ersteRate": "2024-03-01",
    "laufzeit": 30,
    "zinsbindungJahre": 10,
    "zinsbindungEnde": "2034-01-15",
    "restschuld": 180000
  }]
}

Wichtig:
- Extrahiere ALLE Darlehen die im Dokument gefunden werden
- Zahlen als Nummern, nicht als Strings
- Datumsformat: YYYY-MM-DD
- Bei unklaren Werten weglassen
- typ: annuitaeten (Standard), tilgung, endfaellig, kfw, bauspar, privat, forward, sonstig`;

    try {
      const fullPrompt = systemPrompt + "\n\nExtrahiere alle Darlehen aus diesem Dokument. Antworte nur mit JSON.";

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mediaType,
          systemPrompt: fullPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API Fehler: ${response.status}`);
      }

      const data = await response.json();
      const textContent = data.text || '';
      
      let jsonStr = textContent.trim();
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const result = JSON.parse(jsonStr);
      const darlehenArray = result.darlehen || (Array.isArray(result) ? result : [result]);
      
      if (darlehenArray.length === 0) {
        setError('Keine Darlehen im Dokument gefunden.');
        setParsing(false);
        return;
      }

      setParsedDarlehen(darlehenArray);
      
    } catch (err) {
      console.error('Parse error:', err);
      setError(`Fehler beim Analysieren: ${err.message}`);
    }
    
    setParsing(false);
  };

  const handleImportAll = () => {
    if (parsedDarlehen) {
      onImport(parsedDarlehen);
    }
  };

  const handleImportSingle = (darlehen) => {
    onImport([darlehen]);
  };

  const formatValue = (key, value) => {
    if (value === undefined || value === null || value === '') return '–';
    if (['betrag', 'monatsrate', 'restschuld'].includes(key)) return fmt(value);
    if (['zinssatz', 'effektivzins', 'tilgung', 'sondertilgung'].includes(key)) return `${value}%`;
    if (['laufzeit', 'zinsbindungJahre'].includes(key)) return `${value} J.`;
    return String(value);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal darlehen-import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2><span className="modal-icon"><IconBank color="#3b82f6" /></span>Darlehen importieren</h2>
          <button onClick={onClose}>×</button>
        </div>
        
        <div className="modal-b">
          {!parsedDarlehen ? (
            <>
              <div 
                className={`upload-zone ${file ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {preview ? (
                  <img src={preview} alt="Preview" className="upload-preview" />
                ) : file ? (
                  <>
                    <div className="upload-icon"><IconBank color="#3b82f6" /></div>
                    <p>{file.name}</p>
                    <small>Bereit zur Analyse</small>
                  </>
                ) : (
                  <>
                    <div className="upload-icon"><IconUpload color="#3b82f6" /></div>
                    <p>Darlehensvertrag hierher ziehen</p>
                    <small>PDF, PNG, JPG • Darlehensvertrag, Konditionenangebot, Finanzierungsübersicht</small>
                  </>
                )}
              </div>
              
              {error && <div className="import-error">❌ {error}</div>}
              
              <div className="import-hint">
                <strong><span className="hint-icon"><IconAI color="#3b82f6" /></span>KI-Analyse</strong>
                Das Dokument wird analysiert und alle Darlehen automatisch extrahiert.
              </div>
            </>
          ) : (
            <div className="parsed-darlehen">
              <div className="parsed-darlehen-header">
                <span className="parsed-icon"><IconCheck color="#22c55e" /></span>
                <span>{parsedDarlehen.length} Darlehen gefunden</span>
              </div>
              
              <div className="parsed-darlehen-list">
                {parsedDarlehen.map((d, i) => (
                  <div key={i} className="parsed-darlehen-card">
                    <div className="pdc-header">
                      <strong>{d.name || d.institut || `Darlehen ${i + 1}`}</strong>
                      {d.institut && d.name && <small>{d.institut}</small>}
                    </div>
                    <div className="pdc-details">
                      {d.betrag > 0 && <span><b>Betrag:</b> {fmt(d.betrag)}</span>}
                      {d.zinssatz > 0 && <span><b>Zins:</b> {d.zinssatz}%</span>}
                      {d.tilgung > 0 && <span><b>Tilgung:</b> {d.tilgung}%</span>}
                      {d.monatsrate > 0 && <span><b>Rate:</b> {fmt(d.monatsrate)}/Mon.</span>}
                      {d.zinsbindungJahre > 0 && <span><b>Zinsbindung:</b> {d.zinsbindungJahre} J.</span>}
                    </div>
                    <button className="btn-import-single" onClick={() => handleImportSingle(d)}>
                      Nur dieses importieren
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-f">
          {!parsedDarlehen ? (
            <button className="btn-pri" onClick={parseDocument} disabled={!file || parsing}>
              {parsing ? (
                <><span className="spinner"></span> Analysiere...</>
              ) : (
                <><span className="btn-icon-sm"><IconSearch color="#fff" /></span>Dokument analysieren</>
              )}
            </button>
          ) : (
            <>
              <button className="btn-sec" onClick={() => { setParsedDarlehen(null); setFile(null); setPreview(null); }}>
                ← Anderes Dokument
              </button>
              <button className="btn-pri" onClick={handleImportAll}>
                <span className="btn-icon-sm"><IconCheck color="#fff" /></span>
                Alle {parsedDarlehen.length} importieren
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Stammdaten
const Stamm = ({ p, upd, c, onSave, saved, onOpenImport, onDelete, onDiscard, validationErrors = {}, beteiligte = [] }) => {
  const [sec, setSec] = useState(null);
  const [secExpanded, setSecExpanded] = useState(false);
  const [darlehenImportModal, setDarlehenImportModal] = useState(false);
  const [tilgungsplanDarlehen, setTilgungsplanDarlehen] = useState(null);
  const [mhistOpen, setMhistOpen] = useState(false);
  const [mhistImportModal, setMhistImportModal] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(null); // 'objekt' | 'kaufpreis' | 'miete' | etc.
  const s = p.stammdaten;
  const zuPruefen = p.zuPruefen || [];
  const istImportiert = p.importiert && zuPruefen.length > 0;
  
  const markAsReviewed = () => {
    upd({ ...p, zuPruefen: [], importiert: false });
  };
  
  // Funktion zur Prüfung von Zeitraum-Überschneidungen
  const checkOverlap = (von, bis, historie) => {
    if (!von) return null;
    const vonDate = new Date(von);
    const bisDate = bis ? new Date(bis) : new Date();
    
    for (const eintrag of historie) {
      if (!eintrag.von) continue;
      const eVon = new Date(eintrag.von);
      const eBis = eintrag.bis ? new Date(eintrag.bis) : new Date();
      
      // Überschneidung prüfen: (Start1 <= Ende2) && (Start2 <= Ende1)
      if (vonDate <= eBis && eVon <= bisDate) {
        return {
          von: eintrag.von,
          bis: eintrag.bis,
          grund: eintrag.grund
        };
      }
    }
    return null;
  };
  
  // Überschneidung berechnen für Anzeige
  const overlap = React.useMemo(() => {
    return checkOverlap(s.mietbeginn, s.mietende, p.miethistorie || []);
  }, [s.mietbeginn, s.mietende, p.miethistorie]);
  
  // Funktion zum Archivieren des aktuellen Mieters in die Historie
  const archiveMieter = () => {
    const neuerHistorieEintrag = {
      von: s.mietbeginn || '',
      bis: s.mietende || new Date().toISOString().split('T')[0],
      kaltmiete: s.kaltmiete || 0,
      nebenkosten: s.nebenkostenVorauszahlung || 0,
      stellplatz: s.mieteStellplatz || 0,
      sonstiges: s.mieteSonderausstattung || 0,
      grund: s.mieterName ? `Mieter: ${s.mieterName}` : ''
    };
    
    // Zur Historie hinzufügen und aktuelle Daten leeren
    const neueHistorie = [...(p.miethistorie || []), neuerHistorieEintrag];
    upd({
      ...p,
      miethistorie: neueHistorie,
      stammdaten: {
        ...s,
        mieterName: '',
        mietbeginn: '',
        mietende: '',
        kaltmiete: 0,
        nebenkostenVorauszahlung: 0,
        mieteStellplatz: 0,
        mieteSonderausstattung: 0,
        mietstatusAktiv: false
      }
    });
    setArchiveConfirm(false);
    setMhistOpen(true); // Historie öffnen um den neuen Eintrag zu zeigen
  };
  
  const set = (f, v) => {
    const n = { ...s, [f]: v };
    if (['bundesland', 'kaufpreisImmobilie', 'kaufpreisStellplatz'].includes(f)) {
      const bl = f === 'bundesland' ? v : s.bundesland;
      const kp = (f === 'kaufpreisImmobilie' ? v : s.kaufpreisImmobilie) + (f === 'kaufpreisStellplatz' ? v : s.kaufpreisStellplatz);
      n.grunderwerbsteuer = kp * ((BUNDESLAENDER[bl]?.grest || 6) / 100);
    }
    upd({ ...p, stammdaten: n });
  };
  const addSA = () => set('sonderausstattung', [...s.sonderausstattung, { bezeichnung: '', betrag: 0 }]);
  const updSA = (i, f, v) => { const a = [...s.sonderausstattung]; a[i] = { ...a[i], [f]: f === 'betrag' ? parseFloat(v) || 0 : v }; set('sonderausstattung', a); };
  const delSA = i => set('sonderausstattung', s.sonderausstattung.filter((_, x) => x !== i));
  const canSave = s.name?.trim().length > 0;
  const hasErrors = Object.keys(validationErrors).length > 0;

  return (
    <div className="mod">
      {!saved && (
        <div className="draft-bar">
          <div><span className="draft-icon"><IconSave color="#f59e0b" /></span><strong>Entwurf</strong> – Noch nicht gespeichert</div>
          <div className="draft-bar-actions">
            <button onClick={onSave} disabled={!canSave || hasErrors}>Speichern</button>
            <button className="draft-close" onClick={onDiscard} title="Entwurf verwerfen">×</button>
          </div>
        </div>
      )}
      {hasErrors && (
        <div className="validation-banner">
          <span className="validation-banner-icon"><IconWarning color="#ef4444" /></span>
          <span>Bitte korrigiere die markierten Felder</span>
        </div>
      )}
      {istImportiert && (
        <div className="review-banner">
          <div className="review-banner-icon"><IconReview color="#f59e0b" /></div>
          <div className="review-banner-text">
            <strong>Importierte Daten – Bitte prüfen</strong>
            <span>{zuPruefen.length} Felder wurden aus dem Dokument übernommen und sollten überprüft werden.</span>
          </div>
          <div className="review-banner-actions">
            <button className="btn-review-done" onClick={markAsReviewed}><span className="btn-icon-xs"><IconCheck color="#fff" /></span>Geprüft</button>
            <button className="btn-review-delete" onClick={onDelete}><span className="btn-icon-xs"><IconTrash color="#fff" /></span>Löschen</button>
          </div>
        </div>
      )}
      <div className="kpi-bar">
        <div className="kpi"><span>Kaufpreis</span><b>{fmt(c.kp)}</b></div>
        <div className="kpi"><span>+ Nebenkosten</span><b>{fmt(c.nk)}</b></div>
        <div className="kpi"><span>= Anschaffung</span><b className="acc">{fmt(c.ak)}</b></div>
        <div className="kpi"><span>Jahres-Kaltmiete</span><b className="pos">{fmt(c.jm)}</b></div>
        <div className="kpi"><span>Rendite</span><b className="acc">{fmtP(c.rendite)}</b></div>
        <div className="kpi"><span>AfA p.a.</span><b>{fmt(c.afaGes)}</b></div>
      </div>
      <div className="accs">
        <Acc icon={<IconObjekt color="#6366f1" />} title="Objekt" sum={s.name || 'Name eingeben...'} open={sec === 'obj'} toggle={() => setSec(sec === 'obj' ? null : 'obj')} color="#6366f1" onImport={onOpenImport}>
          <div className="field-with-btn">
            <Input label="Name *" value={s.name} onChange={v => set('name', v)} type="text" ph="z.B. ETW Marburg" error={validationErrors.name} />
            <button 
              className="auto-gen-btn" 
              onClick={() => {
                const typ = TYP_LABELS[s.typ] || s.typ?.toUpperCase() || '';
                const parts = [s.projekt, typ, s.wohnungsNr].filter(Boolean);
                if (parts.length > 0) set('name', parts.join(' '));
              }}
              title="Name automatisch generieren aus Projekt, Typ und Wohnungs-Nr."
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1"/>
              </svg>
              Auto
            </button>
          </div>
          <Input label="Eigentümer" value={s.eigentuemer} onChange={v => set('eigentuemer', v)} type="text" ph="z.B. Max Mustermann" />
          <Input label="Adresse" value={s.adresse} onChange={v => set('adresse', v)} type="text" ph="Straße, PLZ Ort" />
          <Input label="Projekt" value={s.projekt} onChange={v => set('projekt', v)} type="text" ph="z.B. Neubauprojekt Marburg" />
          <Select label="Typ" value={s.typ} onChange={v => set('typ', v)} options={[{ v: 'etw', l: 'ETW' }, { v: 'mfh', l: 'MFH' }, { v: 'efh', l: 'EFH' }, { v: 'gewerbe', l: 'Gewerbe' }, { v: 'grundstueck', l: 'Grundstück' }]} />
          <Select label="Neubau/Bestand" value={s.objektstatus} onChange={v => set('objektstatus', v)} options={[{ v: 'neubau', l: 'Neubau' }, { v: 'bestand', l: 'Bestand' }]} />
          <Select label="Nutzung" value={s.nutzung} onChange={v => set('nutzung', v)} options={[{ v: 'vermietet', l: 'Vermietet' }, { v: 'eigengenutzt', l: 'Eigengenutzt' }]} />
          <Select label="Bundesland" value={s.bundesland} onChange={v => set('bundesland', v)} options={Object.entries(BUNDESLAENDER).map(([k, v]) => ({ v: k, l: `${v.name} (${v.grest}%)` }))} />
          <Input label="Kaufdatum" value={s.kaufdatum} onChange={v => set('kaufdatum', v)} type="date" />
          <Input label="Baujahr" value={s.baujahr} onChange={v => set('baujahr', v)} type="year" />
          <div className="field-row-2">
            <Input label="Wohnungs-Nr." value={s.wohnungsNr} onChange={v => set('wohnungsNr', v)} type="text" ph="z.B. 12" />
            <Input label="Etage" value={s.etage} onChange={v => set('etage', v)} type="text" ph="z.B. 3. OG" />
          </div>
          <hr />
          <button 
            className="btn-reset-section" 
            onClick={() => setResetConfirm('objekt')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        <Acc icon={<IconKaufpreis color="#10b981" />} title="Kaufpreis und Verkehrswert" sum={`${fmt(c.kp)} + ${fmt(c.nk)} NK`} open={sec === 'kp'} toggle={() => setSec(sec === 'kp' ? null : 'kp')} color="#10b981">
          <Input label="Kaufpreis Immobilie" value={s.kaufpreisImmobilie} onChange={v => set('kaufpreisImmobilie', v)} suffix="€" step={1000} error={validationErrors.kaufpreisImmobilie} />
          <Input label="Kaufpreis Stellplatz" value={s.kaufpreisStellplatz} onChange={v => set('kaufpreisStellplatz', v)} suffix="€" error={validationErrors.kaufpreisStellplatz} />
          <div className="res"><span>= Kaufpreis</span><span>{fmt(c.kp)}</span></div>
          <hr />
          <Input label="Makler" value={s.maklerProvision} onChange={v => set('maklerProvision', v)} suffix="€" />
          <Input label="Mehrkosten" value={s.mehrkosten} onChange={v => set('mehrkosten', v)} suffix="€" />
          <Input label="Grunderwerbsteuer" value={s.grunderwerbsteuer} onChange={v => set('grunderwerbsteuer', v)} suffix="€" />
          <Input label="Notar" value={s.notarkosten} onChange={v => set('notarkosten', v)} suffix="€" />
          <div className="res hl"><span>= Anschaffungskosten</span><span>{fmt(c.ak)}</span></div>
          <hr />
          <div className="field-group-label">Aktueller Verkehrswert</div>
          <Input label="Verkehrswert" value={s.verkehrswert} onChange={v => set('verkehrswert', v)} suffix="€" error={validationErrors.verkehrswert} />
          <Input label="Bewertungsdatum" value={s.verkehrswertDatum} onChange={v => set('verkehrswertDatum', v)} type="date" />
          <hr />
          <button className="btn-reset-section" onClick={() => setResetConfirm('kaufpreis')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        <Acc icon={<IconAfa color="#f59e0b" />} title="Grundstück & AfA" sum={`AfA: ${fmt(c.afaGeb + (s.degressiveAfa || 0))}/Jahr`} open={sec === 'afa'} toggle={() => setSec(sec === 'afa' ? null : 'afa')} color="#f59e0b">
          <Input label="Grundstücksgröße" value={s.grundstueckGroesse} onChange={v => set('grundstueckGroesse', v)} suffix="qm" />
          <Input label="Bodenrichtwert" value={s.bodenrichtwert} onChange={v => set('bodenrichtwert', v)} suffix="€/qm" />
          {s.typ === 'etw' && <Input label="TEA (WEG)" value={s.teileigentumsanteil} onChange={v => set('teileigentumsanteil', v)} suffix="/10.000" />}
          <div className="res"><span>Grundstückswert</span><span>{fmt(c.gwg)}</span></div>
          <div className="res"><span>./. Anteil</span><span>{fmt(c.ga)}</span></div>
          <hr />
          <Input label="AfA-Satz (linear)" value={s.afaSatz} onChange={v => set('afaSatz', v)} suffix="%" step={0.5} />
          <div className="res hl"><span>AfA-Basis</span><span>{fmt(c.afaBasis)}</span></div>
          <div className="res hl"><span>Lineare AfA p.a.</span><span>{fmt(c.afaGeb)}</span></div>
          <hr />
          <div className="field-group-label">Degressive AfA (§7 Abs. 5a EStG)</div>
          <p className="hint-small">Für Neubauten ab 2023: 5% p.a. vom Restwert, max. 5 Jahre, dann Wechsel zur linearen AfA</p>
          <Input label="Degressive AfA" value={s.degressiveAfa} onChange={v => set('degressiveAfa', v)} suffix="€/Jahr" />
          {(s.degressiveAfa > 0) && (
            <div className="res hl"><span>Gesamt-AfA p.a.</span><span>{fmt(c.afaGeb + (s.degressiveAfa || 0))}</span></div>
          )}
          <hr />
          <button className="btn-reset-section" onClick={() => setResetConfirm('afa')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        <Acc 
          icon={<IconMiete color={s.nutzung === 'eigengenutzt' ? 'var(--text-dim)' : '#ec4899'} />} 
          title="Miete" 
          sum={s.nutzung === 'eigengenutzt' ? 'Eigengenutzt' : `${fmt(c.mm)}/Monat`} 
          open={sec === 'miete' && s.nutzung !== 'eigengenutzt'} 
          toggle={() => s.nutzung !== 'eigengenutzt' && setSec(sec === 'miete' ? null : 'miete')} 
          color={s.nutzung === 'eigengenutzt' ? 'var(--text-dim)' : '#ec4899'}
          disabled={s.nutzung === 'eigengenutzt'}
          onImport={onOpenImport}
        >
          <div className="field-group-label">Aktueller Mieter</div>
          <Input label="Name Mieter" value={s.mieterName} onChange={v => set('mieterName', v)} type="text" ph="z.B. Familie Müller" />
          
          <div className="mietstatus-checkboxes">
            <label className="mietstatus-option">
              <input 
                type="radio" 
                name="mietstatus" 
                checked={s.mietstatusAktiv !== false} 
                onChange={() => set('mietstatusAktiv', true)}
              />
              <span className="mietstatus-label">Vermietet</span>
            </label>
            <label className="mietstatus-option">
              <input 
                type="radio" 
                name="mietstatus" 
                checked={s.mietstatusAktiv === false} 
                onChange={() => set('mietstatusAktiv', false)}
              />
              <span className="mietstatus-label">Leerstand</span>
            </label>
            <button 
              className="btn-archive-mieter"
              onClick={() => setArchiveConfirm(true)}
              disabled={!s.mieterName && !s.kaltmiete}
              title="Aktuellen Mieter in Historie übernehmen"
            >
              <IconHistory color="#ec4899" /> In Historie übernehmen
            </button>
          </div>
          
          {/* Bestätigungsdialog für Archivierung */}
          {archiveConfirm && (
            <div className="archive-confirm">
              <div className="archive-confirm-content">
                <p><strong>Mieter in Historie übernehmen?</strong></p>
                <p>Die aktuellen Mietdaten werden in die Miethistorie verschoben und die Felder geleert.</p>
                
                {/* Warnung bei Zeitraum-Überschneidung */}
                {overlap && (
                  <div className="archive-overlap-warning">
                    <span className="warning-icon">⚠️</span>
                    <div>
                      <strong>Zeitraum-Überschneidung erkannt!</strong>
                      <p>Der Zeitraum überschneidet sich mit einem bestehenden Eintrag:</p>
                      <p className="overlap-details">
                        {formatDateDE(overlap.von)} – {overlap.bis ? formatDateDE(overlap.bis) : 'heute'}
                        {overlap.grund && ` (${overlap.grund})`}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="archive-preview-list">
                  {s.mieterName && <span className="archive-preview">Mieter: {s.mieterName}</span>}
                  {s.mietbeginn && <span className="archive-preview">Von: {formatDateDE(s.mietbeginn)}</span>}
                  {s.mietende && <span className="archive-preview">Bis: {formatDateDE(s.mietende)}</span>}
                  {!s.mietende && <span className="archive-preview">Bis: {new Date().toLocaleDateString('de-DE')} (heute)</span>}
                  {(s.kaltmiete > 0 || s.nebenkostenVorauszahlung > 0 || s.mieteStellplatz > 0 || s.mieteSonderausstattung > 0) && 
                    <span className="archive-preview">Gesamtmiete: {fmt((s.kaltmiete || 0) + (s.nebenkostenVorauszahlung || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0))}/Mon.</span>
                  }
                </div>
                <div className="archive-confirm-buttons">
                  <button className={`btn-confirm ${overlap ? 'btn-warning' : ''}`} onClick={archiveMieter}>
                    {overlap ? 'Trotzdem übernehmen' : 'Ja, übernehmen'}
                  </button>
                  <button className="btn-cancel" onClick={() => setArchiveConfirm(false)}>Abbrechen</button>
                </div>
              </div>
            </div>
          )}
          
          <hr />
          <div className="field-group-label">Mietkonditionen</div>
          <div className="miet-datum-row">
            <div className="miet-datum-field">
              <label>Von</label>
              <DateInput value={s.mietbeginn} onChange={v => set('mietbeginn', v)} />
            </div>
            <div className="miet-datum-field">
              <label>Bis</label>
              <DateInput value={s.mietende} onChange={v => set('mietende', v)} />
            </div>
          </div>
          <Input label="Kaltmiete" value={s.kaltmiete} onChange={v => set('kaltmiete', v)} suffix="€/Mon." />
          <Input label="NK-Vorauszahlung" value={s.nebenkostenVorauszahlung} onChange={v => set('nebenkostenVorauszahlung', v)} suffix="€/Mon." />
          <Input label="Stellplatz" value={s.mieteStellplatz} onChange={v => set('mieteStellplatz', v)} suffix="€/Mon." />
          <Input label="Miete Sonderausst." value={s.mieteSonderausstattung} onChange={v => set('mieteSonderausstattung', v)} suffix="€/Mon." />
          <div className="res hl gesamtmiete-row">
            <span>Gesamtmiete</span>
            <span className="pos">{fmt((s.kaltmiete || 0) + (s.nebenkostenVorauszahlung || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0))}/Mon.</span>
          </div>
          <div className="res"><span>Jahres-Kaltmiete</span><span className="pos">{fmt(((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12)}</span></div>
          
          <hr />
          <div className="field-group-label">Kaution</div>
          <Input label="Kautionsbetrag" value={s.kaution} onChange={v => set('kaution', v)} suffix="€" />
          <div className="mietstatus-checkboxes">
            <label className="mietstatus-option">
              <input 
                type="checkbox" 
                checked={s.kautionErhalten || false} 
                onChange={e => set('kautionErhalten', e.target.checked)} 
              />
              <span className="mietstatus-label">Erhalten</span>
            </label>
            <label className="mietstatus-option">
              <input 
                type="checkbox" 
                checked={s.kautionZurueckgezahlt || false} 
                onChange={e => set('kautionZurueckgezahlt', e.target.checked)} 
              />
              <span className="mietstatus-label">Zurückgezahlt</span>
            </label>
          </div>
          
          {/* Miethistorie - ausklappbar */}
          <div className="mhist-toggle" onClick={() => setMhistOpen(!mhistOpen)}>
            <span className="mhist-toggle-icon">{mhistOpen ? '−' : '+'}</span>
            <span>Miethistorie</span>
            <span className="mhist-toggle-count">{(p.miethistorie || []).length > 0 ? `${(p.miethistorie || []).length} Eintrag${(p.miethistorie || []).length !== 1 ? 'e' : ''}` : 'Keine Einträge'}</span>
            {mhistOpen && (
              <button 
                className="mhist-import-btn" 
                onClick={(e) => { e.stopPropagation(); setMhistImportModal(true); }}
                title="Aus altem Mietvertrag importieren"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Importieren</span>
              </button>
            )}
          </div>
          {mhistOpen && (
            <div className="mhist-content">
              <p className="hint">Mietverträge mit Zeitraum, Kaltmiete und Nebenkosten dokumentieren</p>
              <div className="mhist-list">
                {(p.miethistorie || []).map((m, i) => {
                  const warmmiete = (m.kaltmiete || 0) + (m.nebenkosten || 0) + (m.stellplatz || 0) + (m.sonstiges || 0);
                  return (
                    <div key={i} className="mhist-row">
                      <div className="mhist-dates">
                        <div className="mhist-date-field">
                          <label>Von</label>
                          <DateInput 
                            value={m.von || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], von: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                          />
                        </div>
                        <div className="mhist-date-field">
                          <label>Bis</label>
                          <DateInput 
                            value={m.bis || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], bis: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                          />
                        </div>
                      </div>
                      <div className="mhist-values">
                        <div className="mhist-field">
                          <label>Kaltmiete</label>
                          <NumInput 
                            value={m.kaltmiete || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], kaltmiete: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                            placeholder="0"
                          />
                          <span>€</span>
                        </div>
                        <div className="mhist-field">
                          <label>NK</label>
                          <NumInput 
                            value={m.nebenkosten || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], nebenkosten: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                            placeholder="0"
                          />
                          <span>€</span>
                        </div>
                        <div className="mhist-field">
                          <label>Stellplatz</label>
                          <NumInput 
                            value={m.stellplatz || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], stellplatz: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                            placeholder="0"
                          />
                          <span>€</span>
                        </div>
                        <div className="mhist-field">
                          <label>Sonstiges</label>
                          <NumInput 
                            value={m.sonstiges || ''} 
                            onChange={v => {
                              const newM = [...(p.miethistorie || [])];
                              newM[i] = { ...newM[i], sonstiges: v };
                              upd({ ...p, miethistorie: newM });
                            }}
                            placeholder="0"
                          />
                          <span>€</span>
                        </div>
                        <div className="mhist-field mhist-gesamt">
                          <label>Gesamtmiete</label>
                          <span className="mhist-gesamt-value">{fmt(warmmiete)}</span>
                        </div>
                      </div>
                      <input 
                        type="text" 
                        value={m.grund || ''} 
                        onChange={e => {
                          const newM = [...(p.miethistorie || [])];
                          newM[i] = { ...newM[i], grund: e.target.value };
                          upd({ ...p, miethistorie: newM });
                        }}
                        placeholder="Grund / Anmerkung"
                        className="mhist-grund"
                      />
                      <button className="mhist-del" onClick={() => {
                        const newM = (p.miethistorie || []).filter((_, x) => x !== i);
                        upd({ ...p, miethistorie: newM });
                      }}>×</button>
                    </div>
                  );
                })}
              </div>
              <button className="btn-add" onClick={() => upd({ ...p, miethistorie: [...(p.miethistorie || []), { von: '', bis: '', kaltmiete: 0, nebenkosten: 0, stellplatz: 0, sonstiges: 0, grund: '' }] })}>+ Mietperiode hinzufügen</button>
            </div>
          )}
          <hr />
          <button className="btn-reset-section" onClick={() => setResetConfirm('miete')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        <Acc icon={<IconFinanz color="#3b82f6" />} title="Finanzierung" sum={(() => {
          const darlehen = p.darlehen || [];
          const foerderungen = (s.kfwZuschuss || 0) + (s.bafaFoerderung || 0) + (s.landesFoerderung || 0) + (s.wohnRiester || 0);
          if (darlehen.length === 0 && foerderungen === 0) return `${s.eigenkapitalAnteil}% EK`;
          const summeFK = darlehen.reduce((a, d) => a + (d.betrag || 0), 0);
          let parts = [];
          if (summeFK > 0) parts.push(`${fmt(summeFK)} FK`);
          if (foerderungen > 0) parts.push(`${fmt(foerderungen)} Förderung`);
          return parts.join(', ') || `${s.eigenkapitalAnteil}% EK`;
        })()} open={sec === 'fin'} toggle={() => setSec(sec === 'fin' ? null : 'fin')} color="#3b82f6" onImport={() => setDarlehenImportModal(true)}>
          
          {/* Eigenkapital-Details */}
          <div className="field-group-label">Eigenkapital</div>
          <Input label="EK-Anteil" value={s.eigenkapitalAnteil} onChange={v => set('eigenkapitalAnteil', v)} suffix="%" step={5} />
          <Input label="EK-Betrag" value={s.eigenkapitalBetrag} onChange={v => set('eigenkapitalBetrag', v)} suffix="€" step={1000} />
          <Select label="EK-Herkunft" value={s.eigenkapitalHerkunft || 'ersparnis'} onChange={v => set('eigenkapitalHerkunft', v)} options={[
            { v: 'ersparnis', l: 'Ersparnis' },
            { v: 'schenkung', l: 'Schenkung' },
            { v: 'erbschaft', l: 'Erbschaft' },
            { v: 'bausparvertrag', l: 'Bausparvertrag' },
            { v: 'immobilienverkauf', l: 'Immobilienverkauf' },
            { v: 'wertpapiere', l: 'Wertpapiere/Depot' },
            { v: 'gemischt', l: 'Gemischt' },
            { v: 'sonstiges', l: 'Sonstiges' }
          ]} />
          <Input label="Eigenleistung" value={s.eigenleistung} onChange={v => set('eigenleistung', v)} suffix="€" step={500} />
          <p className="hint-small">Eigenleistung = selbst durchgeführte Renovierungen/Arbeiten</p>
          
          <hr />
          
          {/* Förderungen & Zuschüsse */}
          <div className="field-group-label">Förderungen & Zuschüsse</div>
          <div className="foerderung-row">
            <Input label="KfW-Zuschuss" value={s.kfwZuschuss} onChange={v => set('kfwZuschuss', v)} suffix="€" />
            <Input label="KfW-Programm" value={s.kfwProgramm} onChange={v => set('kfwProgramm', v)} type="text" ph="z.B. 124, 261" />
          </div>
          <Input label="BAFA-Förderung" value={s.bafaFoerderung} onChange={v => set('bafaFoerderung', v)} suffix="€" />
          <Input label="Landesförderung" value={s.landesFoerderung} onChange={v => set('landesFoerderung', v)} suffix="€" />
          <Input label="Landesförderung" value={s.landesFoerderung} onChange={v => set('landesFoerderung', v)} suffix="€" />
          {((s.kfwZuschuss || 0) + (s.bafaFoerderung || 0) + (s.landesFoerderung || 0)) > 0 && (
            <div className="res"><span>Förderungen gesamt</span><span className="pos">{fmt((s.kfwZuschuss || 0) + (s.bafaFoerderung || 0) + (s.landesFoerderung || 0))}</span></div>
          )}
          
          <hr />
          
          {/* Steuersatz */}
          <div className="field-group-label">Steuer</div>
          <Input label="Steuersatz" value={s.steuersatz} onChange={v => set('steuersatz', v)} suffix="%" />
          
          <hr />
          
          {/* Darlehen */}
          <div className="field-group-label">Darlehen</div>
          <p className="hint">Bankdarlehen, KfW-Darlehen, Privatdarlehen, etc.</p>
          {(p.darlehen || []).length === 0 && (
            <div className="legacy-hint">
              <small>Alte Felder: {s.zinssatz}% Zins, {s.tilgung}% Tilgung</small>
            </div>
          )}
          {(p.darlehen || []).map((d, i) => (
            <div key={i} className="darlehen-card">
              <div className="darlehen-header">
                <input 
                  value={d.name || ''} 
                  onChange={e => {
                    const newD = [...(p.darlehen || [])];
                    newD[i] = { ...newD[i], name: e.target.value };
                    upd({ ...p, darlehen: newD });
                  }}
                  placeholder="Bezeichnung (z.B. Hauptdarlehen, KfW 124)"
                  className="darlehen-name"
                />
                <button className="darlehen-del" onClick={() => {
                  const newD = (p.darlehen || []).filter((_, x) => x !== i);
                  upd({ ...p, darlehen: newD });
                }}>×</button>
              </div>
              
              {/* Institut & Konto */}
              <div className="darlehen-section">
                <div className="darlehen-section-label">Institut & Konto</div>
                <div className="darlehen-fields">
                  <div className="darlehen-field wide">
                    <label>Institut/Bank</label>
                    <input type="text" value={d.institut || ''} placeholder="z.B. Sparkasse Marburg" onChange={e => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], institut: e.target.value };
                      upd({ ...p, darlehen: newD });
                    }} />
                  </div>
                  <div className="darlehen-field">
                    <label>Kontonummer</label>
                    <input type="text" value={d.kontonummer || ''} placeholder="Darlehenskonto-Nr." onChange={e => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], kontonummer: e.target.value };
                      upd({ ...p, darlehen: newD });
                    }} />
                  </div>
                  <div className="darlehen-field">
                    <label>Darlehensart</label>
                    <select value={d.typ || 'annuitaeten'} onChange={e => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], typ: e.target.value };
                      upd({ ...p, darlehen: newD });
                    }}>
                      <option value="annuitaeten">Annuitätendarlehen</option>
                      <option value="tilgung">Tilgungsdarlehen</option>
                      <option value="endfaellig">Endfälliges Darlehen</option>
                      <option value="kfw">KfW-Darlehen</option>
                      <option value="bauspar">Bauspardarlehen</option>
                      <option value="privat">Privatdarlehen</option>
                      <option value="forward">Forward-Darlehen</option>
                      <option value="sonstig">Sonstiges</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Konditionen */}
              <div className="darlehen-section">
                <div className="darlehen-section-label">Konditionen</div>
                <div className="darlehen-fields">
                  <div className="darlehen-field">
                    <label>Darlehensbetrag</label>
                    <div className="ifld"><NumInput value={d.betrag || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], betrag: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>€</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Sollzinssatz</label>
                    <div className="ifld"><NumInput value={d.zinssatz || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], zinssatz: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>%</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Effektivzins</label>
                    <div className="ifld"><NumInput value={d.effektivzins || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], effektivzins: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>%</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Anf. Tilgung</label>
                    <div className="ifld"><NumInput value={d.tilgung || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], tilgung: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>%</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Monatsrate</label>
                    <div className="ifld"><NumInput value={d.monatsrate || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], monatsrate: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>€</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Sondertilgung</label>
                    <div className="ifld"><NumInput value={d.sondertilgung || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], sondertilgung: v };
                      upd({ ...p, darlehen: newD });
                    }} placeholder="p.a." /><span>%</span></div>
                  </div>
                </div>
              </div>
              
              {/* Laufzeit & Termine */}
              <div className="darlehen-section">
                <div className="darlehen-section-label">Laufzeit & Termine</div>
                <div className="darlehen-fields">
                  <div className="darlehen-field">
                    <label>Abschlussdatum</label>
                    <DateInput value={d.abschluss || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], abschluss: v };
                      upd({ ...p, darlehen: newD });
                    }} />
                  </div>
                  <div className="darlehen-field">
                    <label>Erste Rate</label>
                    <DateInput value={d.ersteRate || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], ersteRate: v };
                      upd({ ...p, darlehen: newD });
                    }} />
                  </div>
                  <div className="darlehen-field">
                    <label>Laufzeit</label>
                    <div className="ifld"><input type="text" inputMode="numeric" value={d.laufzeit || ''} onChange={e => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], laufzeit: parseInt(e.target.value) || 0 };
                      upd({ ...p, darlehen: newD });
                    }} /><span>Jahre</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Zinsbindung</label>
                    <div className="ifld"><input type="text" inputMode="numeric" value={d.zinsbindungJahre || ''} onChange={e => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], zinsbindungJahre: parseInt(e.target.value) || 0 };
                      upd({ ...p, darlehen: newD });
                    }} /><span>Jahre</span></div>
                  </div>
                  <div className="darlehen-field">
                    <label>Zinsbindung bis</label>
                    <DateInput value={d.zinsbindungEnde || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], zinsbindungEnde: v };
                      upd({ ...p, darlehen: newD });
                    }} />
                  </div>
                  <div className="darlehen-field">
                    <label>Restschuld (akt.)</label>
                    <div className="ifld"><NumInput value={d.restschuld || ''} onChange={v => {
                      const newD = [...(p.darlehen || [])];
                      newD[i] = { ...newD[i], restschuld: v };
                      upd({ ...p, darlehen: newD });
                    }} /><span>€</span></div>
                  </div>
                </div>
              </div>
              
              {/* Berechnungen */}
              {d.betrag > 0 && (d.zinssatz > 0 || d.monatsrate > 0) && (
                <div className="darlehen-calc">
                  {d.monatsrate > 0 ? (
                    <>
                      <span>Rate: {fmt(d.monatsrate)}/Monat</span>
                      <span>Jahresbelastung: {fmt(d.monatsrate * 12)}</span>
                    </>
                  ) : (
                    <>
                      <span>Annuität: {fmt(d.betrag * ((d.zinssatz + (d.tilgung || 0)) / 100))}/Jahr</span>
                      <span>≈ {fmt(d.betrag * ((d.zinssatz + (d.tilgung || 0)) / 100) / 12)}/Monat</span>
                    </>
                  )}
                  <span>Zinsen Jahr 1: {fmt(d.betrag * (d.zinssatz / 100))}</span>
                  <button className="btn-tilgungsplan" onClick={() => setTilgungsplanDarlehen(d)} title="Tilgungsplan anzeigen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="3" y="10" width="4" height="11" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="2" width="4" height="19" rx="1"/></svg>
                    Tilgungsplan
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="darlehen-buttons">
            <button className="btn-add" onClick={() => upd({ ...p, darlehen: [...(p.darlehen || []), { 
              name: '', institut: '', kontonummer: '', typ: 'annuitaeten',
              betrag: 0, zinssatz: 0, effektivzins: 0, tilgung: 2, monatsrate: 0, sondertilgung: 5,
              abschluss: '', ersteRate: '', laufzeit: 0, zinsbindungJahre: 10, zinsbindungEnde: '', restschuld: 0
            }] })}>+ Darlehen hinzufügen</button>
          </div>
          {(p.darlehen || []).length > 0 && (() => {
            const sumBetrag = (p.darlehen || []).reduce((a, d) => a + (d.betrag || 0), 0);
            const sumMonat = (p.darlehen || []).reduce((a, d) => {
              if (d.monatsrate > 0) return a + d.monatsrate;
              return a + (d.betrag || 0) * (((d.zinssatz || 0) + (d.tilgung || 0)) / 100) / 12;
            }, 0);
            return <div className="res hl"><span>Gesamt FK / Monatsrate</span><span>{fmt(sumBetrag)} / {fmt(sumMonat)}</span></div>;
          })()}
          <hr />
          <button className="btn-reset-section" onClick={() => setResetConfirm('finanzierung')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        <Acc icon={<IconSonder color="#8b5cf6" />} title="Sonderausstattung" sum={s.sonderausstattung.length > 0 ? `${s.sonderausstattung.length}x, ${fmt(c.saSumme)}` : 'Keine'} open={sec === 'sa'} toggle={() => setSec(sec === 'sa' ? null : 'sa')} color="#8b5cf6">
          <p className="hint">z.B. Küche – 10% AfA über 10 Jahre</p>
          {s.sonderausstattung.map((x, i) => (
            <div key={i} className="sa-row">
              <input value={x.bezeichnung} onChange={e => updSA(i, 'bezeichnung', e.target.value)} placeholder="Bezeichnung" />
              <NumInput value={x.betrag} onChange={v => updSA(i, 'betrag', v)} placeholder="€" />
              <button onClick={() => delSA(i)}>×</button>
            </div>
          ))}
          <button className="btn-add" onClick={addSA}>+ Hinzufügen</button>
          {c.saSumme > 0 && <div className="res hl"><span>AfA SA p.a.</span><span>{fmt(c.afaSA)}</span></div>}
          <hr />
          <button className="btn-reset-section" onClick={() => setResetConfirm('sonderausstattung')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Felder zurücksetzen
          </button>
        </Acc>
        {beteiligte.length > 0 && (
          <Acc icon={<IconPerson color="#8b5cf6" />} title="Beteiligte" sum={(() => {
            const bet = p.beteiligungen || [];
            const aktiveBet = bet.filter(b => b.anteil > 0);
            if (aktiveBet.length === 0) return 'Keine';
            const summe = aktiveBet.reduce((a, b) => a + b.anteil, 0);
            return `${aktiveBet.length} Person${aktiveBet.length !== 1 ? 'en' : ''}, ${summe}%`;
          })()} open={sec === 'bet'} toggle={() => setSec(sec === 'bet' ? null : 'bet')} color="#8b5cf6">
            <p className="hint">Wer ist an dieser Immobilie beteiligt und zu welchem Anteil?</p>
            <div className="bet-checkboxes">
              {beteiligte.map(b => {
                const beteiligung = (p.beteiligungen || []).find(x => x.beteiligterID === b.id);
                const isActive = beteiligung && beteiligung.anteil > 0;
                const setAnteil = (val) => {
                  const newBet = (p.beteiligungen || []).map(x => 
                    x.beteiligterID === b.id ? { ...x, anteil: val } : x
                  );
                  upd({ ...p, beteiligungen: newBet });
                };
                return (
                  <div key={b.id} className={`bet-checkbox-row ${isActive ? 'active' : ''}`}>
                    <label className="bet-checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={isActive}
                        onChange={(e) => {
                          const newBet = (p.beteiligungen || []).filter(x => x.beteiligterID !== b.id);
                          if (e.target.checked) {
                            newBet.push({ beteiligterID: b.id, anteil: 100 });
                          }
                          upd({ ...p, beteiligungen: newBet });
                        }}
                      />
                      <span className="bet-checkbox-icon" style={{ borderColor: b.farbe }}><IconPerson color={b.farbe} /></span>
                      <span className="bet-checkbox-name">{b.name}</span>
                    </label>
                    {isActive && (
                      <div className="bet-anteil-wrap">
                        <div className="bet-anteil-presets">
                          {[100, 50, 25].map(preset => (
                            <button 
                              key={preset}
                              type="button"
                              className={`bet-preset-btn ${beteiligung.anteil === preset ? 'active' : ''}`}
                              onClick={() => setAnteil(preset)}
                            >
                              {preset}%
                            </button>
                          ))}
                        </div>
                        <div className="bet-anteil-custom">
                          <input 
                            type="text" 
                            value={beteiligung.anteil}
                            onChange={(e) => {
                              const val = e.target.value.replace(',', '.');
                              const num = parseFloat(val);
                              if (!isNaN(num) && num >= 0 && num <= 100) {
                                setAnteil(num);
                              } else if (val === '' || val === '0') {
                                setAnteil(0);
                              }
                            }}
                            placeholder="Individuell"
                          />
                          <span className="bet-anteil-suffix">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(() => {
              const summe = (p.beteiligungen || []).reduce((a, b) => a + (b.anteil || 0), 0);
              if (summe > 0 && summe !== 100) {
                return <div className={`bet-summe ${summe === 100 ? 'ok' : 'warn'}`}>Summe: {summe}% {summe !== 100 && '(sollte 100% sein)'}</div>;
              }
              return null;
            })()}
          </Acc>
        )}
      </div>
      
      {/* Sekundäre Accordions - Verwaltung & Dokumente */}
      <div className="accs-secondary">
        <div 
          className={`accs-secondary-header ${secExpanded ? 'expanded' : ''}`}
          onClick={() => setSecExpanded(!secExpanded)}
        >
          <span className="accs-secondary-icon"><IconDocuments color="var(--text-muted)" /></span>
          <span className="accs-secondary-title">Verwaltung & Dokumente</span>
          <span className="accs-secondary-toggle">{secExpanded ? '−' : '+'}</span>
        </div>
        {secExpanded && (
          <div className="accs-secondary-content">
        <Acc icon={<IconBell color="#ef4444" />} title="Erinnerungen" sum={(() => {
          const erinnerungen = p.erinnerungen || [];
          const offen = erinnerungen.filter(e => !e.erledigt);
          if (erinnerungen.length === 0) return 'Keine';
          if (offen.length === 0) return `${erinnerungen.length} (alle erledigt)`;
          return `${offen.length} offen`;
        })()} open={sec === 'erinnerungen'} toggle={() => setSec(sec === 'erinnerungen' ? null : 'erinnerungen')} color="#ef4444">
          <p className="hint">Termine und Fristen im Blick behalten (z.B. Zinsbindung, Nebenkostenabrechnung)</p>
          <div className="erinnerungen-list">
            {(p.erinnerungen || []).map((e, i) => {
              const isOverdue = e.datum && new Date(e.datum) < new Date() && !e.erledigt;
              const isUpcoming = e.datum && new Date(e.datum) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && new Date(e.datum) >= new Date() && !e.erledigt;
              return (
                <div key={i} className={`erinnerung-row ${e.erledigt ? 'done' : ''} ${isOverdue ? 'overdue' : ''} ${isUpcoming ? 'upcoming' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={e.erledigt || false}
                    onChange={ev => {
                      const newE = [...(p.erinnerungen || [])];
                      newE[i] = { ...newE[i], erledigt: ev.target.checked };
                      upd({ ...p, erinnerungen: newE });
                    }}
                    className="erinnerung-check"
                  />
                  <div className="erinnerung-datum">
                    <DateInput 
                      value={e.datum || ''} 
                      onChange={v => {
                        const newE = [...(p.erinnerungen || [])];
                        newE[i] = { ...newE[i], datum: v };
                        upd({ ...p, erinnerungen: newE });
                      }}
                    />
                  </div>
                  <input 
                    type="text" 
                    value={e.titel || ''} 
                    onChange={ev => {
                      const newE = [...(p.erinnerungen || [])];
                      newE[i] = { ...newE[i], titel: ev.target.value };
                      upd({ ...p, erinnerungen: newE });
                    }}
                    placeholder="Titel (z.B. Zinsbindung prüfen)"
                    className="erinnerung-titel"
                  />
                  <button className="erinnerung-del" onClick={() => {
                    const newE = (p.erinnerungen || []).filter((_, x) => x !== i);
                    upd({ ...p, erinnerungen: newE });
                  }}>×</button>
                </div>
              );
            })}
          </div>
          <button className="btn-add" onClick={() => upd({ ...p, erinnerungen: [...(p.erinnerungen || []), { datum: '', titel: '', erledigt: false }] })}>+ Erinnerung hinzufügen</button>
        </Acc>
        <Acc icon={<IconDocuments color="#f97316" />} title="Dokumente / Fotos" sum={(() => {
          const docs = p.dokumente || [];
          if (docs.length === 0) return 'Keine';
          const files = docs.filter(d => d.fileData);
          const links = docs.filter(d => !d.fileData);
          if (files.length > 0 && links.length > 0) return `${files.length} Datei${files.length !== 1 ? 'en' : ''}, ${links.length} Link${links.length !== 1 ? 's' : ''}`;
          if (files.length > 0) return `${files.length} Datei${files.length !== 1 ? 'en' : ''}`;
          return `${links.length} Link${links.length !== 1 ? 's' : ''}`;
        })()} open={sec === 'docs'} toggle={() => setSec(sec === 'docs' ? null : 'docs')} color="#f97316">
          <p className="hint">Dateien per Drag & Drop hinzufügen oder Links zu Cloud-Ordnern hinterlegen</p>
          
          {/* Drag & Drop Zone */}
          <div 
            className="doc-dropzone"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('dragover');
              const files = Array.from(e.dataTransfer.files);
              files.forEach(file => {
                if (file.size > 500000) {
                  alert(`Datei "${file.name}" ist zu groß (max. 500KB). Bitte Cloud-Link verwenden.`);
                  return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const fileData = ev.target.result;
                  const fileType = file.type.startsWith('image/') ? 'fotos' : 'sonstige';
                  const newDoc = {
                    name: file.name,
                    typ: fileType,
                    fileData: fileData,
                    fileType: file.type,
                    fileSize: file.size
                  };
                  upd({ ...p, dokumente: [...(p.dokumente || []), newDoc] });
                };
                reader.readAsDataURL(file);
              });
            }}
          >
            <span className="dropzone-icon">📁</span>
            <span>Dateien hierher ziehen</span>
            <small>Bilder & PDFs (max. 500KB pro Datei)</small>
          </div>
          
          {/* Datei-Liste */}
          <div className="docs-list">
            {(p.dokumente || []).map((doc, i) => (
              <div key={i} className={`doc-row ${doc.fileData ? 'has-file' : ''}`}>
                {doc.fileData ? (
                  <>
                    {/* Datei-Eintrag */}
                    <div className="doc-preview">
                      {doc.fileType?.startsWith('image/') ? (
                        <img src={doc.fileData} alt={doc.name} />
                      ) : doc.fileType === 'application/pdf' ? (
                        <span className="doc-pdf-icon">PDF</span>
                      ) : (
                        <span className="doc-file-icon">📄</span>
                      )}
                    </div>
                    <div className="doc-file-info">
                      <span className="doc-file-name">{doc.name}</span>
                      <span className="doc-file-size">{(doc.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                    <select 
                      value={doc.typ || 'sonstige'} 
                      onChange={e => {
                        const newDocs = [...(p.dokumente || [])];
                        newDocs[i] = { ...newDocs[i], typ: e.target.value };
                        upd({ ...p, dokumente: newDocs });
                      }}
                      className="doc-typ-sm"
                    >
                      <option value="kaufvertrag">Kaufvertrag</option>
                      <option value="grundbuch">Grundbuch</option>
                      <option value="mietvertrag">Mietvertrag</option>
                      <option value="darlehen">Darlehen</option>
                      <option value="fotos">Fotos</option>
                      <option value="sonstige">Sonstiges</option>
                    </select>
                    {doc.fileType?.startsWith('image/') && (
                      <button className="doc-view" onClick={() => window.open(doc.fileData, '_blank')} title="Ansehen">👁</button>
                    )}
                    {doc.fileType === 'application/pdf' && (
                      <button className="doc-view" onClick={() => {
                        const win = window.open();
                        win.document.write(`<iframe src="${doc.fileData}" style="width:100%;height:100%;border:none;"></iframe>`);
                      }} title="Ansehen">👁</button>
                    )}
                  </>
                ) : (
                  <>
                    {/* Link-Eintrag */}
                    <select 
                      value={doc.typ || 'sonstige'} 
                      onChange={e => {
                        const newDocs = [...(p.dokumente || [])];
                        newDocs[i] = { ...newDocs[i], typ: e.target.value };
                        upd({ ...p, dokumente: newDocs });
                      }}
                      className="doc-typ"
                    >
                      <option value="kaufvertrag">Kaufvertrag</option>
                      <option value="grundbuch">Grundbuch</option>
                      <option value="mietvertrag">Mietvertrag</option>
                      <option value="darlehen">Darlehensvertrag</option>
                      <option value="fotos">Fotos</option>
                      <option value="sonstige">Sonstiges</option>
                    </select>
                    <input 
                      type="text" 
                      value={doc.name || ''} 
                      onChange={e => {
                        const newDocs = [...(p.dokumente || [])];
                        newDocs[i] = { ...newDocs[i], name: e.target.value };
                        upd({ ...p, dokumente: newDocs });
                      }}
                      placeholder="Bezeichnung..."
                      className="doc-name"
                    />
                    <input 
                      type="url" 
                      value={doc.url || ''} 
                      onChange={e => {
                        const newDocs = [...(p.dokumente || [])];
                        newDocs[i] = { ...newDocs[i], url: e.target.value };
                        upd({ ...p, dokumente: newDocs });
                      }}
                      placeholder="https://..."
                      className="doc-url"
                    />
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-open" title="Öffnen">↗</a>
                    )}
                  </>
                )}
                <button className="doc-del" onClick={() => {
                  const newDocs = (p.dokumente || []).filter((_, x) => x !== i);
                  upd({ ...p, dokumente: newDocs });
                }}>×</button>
              </div>
            ))}
          </div>
          <button className="btn-add" onClick={() => upd({ ...p, dokumente: [...(p.dokumente || []), { name: '', url: '', typ: 'sonstige' }] })}>+ Link hinzufügen</button>
        </Acc>
        
        {/* Nebenkostenabrechnungen */}
        <Acc icon={<IconWerbung color="#f59e0b" />} title="Nebenkostenabrechnungen" sum={`${(p.nebenkostenabrechnungen || []).length} Abrechnungen`} open={sec === 'nk'} toggle={() => setSec(sec === 'nk' ? null : 'nk')} color="#f59e0b">
          <NebenkostenSection immo={p} onUpdate={upd} />
        </Acc>
        
        <Acc icon={<IconNotes color="#06b6d4" />} title="Notizen" sum={p.notizen ? `${p.notizen.length} Zeichen` : 'Keine'} open={sec === 'notes'} toggle={() => setSec(sec === 'notes' ? null : 'notes')} color="#06b6d4">
          <p className="hint">Freitext für persönliche Notizen, Erinnerungen, Links, etc.</p>
          <textarea 
            className="notes-textarea" 
            value={p.notizen || ''} 
            onChange={e => upd({ ...p, notizen: e.target.value })}
            placeholder="z.B. Kontakt Hausverwalter, Besonderheiten, geplante Renovierungen..."
            rows={6}
          />
        </Acc>
          </div>
        )}
      </div>
      {!saved && (
        <div className="save-bottom">
          <div className="save-bottom-main">
            <button onClick={onSave} disabled={!canSave || hasErrors}>
              <span className="btn-icon-sm"><IconSave color="#fff" /></span>Immobilie speichern
            </button>
            {!canSave && <p>Bitte Name vergeben</p>}
          </div>
          <div className="save-bottom-divider"><span>oder</span></div>
          <button className="btn-import-bottom" onClick={onOpenImport}>
            <span className="btn-icon-sm"><IconUpload color="#6366f1" /></span>Daten aus Dokumenten importieren
          </button>
          <p className="import-hint">Immobilienexposé, Darlehensvertrag, etc. hochladen und Daten automatisch auslesen</p>
        </div>
      )}
      
      {/* Darlehen Import Modal */}
      {darlehenImportModal && (
        <DarlehenImportModal 
          onClose={() => setDarlehenImportModal(false)}
          onImport={(importedDarlehen) => {
            upd({ ...p, darlehen: [...(p.darlehen || []), ...importedDarlehen] });
            setDarlehenImportModal(false);
          }}
        />
      )}
      
      {/* Miethistorie Import Modal */}
      {mhistImportModal && (
        <MiethistorieImportModal 
          onClose={() => setMhistImportModal(false)}
          onImport={(importedMiethistorie) => {
            upd({ ...p, miethistorie: [...(p.miethistorie || []), ...importedMiethistorie] });
            setMhistImportModal(false);
            setMhistOpen(true); // Historie öffnen um die neuen Einträge zu zeigen
          }}
        />
      )}
      
      {/* Tilgungsplan Modal */}
      {tilgungsplanDarlehen && (
        <TilgungsplanModal 
          darlehen={tilgungsplanDarlehen}
          onClose={() => setTilgungsplanDarlehen(null)}
        />
      )}
      
      {/* Bestätigungsdialog für Felder zurücksetzen */}
      {resetConfirm && (
        <div className="modal-bg" onClick={() => setResetConfirm(null)}>
          <div className="reset-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="reset-confirm-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </div>
            <h3>Felder zurücksetzen?</h3>
            <p>Alle Felder in diesem Abschnitt werden geleert. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="reset-confirm-buttons">
              <button className="btn-cancel" onClick={() => setResetConfirm(null)}>Abbrechen</button>
              <button className="btn-reset" onClick={() => {
                if (resetConfirm === 'objekt') {
                  upd({
                    ...p,
                    stammdaten: {
                      ...s,
                      name: '',
                      eigentuemer: '',
                      adresse: '',
                      projekt: '',
                      typ: 'etw',
                      objektstatus: 'neubau',
                      nutzung: 'vermietet',
                      bundesland: 'hessen',
                      kaufdatum: '',
                      baujahr: 0,
                      wohnungsNr: '',
                      etage: ''
                    }
                  });
                } else if (resetConfirm === 'kaufpreis') {
                  upd({
                    ...p,
                    stammdaten: {
                      ...s,
                      kaufpreisImmobilie: 0,
                      kaufpreisStellplatz: 0,
                      maklerProvision: 0,
                      mehrkosten: 0,
                      grunderwerbsteuer: 0,
                      notarkosten: 0,
                      verkehrswert: 0,
                      verkehrswertDatum: ''
                    }
                  });
                } else if (resetConfirm === 'afa') {
                  upd({
                    ...p,
                    stammdaten: {
                      ...s,
                      grundstueckGroesse: 0,
                      bodenrichtwert: 0,
                      teileigentumsanteil: 0,
                      afaSatz: 3,
                      degressiveAfa: 0
                    }
                  });
                } else if (resetConfirm === 'miete') {
                  upd({
                    ...p,
                    miethistorie: [],
                    stammdaten: {
                      ...s,
                      mieterName: '',
                      mietstatusAktiv: true,
                      mietbeginn: '',
                      mietende: '',
                      kaltmiete: 0,
                      nebenkostenVorauszahlung: 0,
                      mieteStellplatz: 0,
                      mieteSonderausstattung: 0,
                      kaution: 0,
                      kautionErhalten: false,
                      kautionZurueckgezahlt: false
                    }
                  });
                } else if (resetConfirm === 'finanzierung') {
                  upd({
                    ...p,
                    darlehen: [],
                    stammdaten: {
                      ...s,
                      eigenkapitalAnteil: 20,
                      eigenkapitalBetrag: 0,
                      eigenkapitalHerkunft: 'ersparnis',
                      eigenleistung: 0,
                      kfwZuschuss: 0,
                      kfwProgramm: '',
                      bafaFoerderung: 0,
                      landesFoerderung: 0
                    }
                  });
                } else if (resetConfirm === 'sonderausstattung') {
                  upd({
                    ...p,
                    stammdaten: {
                      ...s,
                      sonderausstattung: []
                    }
                  });
                }
                setResetConfirm(null);
              }}>Zurücksetzen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Rendite
const Rendite = ({ p, upd, c }) => {
  const [tab, setTab] = useState('ov');
  const s = p.stammdaten;
  const r = p.rendite;
  const setR = (f, v) => upd({ ...p, rendite: { ...r, [f]: v } });

  const proj = useMemo(() => {
    const ek = c.ak * (s.eigenkapitalAnteil / 100);
    const fk = c.ak - ek;
    const ann = fk * ((s.zinssatz + s.tilgung) / 100);
    const jahre = [];
    let rs = fk, lk = 0;
    for (let j = 1; j <= 30; j++) {
      const mf = Math.pow(1 + r.mietanpassung / 100, j - 1);
      const m = c.jm * mf * (1 - r.mietausfall / 52);
      const ko = m * (r.kostenProzent / 100) + s.wohnflaeche * r.instandhaltung * mf;
      const zi = rs * (s.zinssatz / 100);
      const vv = m - ko - c.afaGes - zi;
      const st = vv * (s.steuersatz / 100);
      const liq = m - ko - ann - st;
      lk += liq;
      jahre.push({ j, m, ko, zi, vv, st, liq, lk, rs });
      rs = Math.max(0, rs - (ann - zi));
    }
    const be = jahre.findIndex(x => x.lk >= 0) + 1;
    return { jahre, be: be || '>30', ek, fk, ann, nr: c.kp > 0 ? (c.jm * (1 - r.kostenProzent / 100)) / c.kp : 0 };
  }, [c, s, r]);

  return (
    <div className="mod">
      <div className="tabs">{['ov', 'set', 'proj', 'liq'].map(t => <button key={t} className={tab === t ? 'act' : ''} onClick={() => setTab(t)}>{t === 'ov' ? <><span className="tab-icon"><IconChart color={tab === t ? '#6366f1' : '#71717a'} /></span>Übersicht</> : t === 'set' ? <><span className="tab-icon"><IconSettings color={tab === t ? '#6366f1' : '#71717a'} /></span>Parameter</> : t === 'proj' ? <><span className="tab-icon"><IconTrend color={tab === t ? '#6366f1' : '#71717a'} /></span>Rendite</> : <><span className="tab-icon"><IconLiquidity color={tab === t ? '#6366f1' : '#71717a'} /></span>Liquidität</>}</button>)}</div>
      {tab === 'ov' && (
        <>
          <div className="kpis">
            <div className="kpi-c"><span>Bruttorendite</span><b>{fmtP(c.rendite)}</b></div>
            <div className="kpi-c"><span>Nettorendite</span><b>{fmtP(proj.nr)}</b></div>
            <div className="kpi-c"><span>€/qm</span><b>{fmt(s.wohnflaeche > 0 ? c.kp / s.wohnflaeche : 0)}</b></div>
            <div className="kpi-c"><span>Jahres-Kaltmiete</span><b>{fmt(c.jm)}</b></div>
            <div className="kpi-c hl"><span>Break-Even</span><b>Jahr {proj.be}</b></div>
          </div>
          <div className="cards">
            <div className="card"><h4>Investition</h4><div className="row"><span>Kaufpreis</span><span>{fmt(c.kp)}</span></div><div className="row"><span>+ Nebenkosten</span><span>{fmt(c.nk)}</span></div><div className="row tot"><span>= AK</span><span>{fmt(c.ak)}</span></div></div>
            <div className="card"><h4>Finanzierung</h4><div className="row"><span>EK ({s.eigenkapitalAnteil}%)</span><span>{fmt(proj.ek)}</span></div><div className="row"><span>FK</span><span>{fmt(proj.fk)}</span></div><div className="row tot"><span>Annuität</span><span>{fmt(proj.ann)}</span></div></div>
          </div>
        </>
      )}
      {tab === 'set' && (
        <div className="set-panel">
          <Input label="Mietanpassung p.a." value={r.mietanpassung} onChange={v => setR('mietanpassung', v)} suffix="%" step={0.5} />
          <Input label="Nicht umlegbare Kosten" value={r.kostenProzent} onChange={v => setR('kostenProzent', v)} suffix="%" />
          <Input label="Instandhaltung" value={r.instandhaltung} onChange={v => setR('instandhaltung', v)} suffix="€/qm" />
          <Input label="Mietausfall" value={r.mietausfall} onChange={v => setR('mietausfall', v)} suffix="Wo./J." />
        </div>
      )}
      {tab === 'proj' && (
        <>
          <h4 className="section-title-first">Jährliche Renditeübersicht</h4>
          <div className="tbl-wrap"><table><thead><tr><th>Jahr</th><th>Miete</th><th>Kosten</th><th>AfA</th><th>Zinsen</th><th>V+V</th><th><span className="th-with-info">Steuereffekt<span className="info-tooltip"><button className="info-btn"><IconInfo color="var(--text-dim)" /></button><span className="info-tooltip-content"><strong>Was bedeutet Steuereffekt?</strong><p><span className="dot green"></span><b>Grün (negativ)</b> = Steuerersparnis – Die Immobilie mindert dein zu versteuerndes Einkommen. Du zahlst weniger Steuern.</p><p><span className="dot red"></span><b>Rot (positiv)</b> = Steuerlast – Die Mieteinnahmen übersteigen die Abzüge. Auf den Überschuss zahlst du Steuern.</p></span></span></span></th></tr></thead><tbody>
            {proj.jahre.map(x => <tr key={x.j}><td>{x.j}</td><td>{fmt(x.m)}</td><td className="neg">{fmt(-x.ko)}</td><td className="neg">{fmt(-c.afaGes)}</td><td className="neg">{fmt(-x.zi)}</td><td className={x.vv >= 0 ? 'pos' : 'neg'}>{fmt(x.vv)}</td><td className={x.st >= 0 ? 'neg' : 'pos'}>{fmt(-x.st)}</td></tr>)}
          </tbody></table></div>
          <h4 className="section-title">Steuereffekt über 30 Jahre</h4>
          <div className="chart">
            {proj.jahre.filter((_, i) => i % 3 === 0).map(x => {
              const maxVal = Math.max(...proj.jahre.map(y => Math.abs(y.st)));
              return (
                <div key={x.j} className="bar-row">
                  <span>J{x.j}</span>
                  <div className="bar-bg">
                    <div className={`bar ${x.st >= 0 ? 'neg' : 'pos'}`} style={{ width: `${Math.abs(x.st) / maxVal * 100}%` }} />
                  </div>
                  <span className={x.st >= 0 ? 'neg' : 'pos'}>{fmt(-x.st)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === 'liq' && (
        <>
          <div className="kpis">
            <div className="kpi-c"><span>Jahr 1</span><b>{fmt(proj.jahre[0]?.liq)}</b></div>
            <div className="kpi-c"><span>Jahr 10</span><b>{fmt(proj.jahre[9]?.liq)}</b></div>
            <div className="kpi-c hl"><span>Break-Even</span><b>Jahr {proj.be}</b></div>
            <div className="kpi-c"><span>Nach 30 J.</span><b>{fmt(proj.jahre[29]?.lk)}</b></div>
          </div>
          <h4 className="section-title-first">Jährliche Liquiditätsübersicht</h4>
          <div className="tbl-wrap"><table><thead><tr><th>Jahr</th><th>Miete</th><th>Kosten</th><th>Annuität</th><th>Liquidität</th><th>Kumuliert</th></tr></thead><tbody>
            {proj.jahre.map(x => <tr key={x.j}><td>{x.j}</td><td className="pos">{fmt(x.m)}</td><td className="neg">{fmt(-x.ko)}</td><td className="neg">{fmt(-x.ann)}</td><td className={x.liq >= 0 ? 'pos' : 'neg'}>{fmt(x.liq)}</td><td className={x.lk >= 0 ? 'pos' : 'neg'}>{fmt(x.lk)}</td></tr>)}
          </tbody></table></div>
          <h4 className="section-title">Kumulierte Liquidität über 30 Jahre</h4>
          <div className="chart">{[0, 4, 9, 14, 19, 24, 29].map(i => { const x = proj.jahre[i]; if (!x) return null; const max = Math.max(...proj.jahre.map(y => Math.abs(y.lk))); return <div key={x.j} className="bar-row"><span>J{x.j}</span><div className="bar-bg"><div className={`bar ${x.lk >= 0 ? 'pos' : 'neg'}`} style={{ width: `${Math.abs(x.lk) / max * 100}%` }} /></div><span className={x.lk >= 0 ? 'pos' : 'neg'}>{fmt(x.lk)}</span></div>; })}</div>
        </>
      )}
    </div>
  );
};

// Steuer
const Steuer = ({ p, upd, c }) => {
  const kj = parseInt(p.stammdaten.kaufdatum?.split('-')[0]) || 2024;
  const [yr, setYr] = useState(kj);
  const [sec, setSec] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const yd = p.steuerJahre?.[yr] || { wk: [], miet: c.jm, nkVor: 0, nkAbr: 0 };
  const setYd = (f, v) => upd({ ...p, steuerJahre: { ...p.steuerJahre, [yr]: { ...yd, [f]: v } } });
  const addWK = () => setYd('wk', [...yd.wk, { bez: '', betrag: 0 }]);
  const updWK = (i, f, v) => { const a = [...yd.wk]; a[i] = { ...a[i], [f]: f === 'betrag' ? parseFloat(v) || 0 : v }; setYd('wk', a); };
  const delWK = i => setYd('wk', yd.wk.filter((_, x) => x !== i));
  const jsk = yr - kj;
  const afaG = jsk < 100 / p.stammdaten.afaSatz ? c.afaGeb : 0;
  const afaS = jsk < 10 ? c.afaSA : 0;
  const afaTot = afaG + afaS;
  const wkTot = yd.wk.reduce((a, x) => a + (x.betrag || 0), 0);
  const ein = yd.miet + yd.nkVor + yd.nkAbr;
  const erg = ein - afaTot - wkTot;
  const stEff = erg * (p.stammdaten.steuersatz / 100);
  const years = []; for (let y = kj; y <= kj + 10; y++) years.push(y);

  // Export-Komponente
  const ExportView = () => {
    const s = p.stammdaten;
    const gwg = (s.grundstueckGroesse || 0) * (s.bodenrichtwert || 0);
    const ga = s.teileigentumsanteil > 0 ? (s.teileigentumsanteil / 10000) * gwg : 0;
    const [copied, setCopied] = useState(false);
    
    const exportData = { s, c, yr, yd, afaG, afaS, afaTot, wkTot, ein, erg, stEff, gwg, ga, BUNDESLAENDER };
    const htmlContent = generateExport(exportData);
    
    const handleDownload = () => {
      const fullHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Immobilien-Übersicht ${s.name} ${yr}</title></head><body>${htmlContent}</body></html>`;
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Immobilien-Uebersicht_${s.name.replace(/[^a-zA-Z0-9]/g, '_')}_${yr}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    
    const handleCopyText = () => {
      const f = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
      const f2 = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v || 0);
      const fp = (v) => new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 2 }).format(v || 0);
      
      const text = `IMMOBILIEN-ÜBERSICHT ${yr}
================================
${s.typ.toUpperCase()}, ${s.adresse || 'Keine Adresse'}
${s.name}${s.eigentuemer ? ` · Eigentümer: ${s.eigentuemer}` : ''}

GRUNDDATEN
----------
Kaufpreis Immobilie: ${f(s.kaufpreisImmobilie)}
${s.kaufpreisStellplatz > 0 ? `Kaufpreis Stellplatz: ${f(s.kaufpreisStellplatz)}\n` : ''}Kaufpreis Gesamt: ${f(c.kp)}

MIETEINNAHMEN
-------------
Wohnfläche: ${s.wohnflaeche} qm × ${f(s.mieteProQm)}/qm
Miete pro Monat: ${f(c.mm)}
Jahres-Kaltmiete: ${f(c.jm)}
Bruttorendite: ${fp(c.rendite)}

ANSCHAFFUNGSKOSTEN
------------------
Anschaffungskosten Gesamt: ${f(c.ak)}
./. Grundstücksanteil: -${f(ga)}
Anschaffungskosten Gebäude: ${f(c.afaBasis)}
AfA linear ${s.afaSatz}%: ${f(afaG)}

ZUSAMMENFASSUNG ${yr}
${'='.repeat(20)}
AfA Gesamt: ${f(afaTot)}
Werbungskosten: ${f(wkTot)}
AfA + Werbungskosten: -${f(afaTot + wkTot)}

Einnahmen Gesamt: ${f(ein)}

ERGEBNIS: ${f2(erg)}
${erg < 0 ? `→ Steuerersparnis ca. ${f(Math.abs(stEff))}` : `→ Steuerlast ca. ${f(stEff)}`} bei ${s.steuersatz}% Steuersatz

---
Erstellt mit ImmoHub · ${new Date().toLocaleDateString('de-DE')}`;

      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    
    return (
      <div className="export-view">
        <div className="export-header">
          <h2>{s.typ.toUpperCase()}, {s.adresse || 'Keine Adresse'}</h2>
          <p>{s.name} {s.eigentuemer ? `· Eigentümer: ${s.eigentuemer}` : ''}</p>
        </div>
        
        {/* Grunddaten */}
        <div className="export-section">
          <h3>Grunddaten</h3>
          <table className="export-table">
            <tbody>
              <tr><td>Kaufpreis der Immobilie</td><td className="val">{fmt(s.kaufpreisImmobilie)}</td></tr>
              {s.bodenrichtwert > 0 && <tr><td>Bodenrichtwert pro qm Grundstück</td><td className="val">{fmt(s.bodenrichtwert)}</td><td className="note">Grundstückswert: {fmt(gwg)}</td></tr>}
              {s.grundstueckGroesse > 0 && <tr><td>Grundstücksgröße</td><td className="val">{s.grundstueckGroesse} qm</td></tr>}
              {s.kaufpreisStellplatz > 0 && <tr><td>Kaufpreis Stellplatz</td><td className="val">{fmt(s.kaufpreisStellplatz)}</td></tr>}
              <tr className="hl"><td>Kaufpreis Gesamt</td><td className="val">{fmt(c.kp)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Mieteinnahmen */}
        <div className="export-section">
          <h3>Mieteinnahmen</h3>
          <table className="export-table">
            <thead>
              <tr><th></th><th>Kaufpreis</th><th>TEA (10.000stel)</th><th>Fläche</th><th>Miete/qm</th><th>Miete p.M.</th><th>Miete p.A.</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Wohnung</td>
                <td className="val">{fmt(s.kaufpreisImmobilie)}</td>
                <td className="val">{s.teileigentumsanteil || '–'}</td>
                <td className="val">{s.wohnflaeche} qm</td>
                <td className="val">{fmt(s.mieteProQm)}</td>
                <td className="val">{fmt(s.wohnflaeche * s.mieteProQm)}</td>
                <td className="val">{fmt(s.wohnflaeche * s.mieteProQm * 12)}</td>
              </tr>
              {s.kaufpreisStellplatz > 0 && (
                <tr>
                  <td>Stellplatz</td>
                  <td className="val">{fmt(s.kaufpreisStellplatz)}</td>
                  <td className="val">–</td>
                  <td className="val">{s.anzahlStellplaetze} Stck.</td>
                  <td className="val">–</td>
                  <td className="val">{fmt(s.mieteStellplatz)}</td>
                  <td className="val">{fmt(s.mieteStellplatz * 12)}</td>
                </tr>
              )}
              {c.saSumme > 0 && (
                <tr>
                  <td>Sonderausstattung</td>
                  <td className="val">{fmt(c.saSumme)}</td>
                  <td className="val">{fmt(c.afaSA * 10)}</td>
                  <td className="val">–</td>
                  <td className="val">–</td>
                  <td className="val">{fmt(s.mieteSonderausstattung || 0)}</td>
                  <td className="val">{fmt((s.mieteSonderausstattung || 0) * 12)}</td>
                </tr>
              )}
              <tr className="hl">
                <td>Summe</td>
                <td className="val">{fmt(c.kp + c.saSumme)}</td>
                <td className="val"></td>
                <td className="val">{s.wohnflaeche} qm</td>
                <td className="val"></td>
                <td className="val">{fmt(c.mm)}</td>
                <td className="val">{fmt(c.jm)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Anschaffungskosten */}
        <div className="export-section">
          <h3>Anschaffungskosten</h3>
          <table className="export-table">
            <tbody>
              <tr><td>+ Kaufpreis Immobilie</td><td className="val">{fmt(s.kaufpreisImmobilie)}</td></tr>
              {s.kaufpreisStellplatz > 0 && <tr><td>+ Kaufpreis Stellplatz</td><td className="val">{fmt(s.kaufpreisStellplatz)}</td></tr>}
              {s.mehrkosten > 0 && <tr><td>+ Mehrkosten</td><td className="val">{fmt(s.mehrkosten)}</td></tr>}
              {s.maklerProvision > 0 && <tr><td>+ Vermittlungsprovision (Makler)</td><td className="val">{fmt(s.maklerProvision)}</td></tr>}
              <tr className="sub"><td>Zwischensumme</td><td className="val">{fmt(c.kp + (s.mehrkosten || 0) + (s.maklerProvision || 0))}</td></tr>
              <tr><td>+ Grunderwerbsteuer</td><td className="val">{fmt(s.grunderwerbsteuer)}</td><td className="note">{BUNDESLAENDER[s.bundesland]?.grest || 6}% vom KP</td></tr>
              <tr><td>+ Notarkosten</td><td className="val">{fmt(s.notarkosten)}</td></tr>
              <tr className="hl"><td>Anschaffungskosten Gesamt</td><td className="val">{fmt(c.ak)}</td></tr>
              <tr><td>./. Grundstücksanteil (Bodenwert)</td><td className="val neg">-{fmt(ga)}</td><td className="note">{s.teileigentumsanteil}/10.000stel von {fmt(gwg)}</td></tr>
              <tr className="hl"><td>Anschaffungskosten Gebäude</td><td className="val">{fmt(c.afaBasis)}</td></tr>
              <tr className="hl accent"><td>AfA linear {s.afaSatz}%</td><td className="val">{fmt(afaG)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Sonderausstattung */}
        {s.sonderausstattung?.length > 0 && (
          <div className="export-section">
            <h3>Sonderausstattung (AfA 10%)</h3>
            <table className="export-table">
              <tbody>
                {s.sonderausstattung.map((sa, i) => (
                  <tr key={i}><td>{sa.name || `Position ${i+1}`}</td><td className="val">{fmt(sa.betrag)}</td></tr>
                ))}
                <tr className="hl"><td>Summe Sonderausstattung</td><td className="val">{fmt(c.saSumme)}</td></tr>
                <tr className="hl accent"><td>AfA Sonderausstattung (10%) p.a.</td><td className="val">{fmt(c.afaSA)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Werbungskosten */}
        <div className="export-section">
          <h3>Werbungskosten {yr}</h3>
          <table className="export-table">
            <tbody>
              {yd.wk.length > 0 ? yd.wk.map((w, i) => (
                <tr key={i}><td>{w.bez || `Position ${i+1}`}</td><td className="val">{fmt(w.betrag)}</td></tr>
              )) : (
                <tr><td colSpan="2" className="empty-note">Keine Werbungskosten erfasst</td></tr>
              )}
              <tr className="hl"><td>Werbungskosten Gesamt</td><td className="val">{fmt(wkTot)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Zusammenfassung */}
        <div className="export-section summary">
          <h3>Zusammenfassung AfA + Werbungskosten {yr}</h3>
          <div className="export-cols">
            <div className="export-col">
              <table className="export-table">
                <tbody>
                  {c.saSumme > 0 && <tr><td>AfA Sonderausstattung (10%) p.a.</td><td className="val">{fmt(c.afaSA)}</td></tr>}
                  <tr><td>AfA Anschaffungskosten linear ({s.afaSatz}%)</td><td className="val">{fmt(afaG)}</td></tr>
                  <tr><td>Werbungskosten {yr} Gesamt</td><td className="val">{fmt(wkTot)}</td></tr>
                  <tr className="hl"><td>AfA + Werbungskosten {yr}</td><td className="val neg">-{fmt(afaTot + wkTot)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="export-col">
              <table className="export-table">
                <tbody>
                  <tr><td>Mieteinnahmen {yr}</td><td className="val">{fmt(yd.miet)}</td></tr>
                  {yd.nkVor > 0 && <tr><td>Einnahmen aus NK Vorauszahlung {yr}</td><td className="val">{fmt(yd.nkVor)}</td></tr>}
                  {yd.nkAbr !== 0 && <tr><td>NK-Abrechnung {yr}</td><td className="val">{fmt(yd.nkAbr)}</td></tr>}
                  <tr className="sub"><td>Einnahmen Gesamt</td><td className="val">{fmt(ein)}</td></tr>
                  <tr><td>AfA + Werbungskosten {yr}</td><td className="val neg">-{fmt(afaTot + wkTot)}</td></tr>
                  <tr className={`hl ${erg >= 0 ? 'pos' : 'neg'}`}><td>Ergebnis</td><td className="val">{fmtD(erg)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="export-footer">
            <p>Steuerliche Auswirkung bei {s.steuersatz}% Steuersatz: <strong className={erg < 0 ? 'pos' : 'neg'}>{erg < 0 ? `Ersparnis ca. ${fmt(Math.abs(stEff))}` : `Steuerlast ca. ${fmt(stEff)}`}</strong></p>
          </div>
        </div>

        <div className="export-actions">
          <button className="btn-print" onClick={handleDownload}><span className="btn-icon-sm"><IconDocument color="#fff" /></span>HTML herunterladen</button>
          <button className="btn-copy" onClick={handleCopyText}>{copied ? <><span className="btn-icon-sm"><IconCheck color="#fff" /></span>Kopiert!</> : <><span className="btn-icon-sm"><IconCopy color="#fff" /></span>Als Text kopieren</>}</button>
          <button className="btn-back" onClick={() => setShowExport(false)}><span className="btn-icon-sm"><IconArrowLeft color="#fafafa" /></span>Zurück</button>
        </div>
        <p className="export-hint-small"><span className="hint-icon-sm"><IconIdea color="#71717a" /></span>HTML-Datei herunterladen, im Browser öffnen und mit Strg+P als PDF drucken. Oder Text kopieren für E-Mail/Notizen.</p>
      </div>
    );
  };

  if (showExport) {
    return <ExportView />;
  }

  return (
    <div className="mod">
      <div className="yr-bar">
        <label>Jahr:</label>
        <select value={yr} onChange={e => setYr(+e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        <span className="badge">{jsk + 1}. Jahr</span>
        <button className="btn-export" onClick={() => setShowExport(true)}><span className="btn-export-icon"><IconSteuer color="#6366f1" /></span>Übersicht exportieren</button>
      </div>
      <div className={`result-box ${erg >= 0 ? 'pos' : 'neg'}`}>
        <div className="result-header">
          <span>Steuerliches Ergebnis {yr}</span>
          <div className="info-tooltip">
            <button className="info-btn"><IconInfo color="var(--text-dim)" /></button>
            <div className="info-tooltip-content">
              <strong>Was bedeutet das Ergebnis?</strong>
              <p><span className="dot green"></span><b>Grün (negativ)</b> = Steuerersparnis – Die Immobilie mindert dein zu versteuerndes Einkommen. Du zahlst weniger Steuern.</p>
              <p><span className="dot red"></span><b>Rot (positiv)</b> = Steuerlast – Die Mieteinnahmen übersteigen die Abzüge. Auf den Überschuss zahlst du Steuern.</p>
            </div>
          </div>
        </div>
        <b>{fmtD(erg)}</b>
        <small>{erg < 0 ? `→ Ersparnis ca. ${fmt(Math.abs(stEff))}` : `→ Steuerlast ca. ${fmt(stEff)}`}</small>
      </div>
      <div className="accs">
        <Acc icon={<IconAfa color="#f59e0b" />} title="AfA" sum={fmt(afaTot)} open={sec === 'afa'} toggle={() => setSec(sec === 'afa' ? null : 'afa')} color="#f59e0b">
          <div className="afa-box"><div className="afa-r"><span>Gebäude ({p.stammdaten.afaSatz}%)</span><span>{fmt(afaG)}</span></div><small>Basis: {fmt(c.afaBasis)}</small></div>
          {c.saSumme > 0 && <div className="afa-box"><div className="afa-r"><span>Sonderausst. (10%)</span><span>{fmt(afaS)}</span></div><small>Basis: {fmt(c.saSumme)}</small></div>}
          <div className="res hl"><span>AfA Gesamt</span><span>{fmt(afaTot)}</span></div>
        </Acc>
        <Acc icon={<IconWerbung color="#3b82f6" />} title="Werbungskosten" sum={yd.wk.length > 0 ? `${yd.wk.length}x, ${fmt(wkTot)}` : 'Keine'} open={sec === 'wk'} toggle={() => setSec(sec === 'wk' ? null : 'wk')} color="#3b82f6">
          {yd.wk.map((x, i) => <div key={i} className="wk-row"><input value={x.bez} onChange={e => updWK(i, 'bez', e.target.value)} placeholder="Bezeichnung" /><NumInput value={x.betrag} onChange={v => updWK(i, 'betrag', v)} placeholder="€" /><button onClick={() => delWK(i)}>×</button></div>)}
          <button className="btn-add" onClick={addWK}>+ Hinzufügen</button>
          {wkTot > 0 && <div className="res hl"><span>WK Gesamt</span><span>{fmt(wkTot)}</span></div>}
        </Acc>
        <Acc icon={<IconEinnahmen color="#10b981" />} title="Einnahmen" sum={fmt(ein)} open={sec === 'ein'} toggle={() => setSec(sec === 'ein' ? null : 'ein')} color="#10b981">
          <Input label="Mieteinnahmen" value={yd.miet} onChange={v => setYd('miet', v)} suffix="€" />
          <Input label="NK-Vorauszahlung" value={yd.nkVor} onChange={v => setYd('nkVor', v)} suffix="€" />
          <Input label="NK-Abrechnung" value={yd.nkAbr} onChange={v => setYd('nkAbr', v)} suffix="€" step={0.01} />
          <div className="res hl"><span>Einnahmen</span><span className="pos">{fmt(ein)}</span></div>
        </Acc>
      </div>
    </div>
  );
};

// Standorte Karte Komponente - SVG-basiert
const StandorteMap = ({ locations }) => {
  // Bekannte Koordinaten für deutsche Städte (lat, lon)
  const stadtCoords = {
    'cölbe': [50.8667, 8.7833],
    'fronhausen': [50.7000, 8.6833],
    'marburg': [50.8021, 8.7711],
    'kirchhain': [50.8167, 8.7667],
    'neustadt': [50.8000, 8.8500],
    'gießen': [50.5833, 8.6667],
    'giessen': [50.5833, 8.6667],
    'frankfurt': [50.1109, 8.6821],
    'wiesbaden': [50.0782, 8.2398],
    'kassel': [51.3127, 9.4797],
    'darmstadt': [49.8728, 8.6512],
    'fulda': [50.5528, 9.6778],
    'limburg': [50.3833, 8.0667],
    'bad homburg': [50.2267, 8.6181],
    'offenbach': [50.0956, 8.7761],
    'hanau': [50.1267, 8.9169],
    'rüsselsheim': [49.9953, 8.4114],
    'bad vilbel': [50.1786, 8.7361],
    'friedberg': [50.3344, 8.7556],
    'wetterau': [50.35, 8.8],
    'lahn-dill': [50.65, 8.35],
  };
  
  // PLZ zu Koordinaten
  const plzCoords = {
    '35091': [50.8667, 8.7833], // Cölbe
    '35112': [50.7000, 8.6833], // Fronhausen
    '35037': [50.8021, 8.7711], // Marburg
    '35274': [50.8167, 8.7667], // Kirchhain
    '35390': [50.5833, 8.6667], // Gießen
    '60311': [50.1109, 8.6821], // Frankfurt
    '65183': [50.0782, 8.2398], // Wiesbaden
    '34117': [51.3127, 9.4797], // Kassel
    '64283': [49.8728, 8.6512], // Darmstadt
  };
  
  // Finde Koordinaten für einen Ort
  const getCoords = (ort, plz) => {
    // PLZ-Lookup
    if (plz) {
      const plzPrefix = plz.substring(0, 5);
      if (plzCoords[plzPrefix]) return plzCoords[plzPrefix];
    }
    
    // Stadt-Lookup (case-insensitive)
    const ortLower = ort.toLowerCase().trim();
    if (stadtCoords[ortLower]) return stadtCoords[ortLower];
    
    // Teilstring-Match
    for (const [stadt, coords] of Object.entries(stadtCoords)) {
      if (ortLower.includes(stadt) || stadt.includes(ortLower)) {
        return coords;
      }
    }
    
    // Fallback: Mitte Hessen
    return [50.6, 8.7];
  };
  
  // Berechne Marker-Positionen
  const markers = locations.map(loc => {
    const coords = getCoords(loc.ort, loc.plz);
    return {
      ...loc,
      lat: coords[0],
      lon: coords[1]
    };
  });
  
  // Berechne Bounds
  const lats = markers.map(m => m.lat);
  const lons = markers.map(m => m.lon);
  const minLat = Math.min(...lats) - 0.1;
  const maxLat = Math.max(...lats) + 0.1;
  const minLon = Math.min(...lons) - 0.15;
  const maxLon = Math.max(...lons) + 0.15;
  
  // Konvertiere lat/lon zu SVG-Koordinaten
  const toSvg = (lat, lon) => {
    const x = ((lon - minLon) / (maxLon - minLon)) * 280 + 10;
    const y = ((maxLat - lat) / (maxLat - minLat)) * 160 + 10;
    return { x, y };
  };
  
  return (
    <div className="svg-map-container">
      <svg viewBox="0 0 300 180" className="svg-map">
        {/* Hintergrund */}
        <rect x="0" y="0" width="300" height="180" fill="var(--bg-input)" rx="8"/>
        
        {/* Einfache Straßen/Verbindungen */}
        <g stroke="var(--border)" strokeWidth="1" opacity="0.3">
          {markers.length > 1 && markers.slice(1).map((m, i) => {
            const prev = toSvg(markers[i].lat, markers[i].lon);
            const curr = toSvg(m.lat, m.lon);
            return <line key={i} x1={prev.x} y1={prev.y} x2={curr.x} y2={curr.y} strokeDasharray="4,4"/>;
          })}
        </g>
        
        {/* Marker */}
        {markers.map((m, i) => {
          const pos = toSvg(m.lat, m.lon);
          const color = TYP_COLORS[m.immobilien[0]?.typ]?.border || '#6366f1';
          return (
            <g key={i} className="map-marker-svg">
              {/* Pin-Schatten */}
              <ellipse cx={pos.x} cy={pos.y + 12} rx="6" ry="3" fill="rgba(0,0,0,0.2)"/>
              {/* Pin */}
              <path 
                d={`M${pos.x},${pos.y + 10} 
                    C${pos.x - 8},${pos.y + 2} ${pos.x - 8},${pos.y - 10} ${pos.x},${pos.y - 14}
                    C${pos.x + 8},${pos.y - 10} ${pos.x + 8},${pos.y + 2} ${pos.x},${pos.y + 10}Z`}
                fill={color}
              />
              {/* Kreis im Pin */}
              <circle cx={pos.x} cy={pos.y - 6} r="4" fill="white" opacity="0.9"/>
              {/* Anzahl */}
              <text x={pos.x} y={pos.y - 3} textAnchor="middle" fontSize="7" fontWeight="bold" fill={color}>
                {m.immobilien.length}
              </text>
              {/* Label */}
              <text x={pos.x} y={pos.y + 24} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
                {m.ort.length > 12 ? m.ort.substring(0, 10) + '...' : m.ort}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Gesamtübersicht / Dashboard
const Dashboard = ({ immobilien, onSelectImmo, aktiveBeteiligte = [], beteiligte = [], onReorder, filter = 'alle', onFilterChange }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Zinsbindungs-Check: Warnung wenn < 12 Monate
  const getZinsbindungWarning = (immo) => {
    const darlehen = immo.darlehen || [];
    const heute = new Date();
    
    for (const d of darlehen) {
      if (d.zinsbindungEnde) {
        const ende = new Date(d.zinsbindungEnde);
        const diffMonths = (ende.getFullYear() - heute.getFullYear()) * 12 + (ende.getMonth() - heute.getMonth());
        if (diffMonths <= 12 && diffMonths >= 0) {
          return {
            monate: diffMonths,
            datum: ende.toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' })
          };
        }
      }
    }
    return null;
  };

  // Fortschrittsberechnung
  const calcProgress = (s) => {
    const fields = [
      { key: 'name', weight: 1 },
      { key: 'adresse', weight: 1 },
      { key: 'kaufpreisImmobilie', weight: 1 },
      { key: 'wohnflaeche', weight: 1 },
      { key: 'mieteProQm', weight: 1 },
      { key: 'kaufdatum', weight: 0.5 },
      { key: 'baujahr', weight: 0.5 },
      { key: 'eigenkapitalAnteil', weight: 0.5 },
      { key: 'zinssatz', weight: 0.5 },
      { key: 'tilgung', weight: 0.5 },
      { key: 'grundstueckGroesse', weight: 0.5 },
      { key: 'bodenrichtwert', weight: 0.5 },
    ];
    let filled = 0, total = 0;
    fields.forEach(f => {
      total += f.weight;
      const val = s[f.key];
      if (val && val !== '' && val !== 0) filled += f.weight;
    });
    return Math.round((filled / total) * 100);
  };

  // Berechnung für jede Immobilie
  const immoData = immobilien.map(immo => {
    const s = immo.stammdaten;
    const kp = (s.kaufpreisImmobilie || 0) + (s.kaufpreisStellplatz || 0);
    const nk = (s.mehrkosten || 0) + (s.maklerProvision || 0) + (s.grunderwerbsteuer || 0) + (s.notarkosten || 0);
    const ak = kp + nk;
    // Jahres-Kaltmiete: Kaltmiete + Stellplatz + Sonderausstattung (ohne NK-Vorauszahlung)
    const jm = ((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12;
    const rendite = kp > 0 ? jm / kp : 0;
    const ek = ak * (s.eigenkapitalAnteil / 100);
    const fk = ak - ek;
    const ann = fk * ((s.zinssatz + s.tilgung) / 100);
    const gwg = (s.grundstueckGroesse || 0) * (s.bodenrichtwert || 0);
    const ga = s.teileigentumsanteil > 0 ? (s.teileigentumsanteil / 10000) * gwg : 0;
    const afaBasis = ak - ga;
    const afaGeb = afaBasis * ((s.afaSatz || 3) / 100);
    const saSumme = s.sonderausstattung?.reduce((a, i) => a + (i.betrag || 0), 0) || 0;
    const afaSA = saSumme * 0.1;
    const afaGes = afaGeb + afaSA;
    const progress = calcProgress(s);
    
    // Anteil der aktiven Beteiligten berechnen (Summe aller ausgewählten, max. 100%)
    let anteil = 100;
    if (aktiveBeteiligte.length > 0) {
      const summe = (immo.beteiligungen || [])
        .filter(b => aktiveBeteiligte.includes(b.beteiligterID))
        .reduce((sum, b) => sum + (b.anteil || 0), 0);
      anteil = Math.min(summe, 100); // Deckelung auf 100%
    }
    const faktor = anteil / 100;
    
    // Zinsbindungs-Warnung prüfen
    const zinsbindungWarning = getZinsbindungWarning(immo);
    
    // Monatliche Darlehensrate berechnen
    const darlehensRate = (immo.darlehen || []).reduce((sum, d) => sum + (d.monatsrate || 0), 0);
    
    return { 
      ...immo, 
      kp: kp * faktor, 
      nk: nk * faktor, 
      ak: ak * faktor, 
      jm: jm * faktor, 
      mm: (jm / 12) * faktor, 
      rendite, // Rendite bleibt prozentual gleich
      ek: ek * faktor, 
      fk: fk * faktor, 
      ann: ann * faktor, 
      afaGes: afaGes * faktor, 
      wohnflaeche: (s.wohnflaeche || 0) * faktor, 
      progress,
      anteil,
      zinsbindungWarning,
      darlehensRate
    };
  });

  // Filter nach Beteiligten (nur Immobilien wo mindestens einer der ausgewählten dabei ist)
  const filteredByBeteiligter = aktiveBeteiligte.length > 0
    ? immoData.filter(i => i.anteil > 0)
    : immoData;

  // Schnellfilter
  const filteredByType = filteredByBeteiligter.filter(i => {
    if (filter === 'alle') return true;
    if (filter === 'vermietet') return i.stammdaten.nutzung === 'vermietet';
    if (filter === 'eigengenutzt') return i.stammdaten.nutzung === 'eigengenutzt';
    if (filter === 'zupruefen') return i.importiert && i.zuPruefen?.length > 0;
    if (filter === 'zinsbindung') return i.zinsbindungWarning !== null;
    return true;
  });

  // Filter nach Suche
  const filtered = filteredByType.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.stammdaten.name?.toLowerCase().includes(q) ||
      i.stammdaten.adresse?.toLowerCase().includes(q) ||
      i.stammdaten.eigentuemer?.toLowerCase().includes(q) ||
      i.stammdaten.typ?.toLowerCase().includes(q)
    );
  });

  // Sortierung
  const sorted = [...filtered].sort((a, b) => {
    let valA, valB;
    switch (sortBy) {
      case 'name': valA = a.stammdaten.name?.toLowerCase() || ''; valB = b.stammdaten.name?.toLowerCase() || ''; break;
      case 'kp': valA = a.kp; valB = b.kp; break;
      case 'jm': valA = a.jm; valB = b.jm; break;
      case 'rendite': valA = a.rendite; valB = b.rendite; break;
      case 'afaGes': valA = a.afaGes; valB = b.afaGes; break;
      case 'progress': valA = a.progress; valB = b.progress; break;
      default: valA = a.stammdaten.name?.toLowerCase() || ''; valB = b.stammdaten.name?.toLowerCase() || '';
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (col) => {
    const scrollY = window.scrollY;
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  // Gesamtsummen (basierend auf gefilterter Liste)
  const totals = filtered.reduce((acc, i) => ({
    kp: acc.kp + i.kp,
    ak: acc.ak + i.ak,
    jm: acc.jm + i.jm,
    ek: acc.ek + i.ek,
    fk: acc.fk + i.fk,
    ann: acc.ann + i.ann,
    afaGes: acc.afaGes + i.afaGes,
    qm: acc.qm + i.wohnflaeche,
  }), { kp: 0, ak: 0, jm: 0, ek: 0, fk: 0, ann: 0, afaGes: 0, qm: 0 });

  const avgRendite = totals.kp > 0 ? totals.jm / totals.kp : 0;

  if (immobilien.length === 0) {
    return (
      <div className="mod">
        <div className="empty-dash">
          <div className="empty-dash-icon"><IconHome color="#6366f1" /></div>
          <h3>Willkommen bei ImmoHub</h3>
          <p>Erfasse deine erste Immobilie, um hier eine Gesamtübersicht deines Portfolios zu sehen.</p>
          <div className="empty-dash-features">
            <div className="edf-item"><IconChart color="#10b981" /><span>Rendite berechnen</span></div>
            <div className="edf-item"><IconSteuer color="#3b82f6" /><span>Steuereffekt analysieren</span></div>
            <div className="edf-item"><IconTrend color="#f59e0b" /><span>Liquidität planen</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mod">
      {/* Header mit Suche */}
      <div className="dash-header">
        <h2>Portfolio Übersicht</h2>
        <div className="dash-search">
          <span className="search-icon"><IconSearch color="var(--text-dim)" /></span>
          <input 
            type="text" 
            placeholder="Suchen nach Name, Adresse, Eigentümer..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
        <span className="dash-count">{filtered.length} von {immobilien.length}</span>
      </div>
      
      {/* Schnellfilter */}
      <div className="dash-filters">
        <button className={`dash-filter-btn ${filter === 'alle' ? 'active' : ''}`} onClick={() => onFilterChange('alle')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filter === 'alle' ? '#fff' : '#6366f1'} strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Alle
        </button>
        <button className={`dash-filter-btn ${filter === 'vermietet' ? 'active' : ''}`} onClick={() => onFilterChange('vermietet')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filter === 'vermietet' ? '#fff' : '#ec4899'} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Vermietet
        </button>
        <button className={`dash-filter-btn ${filter === 'eigengenutzt' ? 'active' : ''}`} onClick={() => onFilterChange('eigengenutzt')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filter === 'eigengenutzt' ? '#fff' : '#10b981'} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Eigengenutzt
        </button>
        <button className={`dash-filter-btn ${filter === 'zupruefen' ? 'active' : ''}`} onClick={() => onFilterChange('zupruefen')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filter === 'zupruefen' ? '#fff' : '#f59e0b'} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Zu prüfen
          {immoData.filter(i => i.importiert && i.zuPruefen?.length > 0).length > 0 && (
            <span className="filter-badge">{immoData.filter(i => i.importiert && i.zuPruefen?.length > 0).length}</span>
          )}
        </button>
      </div>
      
      <div className="dash-totals">
        {filter !== 'alle' && (
          <div className="filter-active-hint">
            Filter aktiv: {filter === 'vermietet' ? 'Vermietet' : filter === 'eigengenutzt' ? 'Eigengenutzt' : filter === 'zupruefen' ? 'Zu prüfen' : filter} ({filtered.length} Immobilien)
          </div>
        )}
        <div className="dash-total-card">
          <div className="dtc-icon"><IconKaufpreis color="#10b981" /></div>
          <div className="dtc-info">
            <span>Gesamtwert</span>
            <b>{fmt(totals.kp)}</b>
            <small>Ø {fmt(totals.kp / Math.max(filtered.length, 1))} / Immobilie</small>
          </div>
        </div>
        <div className={`dash-total-card ${filter === 'eigengenutzt' ? 'disabled' : ''}`}>
          <div className="dtc-icon"><IconMiete color={filter === 'eigengenutzt' ? 'var(--text-dim)' : '#ec4899'} /></div>
          <div className="dtc-info">
            <span>Jahres-Kaltmiete</span>
            <b className={filter === 'eigengenutzt' ? '' : 'pos'}>{filter === 'eigengenutzt' ? '—' : fmt(totals.jm)}</b>
            <small className="trend-info">{filter === 'eigengenutzt' ? 'Nicht relevant' : `${fmt(totals.jm / 12)} / Monat`}</small>
          </div>
        </div>
        <div className={`dash-total-card ${filter === 'eigengenutzt' ? 'disabled' : ''}`}>
          <div className="dtc-icon"><IconRendite color={filter === 'eigengenutzt' ? 'var(--text-dim)' : '#3b82f6'} /></div>
          <div className="dtc-info">
            <span>Ø Rendite</span>
            <b className={filter === 'eigengenutzt' ? '' : 'acc'}>{filter === 'eigengenutzt' ? '—' : fmtP(avgRendite)}</b>
            <small>{filter === 'eigengenutzt' ? 'Nicht relevant' : (avgRendite >= 0.05 ? '↑ Gute Rendite' : avgRendite >= 0.03 ? '→ Solide' : '↓ Unter 3%')}</small>
          </div>
        </div>
        <div className="dash-total-card">
          <div className="dtc-icon"><IconFinanz color="#6366f1" /></div>
          <div className="dtc-info">
            <span>Verbindlichkeiten</span>
            <b>{fmt(totals.fk)}</b>
            <small>EK-Quote: {totals.ak > 0 ? Math.round(totals.ek / totals.ak * 100) : 0}%</small>
          </div>
        </div>
        <div className="dash-total-card">
          <div className="dtc-icon"><IconAfa color="#f59e0b" /></div>
          <div className="dtc-info">
            <span>AfA Gesamt</span>
            <b>{fmt(totals.afaGes)}</b>
            <small>pro Jahr</small>
          </div>
        </div>
        <div className="dash-total-card">
          <div className="dtc-icon"><IconObjekt color="#8b5cf6" /></div>
          <div className="dtc-info">
            <span>Vermietete Fläche</span>
            <b>{totals.qm.toLocaleString('de-DE')} qm</b>
            <small>Ø {fmt(totals.kp / Math.max(totals.qm, 1))}/qm</small>
          </div>
        </div>
      </div>

      {/* Neue Dashboard Widgets */}
      <div className="dash-widgets">
        {/* Portfolio-Verteilung Kreisdiagramm */}
        <div className="dash-widget">
          <h3><span className="widget-icon"><IconChart color="#8b5cf6" /></span>Portfolio-Verteilung</h3>
          <div className="pie-chart-container">
            {(() => {
              const typCounts = {};
              const typValues = {};
              filtered.forEach(i => {
                const typ = i.stammdaten.typ || 'sonstig';
                typCounts[typ] = (typCounts[typ] || 0) + 1;
                typValues[typ] = (typValues[typ] || 0) + i.kp;
              });
              const types = Object.keys(typCounts);
              const total = types.reduce((a, t) => a + typValues[t], 0);
              let cumulativePercent = 0;
              
              const typLabels = { etw: 'ETW', mfh: 'MFH', efh: 'EFH', gewerbe: 'Gewerbe', grundstueck: 'Grundstück' };
              
              return (
                <>
                  <svg viewBox="0 0 100 100" className="pie-chart">
                    {types.map((typ, idx) => {
                      const percent = total > 0 ? (typValues[typ] / total) * 100 : 0;
                      const startAngle = cumulativePercent * 3.6;
                      cumulativePercent += percent;
                      const endAngle = cumulativePercent * 3.6;
                      
                      const startRad = (startAngle - 90) * Math.PI / 180;
                      const endRad = (endAngle - 90) * Math.PI / 180;
                      
                      const x1 = 50 + 40 * Math.cos(startRad);
                      const y1 = 50 + 40 * Math.sin(startRad);
                      const x2 = 50 + 40 * Math.cos(endRad);
                      const y2 = 50 + 40 * Math.sin(endRad);
                      
                      const largeArc = percent > 50 ? 1 : 0;
                      
                      if (percent === 0) return null;
                      if (percent >= 99.9) {
                        return <circle key={typ} cx="50" cy="50" r="40" fill={TYP_COLORS[typ]?.border || '#6366f1'} />;
                      }
                      
                      return (
                        <path
                          key={typ}
                          d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={TYP_COLORS[typ]?.border || '#6366f1'}
                        />
                      );
                    })}
                    <circle cx="50" cy="50" r="25" fill="var(--bg-card)" />
                    <text x="50" y="47" textAnchor="middle" className="pie-center-number">{filtered.length}</text>
                    <text x="50" y="58" textAnchor="middle" className="pie-center-label">Objekte</text>
                  </svg>
                  <div className="pie-legend">
                    {types.map(typ => (
                      <div key={typ} className="pie-legend-item">
                        <span className="pie-legend-dot" style={{ background: TYP_COLORS[typ]?.border || '#6366f1' }}></span>
                        <span className="pie-legend-label">{typLabels[typ] || typ}</span>
                        <span className="pie-legend-count">{typCounts[typ]}× ({total > 0 ? Math.round(typValues[typ] / total * 100) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Cashflow-Übersicht */}
        <div className="dash-widget">
          <h3><span className="widget-icon"><IconTrend color="#10b981" /></span>Cashflow-Übersicht</h3>
          <div className="cashflow-container">
            {(() => {
              // Berechne Darlehensraten aus allen Immobilien
              let gesamtDarlehensrate = 0;
              filtered.forEach(i => {
                const darlehen = i.darlehen || [];
                darlehen.forEach(d => {
                  if (d.monatsrate > 0) {
                    gesamtDarlehensrate += d.monatsrate;
                  } else if (d.betrag > 0 && d.zinssatz > 0) {
                    gesamtDarlehensrate += d.betrag * ((d.zinssatz + (d.tilgung || 0)) / 100) / 12;
                  }
                });
                // Fallback auf Legacy-Felder
                if (darlehen.length === 0 && i.fk > 0) {
                  const s = i.stammdaten;
                  gesamtDarlehensrate += i.fk * ((s.zinssatz + s.tilgung) / 100) / 12;
                }
              });
              
              const monatsMiete = totals.jm / 12;
              const netCashflow = monatsMiete - gesamtDarlehensrate;
              const isPositive = netCashflow >= 0;
              
              return (
                <>
                  <div className="cashflow-row income">
                    <span className="cf-label"><span className="cf-icon">↓</span>Mieteinnahmen</span>
                    <span className="cf-value pos">+{fmt(monatsMiete)}</span>
                  </div>
                  <div className="cashflow-row expense">
                    <span className="cf-label"><span className="cf-icon">↑</span>Darlehensraten</span>
                    <span className="cf-value neg">-{fmt(gesamtDarlehensrate)}</span>
                  </div>
                  <div className="cashflow-divider"></div>
                  <div className={`cashflow-row net ${isPositive ? 'positive' : 'negative'}`}>
                    <span className="cf-label"><strong>Netto-Cashflow</strong></span>
                    <span className={`cf-value ${isPositive ? 'pos' : 'neg'}`}>
                      <strong>{isPositive ? '+' : ''}{fmt(netCashflow)}</strong>
                    </span>
                  </div>
                  <div className="cashflow-bar">
                    <div className="cashflow-bar-track">
                      {monatsMiete > 0 && (
                        <>
                          <div className="cashflow-bar-income" style={{ width: '100%' }}></div>
                          <div className="cashflow-bar-expense" style={{ width: `${Math.min(gesamtDarlehensrate / monatsMiete * 100, 100)}%` }}></div>
                        </>
                      )}
                    </div>
                    <div className="cashflow-bar-labels">
                      <span>0 €</span>
                      <span>{fmt(monatsMiete)}</span>
                    </div>
                  </div>
                  <p className="cashflow-hint">pro Monat (ohne Nebenkosten & Rücklagen)</p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Standorte Karte mit Leaflet */}
        <div className="dash-widget dash-widget-map">
          <h3><span className="widget-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>Standorte</h3>
          <div className="locations-container">
            {(() => {
              // Sammle alle Adressen mit Koordinaten-Lookup
              const locations = filtered.map(i => {
                const adresse = i.stammdaten.adresse || '';
                // Extrahiere PLZ und Ort
                const plzMatch = adresse.match(/(\d{5})\s*([^,]+)/);
                const plz = plzMatch ? plzMatch[1] : '';
                const ort = plzMatch ? plzMatch[2].trim() : adresse.split(',').pop()?.trim() || '';
                
                return {
                  id: i.id,
                  name: i.stammdaten.name,
                  adresse: adresse,
                  ort: ort,
                  plz: plz,
                  typ: i.stammdaten.typ,
                  kp: i.kp
                };
              }).filter(l => l.ort);
              
              // Gruppiere nach Ort
              const byOrt = {};
              locations.forEach(l => {
                const key = l.ort.toLowerCase();
                if (!byOrt[key]) byOrt[key] = { ort: l.ort, plz: l.plz, immobilien: [] };
                byOrt[key].immobilien.push(l);
              });
              
              const orte = Object.values(byOrt);
              
              return (
                <div className="leaflet-map-container" id="immo-map">
                  <StandorteMap locations={orte} />
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Immobilien-Kacheln */}
      <div className="dash-cards">
        {sorted.map(i => (
          <div 
            key={i.id} 
            className={`dash-immo-card ${draggedId === i.id ? 'dragging' : ''} ${dragOverId === i.id ? 'drag-over' : ''}`}
            onClick={() => onSelectImmo(i)} 
            style={{ borderLeftColor: TYP_COLORS[i.stammdaten.typ]?.border }}
            draggable
            onDragStart={(e) => {
              setDraggedId(i.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggedId && draggedId !== i.id) {
                setDragOverId(i.id);
              }
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedId && draggedId !== i.id && onReorder) {
                onReorder(draggedId, i.id);
              }
              setDraggedId(null);
              setDragOverId(null);
            }}
          >
            <div className="dic-header">
              <span className="dic-type-tag" style={{ background: TYP_COLORS[i.stammdaten.typ]?.bg, borderColor: TYP_COLORS[i.stammdaten.typ]?.border, color: TYP_COLORS[i.stammdaten.typ]?.text }}>{getTypLabel(i.stammdaten.typ)}</span>
              <div className="dic-title">
                <strong>{i.stammdaten.name}</strong>
                <small>{i.stammdaten.adresse || 'Keine Adresse'}</small>
              </div>
            </div>
            {(i.importiert && i.zuPruefen?.length > 0) || i.zinsbindungWarning ? (
              <div className="dic-badges-row">
                {i.importiert && i.zuPruefen?.length > 0 && (
                  <span className="dic-check-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    {i.zuPruefen.length} prüfen
                  </span>
                )}
                {i.zinsbindungWarning && (
                  <span className="dic-warning-badge" title={`Zinsbindung läuft ${i.zinsbindungWarning.datum} aus`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    {i.zinsbindungWarning.datum}
                  </span>
                )}
                <div className="dic-progress-inline">
                  <div className="dic-progress-bar-inline">
                    <div className="dic-progress-fill-inline" style={{ width: `${i.progress}%` }}></div>
                  </div>
                  <span>{i.progress}%</span>
                </div>
              </div>
            ) : (
              <div className="dic-progress-row">
                <div className="dic-progress-inline">
                  <div className="dic-progress-bar-inline">
                    <div className="dic-progress-fill-inline" style={{ width: `${i.progress}%` }}></div>
                  </div>
                  <span>{i.progress}%</span>
                </div>
              </div>
            )}
            <div className="dic-stats">
              <div className="dic-stat">
                <span>Kaufpreis</span>
                <b>{fmt(i.kp)}</b>
              </div>
              <div className="dic-stat">
                <span>Miete/Mon.</span>
                <b className="pos">{fmt(i.mm)}</b>
              </div>
              <div className="dic-stat">
                <span>Rendite</span>
                <b className="acc">{fmtP(i.rendite)}</b>
              </div>
              <div className="dic-stat">
                <span>AfA/Jahr</span>
                <b>{fmt(i.afaGes)}</b>
              </div>
            </div>
            <div className="dic-bar">
              <div className="dic-bar-label"><span>EK</span><span>FK</span></div>
              <div className="dic-bar-track">
                <div className="dic-bar-ek" style={{ width: `${i.stammdaten.eigenkapitalAnteil}%` }}></div>
              </div>
              <div className="dic-bar-vals"><span>{fmt(i.ek)}</span><span>{fmt(i.fk)}</span></div>
            </div>
            <div className="dic-click-hint">Klicken für Details →</div>
          </div>
        ))}
      </div>

      {/* Immobilien-Tabelle mit sortierbaren Spalten */}
      <div className="dash-widget dash-widget-full">
        <h3><span className="widget-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>Immobilien</h3>
        <div className="dash-table-inner">
          <table className="dash-table">
            <thead>
              <tr>
                <th className={`sortable ${sortBy === 'name' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('name'); }}>
                  Immobilie {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th>Typ</th>
                <th>Fläche</th>
                <th className={`sortable ${sortBy === 'kp' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('kp'); }}>
                  Kaufpreis {sortBy === 'kp' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={`sortable ${sortBy === 'jm' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('jm'); }}>
                  Miete/Jahr {sortBy === 'jm' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={`sortable ${sortBy === 'rendite' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('rendite'); }}>
                  Rendite {sortBy === 'rendite' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={`sortable ${sortBy === 'afaGes' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('afaGes'); }}>
                  AfA/Jahr {sortBy === 'afaGes' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={`sortable ${sortBy === 'progress' ? 'sorted' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSort('progress'); }}>
                  Vollst. {sortBy === 'progress' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(i => (
              <tr key={i.id} onClick={() => onSelectImmo(i)} className="dash-row-click">
                <td className="dash-name">
                  <strong>{i.stammdaten.name}</strong>
                  <small>{i.stammdaten.adresse || '–'}</small>
                </td>
                <td><span className="dash-tag" style={{ background: TYP_COLORS[i.stammdaten.typ]?.bg, borderColor: TYP_COLORS[i.stammdaten.typ]?.border, color: TYP_COLORS[i.stammdaten.typ]?.text }}>{getTypLabel(i.stammdaten.typ)}</span></td>
                <td>{i.wohnflaeche} qm</td>
                <td>{fmt(i.kp)}</td>
                <td className="pos">{fmt(i.jm)}</td>
                <td className="acc">{fmtP(i.rendite)}</td>
                <td>{fmt(i.afaGes)}</td>
                <td>
                  <div className="progress-cell">
                    <div className="progress-bar-mini">
                      <div className="progress-fill" style={{ width: `${i.progress}%` }}></div>
                    </div>
                    <span>{i.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Gesamt ({filtered.length})</strong></td>
              <td></td>
              <td><strong>{totals.qm} qm</strong></td>
              <td><strong>{fmt(totals.kp)}</strong></td>
              <td className="pos"><strong>{fmt(totals.jm)}</strong></td>
              <td className="acc"><strong>{fmtP(avgRendite)}</strong></td>
              <td><strong>{fmt(totals.afaGes)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
};

// Onboarding Tour
const OnboardingTour = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  
  const steps = [
    {
      title: "Willkommen bei ImmoHub! 🏠",
      content: "Dein persönliches Tool für die Verwaltung deines Immobilien-Portfolios. In dieser kurzen Tour zeige ich dir die wichtigsten Funktionen.",
      icon: <IconHome color="#6366f1" />
    },
    {
      title: "Portfolio-Übersicht 📊",
      content: "Im Dashboard siehst du alle deine Immobilien auf einen Blick: Gesamtwert, Rendite, Cashflow und mehr. Die Widgets zeigen dir Verteilung und Standorte.",
      icon: <IconDashboard color="#10b981" />
    },
    {
      title: "Immobilie anlegen ➕",
      content: "Klicke auf 'Alle' und dann '+ Neue Immobilie'. Du kannst Daten manuell eingeben oder direkt aus Dokumenten (Exposé, Kaufvertrag) importieren lassen.",
      icon: <IconObjekt color="#3b82f6" />
    },
    {
      title: "Dokument-Import 📄",
      content: "Lade PDFs oder Fotos von Verträgen hoch – die KI extrahiert automatisch alle relevanten Daten wie Kaufpreis, Fläche, Miete und Darlehenskonditionen.",
      icon: <IconUpload color="#f59e0b" />
    },
    {
      title: "Rendite & Steuer 💰",
      content: "Für jede Immobilie berechnet ImmoHub automatisch Rendite, AfA und Steuereffekte. Im Steuer-Tab siehst du die Auswirkung auf deine Steuerlast.",
      icon: <IconRendite color="#ec4899" />
    },
    {
      title: "Beteiligte verwalten 👥",
      content: "Hast du Immobilien mit Partnern? Unter 'Beteiligte' kannst du Personen anlegen und deren Anteile pro Immobilie hinterlegen.",
      icon: <IconPerson color="#8b5cf6" />
    },
    {
      title: "Fertig! 🎉",
      content: "Du bist startklar! Alle Daten werden lokal in deinem Browser gespeichert. Nutze 'Daten verwalten' für Backup/Export.",
      icon: <IconCheck color="#22c55e" />
    }
  ];
  
  const currentStep = steps[step];
  const isLast = step === steps.length - 1;
  
  return (
    <div className="modal-bg" onClick={onComplete}>
      <div className="onboarding-modal" onClick={e => e.stopPropagation()}>
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <div key={i} className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}></div>
          ))}
        </div>
        
        <div className="onboarding-icon">{currentStep.icon}</div>
        <h2>{currentStep.title}</h2>
        <p>{currentStep.content}</p>
        
        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn-sec" onClick={() => setStep(s => s - 1)}>← Zurück</button>
          )}
          {isLast ? (
            <button className="btn-pri" onClick={onComplete}>Los geht's!</button>
          ) : (
            <button className="btn-pri" onClick={() => setStep(s => s + 1)}>Weiter →</button>
          )}
        </div>
        
        <button className="onboarding-skip" onClick={onComplete}>Überspringen</button>
      </div>
    </div>
  );
};

// Haupt-App (Core ohne Auth)
function ImmoHubCore({ initialData, initialBeteiligte, onDataChange, UserMenuComponent, CloudStatusComponent }) {
  const [saved, setSaved] = useState(initialData || []);
  const [curr, setCurr] = useState(null);
  const [tab, setTab] = useState('dash');
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [beteiligteModal, setBeteiligteModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('immoOnboardingDone');
  });
  const [beteiligte, setBeteiligte] = useState(initialBeteiligte || []);
  const [aktiveBeteiligte, setAktiveBeteiligte] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('immoTheme') || 'dark');
  const [history, setHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);
  const [showAutoSaved, setShowAutoSaved] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [dashFilter, setDashFilter] = useState('alle');

  // Sync data to parent when changed
  useEffect(() => {
    if (onDataChange) {
      onDataChange(saved, beteiligte);
    }
  }, [saved, beteiligte]);

  // Update from parent
  useEffect(() => {
    if (initialData && JSON.stringify(initialData) !== JSON.stringify(saved)) {
      setSaved(initialData);
    }
  }, [initialData]);

  // Toast automatisch ausblenden
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type, message) => setToast({ type, message });

  const completeOnboarding = () => {
    localStorage.setItem('immoOnboardingDone', 'true');
    setShowOnboarding(false);
  };

  // Theme persistieren
  useEffect(() => { 
    localStorage.setItem('immoTheme', theme);
    document.body.className = theme;
  }, [theme]);

  // Validierung
  const validateField = (field, value, stammdaten) => {
    const errors = {};
    
    // Pflichtfelder
    if (field === 'name' && (!value || value.trim() === '')) {
      errors.name = 'Name ist erforderlich';
    }
    
    // Numerische Felder - keine negativen Werte
    const numericFields = ['kaufpreisImmobilie', 'kaufpreisStellplatz', 'wohnflaeche', 'mieteProQm', 
      'grundstueckGroesse', 'bodenrichtwert', 'eigenkapitalAnteil', 'zinssatz', 'tilgung', 
      'steuersatz', 'notarkosten', 'grunderwerbsteuer', 'maklerProvision'];
    
    if (numericFields.includes(field) && value < 0) {
      errors[field] = 'Keine negativen Werte erlaubt';
    }
    
    // Prozentfelder 0-100
    const percentFields = ['eigenkapitalAnteil', 'steuersatz'];
    if (percentFields.includes(field) && (value < 0 || value > 100)) {
      errors[field] = 'Wert muss zwischen 0 und 100 liegen';
    }
    
    // AfA-Satz
    if (field === 'afaSatz' && (value < 0 || value > 10)) {
      errors[field] = 'AfA-Satz muss zwischen 0 und 10 liegen';
    }
    
    // Zinssatz und Tilgung
    if ((field === 'zinssatz' || field === 'tilgung') && (value < 0 || value > 20)) {
      errors[field] = 'Wert muss zwischen 0 und 20 liegen';
    }
    
    return errors;
  };

  const validate = (stammdaten) => {
    let allErrors = {};
    Object.entries(stammdaten).forEach(([key, value]) => {
      const fieldErrors = validateField(key, value, stammdaten);
      allErrors = { ...allErrors, ...fieldErrors };
    });
    return allErrors;
  };

  const isSaved = curr?.saved === true;
  const c = useCalc(curr?.stammdaten);

  const onNew = () => { 
    setCurr(createEmpty()); 
    setTab('stamm'); 
    setModal(false); 
    setHistory([]);
    setRedoHistory([]);
    setValidationErrors({});
  };
  
  const onSelect = i => { 
    setCurr({ ...i }); 
    setTab('stamm'); 
    setModal(false); 
    setHistory([]);
    setRedoHistory([]);
    setValidationErrors({});
  };
  
  const onSave = () => {
    if (!curr?.stammdaten?.name) return;
    const errors = validate(curr.stammdaten);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      showToast('error', 'Bitte Fehler korrigieren');
      return;
    }
    const toSave = { ...curr, saved: true };
    const exists = saved.find(x => x.id === curr.id);
    setSaved(exists ? saved.map(x => x.id === toSave.id ? toSave : x) : [...saved, toSave]);
    setCurr(toSave);
    setValidationErrors({});
    showToast('success', 'Erfolgreich gespeichert ✓');
  };
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  const onDel = id => {
    setDeleteConfirm(id);
  };
  
  const confirmDelete = () => {
    if (deleteConfirm) {
      setSaved(saved.filter(x => x.id !== deleteConfirm));
      if (curr?.id === deleteConfirm) setCurr(null);
      setDeleteConfirm(null);
      setModal(false);
    }
  };
  
  // Update mit History für Undo
  const onUpd = p => {
    // History speichern (max 20 Schritte)
    setHistory(prev => [...prev.slice(-19), curr]);
    // Redo-History leeren bei neuer Änderung
    setRedoHistory([]);
    
    setCurr(p);
    
    // Validierung bei Änderung
    const errors = validate(p.stammdaten);
    setValidationErrors(errors);
    
    // Auto-Save für gespeicherte Immobilien (mit Debounce)
    if (p.saved) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        const validationErrors = validate(p.stammdaten);
        if (Object.keys(validationErrors).length === 0) {
          setSaved(saved.map(x => x.id === p.id ? p : x));
          setShowAutoSaved(true);
          setTimeout(() => setShowAutoSaved(false), 2000);
        }
      }, 1500);
      setAutoSaveTimer(timer);
    }
  };
  
  // Undo Funktion
  const onUndo = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(history.slice(0, -1));
      // Aktuellen State in Redo-History speichern
      setRedoHistory(prevRedo => [...prevRedo, curr]);
      setCurr(prev);
    }
  };
  
  // Redo Funktion
  const onRedo = () => {
    if (redoHistory.length > 0) {
      const next = redoHistory[redoHistory.length - 1];
      setRedoHistory(redoHistory.slice(0, -1));
      // Aktuellen State in Undo-History speichern
      setHistory(prev => [...prev, curr]);
      setCurr(next);
    }
  };
  
  const onImport = (newImmoOrArray) => {
    // Wenn Array von Immobilien (Multi-Import)
    if (Array.isArray(newImmoOrArray)) {
      const newImmobilien = newImmoOrArray.map(immo => ({
        ...immo,
        id: immo.id || Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        saved: false
      }));
      
      // Alle direkt zu saved hinzufügen (mit importiert-Flag)
      const updatedSaved = [...saved, ...newImmobilien.map(immo => ({
        ...immo,
        saved: true
      }))];
      setSaved(updatedSaved);
      save(updatedSaved);
      
      // Erste importierte Immobilie zur Bearbeitung öffnen
      if (newImmobilien.length > 0) {
        setCurr(newImmobilien[0]);
        setTab('stamm');
      }
      setImportModal(false);
      setHistory([]);
      setRedoHistory([]);
    } else {
      // Einzelne Immobilie (wie bisher)
      setCurr(newImmoOrArray);
      setTab('stamm');
      setImportModal(false);
      setHistory([]);
      setRedoHistory([]);
    }
  };

  // Theme Toggle
  const toggleTheme = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  };

  const themeVars = theme === 'dark' ? {
    '--bg-app': '#09090b',
    '--bg-card': '#18181b',
    '--bg-input': '#27272a',
    '--border': '#27272a',
    '--border-hover': '#3f3f46',
    '--text': '#fafafa',
    '--text-muted': '#a1a1aa',
    '--text-dim': '#71717a',
  } : {
    '--bg-app': '#f4f4f5',
    '--bg-card': '#ffffff',
    '--bg-input': '#f4f4f5',
    '--border': '#e4e4e7',
    '--border-hover': '#d4d4d8',
    '--text': '#18181b',
    '--text-muted': '#52525b',
    '--text-dim': '#71717a',
  };

  return (
    <div className={`app ${theme}`} style={themeVars}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        
        /* Theme Variables */
        .app{font-family:'Inter',sans-serif;min-height:100vh;transition:background 0.3s,color 0.3s}
        .app.dark{background:var(--bg-app,#09090b);color:var(--text,#fafafa)}
        .app.light{background:var(--bg-app,#f4f4f5);color:var(--text,#18181b)}
        
        .hdr{background:var(--bg-card);border-bottom:1px solid var(--border);padding:10px 20px;position:sticky;top:0;z-index:100}
        .hdr-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:16px}
        .logo{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700}
        .logo-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center}
        .logo-text{display:flex}
        .logo-immo{color:var(--text)}
        .logo-hub{color:#6366f1}
        .hdr-acts{margin-left:auto;display:flex;gap:8px;align-items:center}
        .hdr-btn{padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px}
        .hdr-btn:hover{background:var(--border-hover);color:var(--text)}
        .hdr-btn.pri{background:#3b82f6;border-color:#3b82f6;color:#fff}
        .hdr-btn.pri:hover{background:#2563eb}
        .hdr-btn:disabled{opacity:.5;cursor:not-allowed}
        
        .theme-toggle{width:36px;height:36px;border-radius:50%;background:var(--bg-input);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s}
        .theme-toggle:hover{background:var(--border-hover);border-color:#6366f1}
        .theme-toggle-icon{width:18px;height:18px}
        
        .auto-save-indicator{position:fixed;bottom:20px;right:20px;padding:10px 16px;background:#10b981;color:#fff;border-radius:8px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
        .auto-save-indicator .icon{width:16px;height:16px}
        @keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        
        .undo-redo-group{display:flex;gap:2px}
        .undo-btn{padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px}
        .undo-redo-group .undo-btn:first-child{border-radius:6px 0 0 6px}
        .undo-redo-group .undo-btn:last-child{border-radius:0 6px 6px 0;border-left:none}
        .undo-btn:hover:not(:disabled){background:var(--border-hover);color:var(--text)}
        .undo-btn:disabled{opacity:0.3;cursor:not-allowed}
        .undo-icon{width:14px;height:14px}
        
        .validation-error{color:#ef4444;font-size:10px;margin-top:4px}
        .input-error{border-color:#ef4444 !important;background:rgba(239,68,68,0.1) !important}
        
        .nav{background:var(--bg-card);border-bottom:1px solid var(--border);padding:0 20px;position:sticky;top:56px;z-index:90}
        .nav-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:8px}
        .nav-tab-btn{display:flex;align-items:center;gap:6px;padding:12px 14px;background:none;border:none;color:var(--text-dim);font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
        .nav-tab-btn:hover{color:var(--text-muted)}
        .nav-tab-btn.act{color:var(--text);border-color:#6366f1;background:rgba(99,102,241,0.1)}
        .nav-divider{width:1px;height:24px;background:var(--border)}
        .nav-immo-select{display:flex;align-items:center;gap:6px;padding:8px 0}
        .sel-btn{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer;min-width:160px;max-width:220px}
        .sel-btn:hover{background:var(--border-hover)}
        .sel-btn.draft{border-color:#f59e0b;background:rgba(245,158,11,0.1)}
        .sel-icon{width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sel-text{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sel-arrow{color:var(--text-dim);font-size:10px;flex-shrink:0}
        .draft-tag{font-size:8px;padding:2px 5px;background:#f59e0b;color:#000;border-radius:3px;font-weight:600;flex-shrink:0}
        .nav-new-btn{width:32px;height:32px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-muted);font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .nav-new-btn:hover{background:var(--border-hover);color:var(--text)}
        .nav-tabs{display:flex;gap:2px;margin-left:4px}
        .nav-tabs button{display:flex;align-items:center;gap:6px;padding:12px 12px;background:none;border:none;color:var(--text-dim);font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
        .nav-tabs button:hover{color:var(--text-muted)}
        .nav-tabs button.act{color:var(--text);border-color:#6366f1;background:rgba(99,102,241,0.1)}
        .nav-tabs button:disabled{opacity:.4;cursor:not-allowed}
        .nav-icon{width:18px;height:18px;display:flex;align-items:center;justify-content:center}
        .main{max-width:1200px;margin:0 auto;padding:20px}
        .mod{animation:fi .2s}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        
        .draft-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;margin-bottom:14px;font-size:13px}
        .draft-bar span{margin-right:8px}
        .draft-bar strong{color:#f59e0b}
        .draft-bar-actions{display:flex;align-items:center;gap:12px}
        .draft-bar button{padding:6px 14px;background:#f59e0b;border:none;border-radius:5px;color:#000;font-weight:600;font-size:12px;cursor:pointer}
        .draft-bar button:disabled{opacity:.5;cursor:not-allowed}
        .draft-close{width:28px;height:28px;padding:0!important;background:transparent!important;border:1px solid rgba(245,158,11,0.5)!important;border-radius:4px!important;color:#f59e0b!important;font-size:18px!important;font-weight:400!important;display:flex;align-items:center;justify-content:center}
        .draft-close:hover{background:rgba(245,158,11,0.2)!important;border-color:#f59e0b!important}
        
        .kpi-bar{display:flex;gap:12px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;margin-bottom:14px;overflow-x:auto}
        .kpi{display:flex;flex-direction:column;gap:2px;white-space:nowrap}
        .kpi span{font-size:10px;color:var(--text-dim)}
        .kpi b{font-family:'JetBrains Mono',monospace;font-size:13px}
        .kpi b.pos{color:#22c55e}
        .kpi b.acc{color:#3b82f6}
        
        .accs{display:flex;flex-direction:column;gap:6px}
        
        /* Sekundäre Akkordeon-Sektion */
        .accs-secondary{margin-top:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden}
        .accs-secondary-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--bg-input);cursor:pointer;transition:all 0.15s;user-select:none}
        .accs-secondary-header:hover{background:var(--border-hover)}
        .accs-secondary-header.expanded{border-bottom:1px solid var(--border)}
        .accs-secondary-icon{width:20px;height:20px;opacity:0.6;display:inline-flex;align-items:center}
        .accs-secondary-icon svg{width:20px;height:20px}
        .accs-secondary-title{flex:1;font-size:13px;font-weight:500;color:var(--text-muted)}
        .accs-secondary-toggle{width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:14px}
        .accs-secondary-content{padding:10px;display:flex;flex-direction:column;gap:6px}
        .acc{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
        .acc.open{border-color:var(--c)}
        .acc-h{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
        .acc-h:hover{background:var(--bg-input)}
        .acc-i{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);overflow:hidden}
        .acc-i svg{width:20px;height:20px}
        .app.light .acc-i{background:rgba(0,0,0,0.03);border-color:rgba(0,0,0,0.06)}
        .acc.open .acc-i{background:rgba(255,255,255,0.05);border-color:var(--c)}
        .app.light .acc.open .acc-i{background:rgba(99,102,241,0.1)}
        .acc-info{flex:1;min-width:0}
        .acc-t{font-size:13px;font-weight:600}
        .acc-s{font-size:11px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'JetBrains Mono',monospace}
        .acc-tog{width:20px;color:var(--text-dim);font-size:16px}
        .acc-import-btn{display:flex;align-items:center;gap:6px;padding:4px 10px;background:transparent;border:1px solid var(--c);border-radius:4px;color:var(--c);font-size:11px;cursor:pointer;margin-right:12px;white-space:nowrap}
        .acc-import-btn:hover{background:rgba(99,102,241,0.1)}
        .acc-import-btn svg{flex-shrink:0}
        .acc.disabled{opacity:0.5}
        .acc.disabled .acc-h{cursor:not-allowed}
        .acc.disabled .acc-h:hover{background:transparent}
        .acc-body{padding:0 14px 14px;border-top:1px solid var(--border);animation:sd .2s}
        .acc-body>svg,.acc-body .nk-section>svg{max-width:48px;max-height:48px}
        @keyframes sd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        
        .irow{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:12px}
        .irow:last-child{border-bottom:none}
        .irow label{font-size:12px;color:var(--text-muted);flex-shrink:0;min-width:100px}
        .ifld-wrap{display:flex;flex-direction:column;gap:2px;flex:1}
        .ifld{display:flex;align-items:center;gap:5px;flex:1}
        .ifld.input-error input,.ifld.input-error select{border-color:#ef4444;background:rgba(239,68,68,0.1)}
        .validation-error{color:#ef4444;font-size:10px}
        .validation-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;margin-bottom:14px;font-size:13px;color:#ef4444}
        .validation-banner-icon{width:20px;height:20px;display:flex;align-items:center}
        .validation-banner-icon svg{width:20px;height:20px}
        .ifld input,.ifld select{width:110px;padding:7px 9px;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;text-align:right}
        .ifld input[type="text"]{flex:1;min-width:200px;width:100%;text-align:left;font-family:'Inter',sans-serif}
        
        /* DateInput Component */
        .date-input-wrapper{display:flex;align-items:center;flex:1;position:relative}
        .date-input-text{flex:1;min-width:100px;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px 0 0 6px;color:var(--text);font-size:13px;font-family:'JetBrains Mono',monospace}
        .date-input-text:focus{outline:none;border-color:#6366f1}
        .date-calendar-btn{padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-left:none;border-radius:0 6px 6px 0;color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
        .date-calendar-btn:hover{background:rgba(99,102,241,0.1);color:#6366f1}
        .date-calendar-btn svg{position:relative;z-index:1;pointer-events:none}
        .date-input-native{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer}
        .ifld .date-input-wrapper{width:100%}
        .ifld .date-input-text{border-radius:6px 0 0 6px}
        
        /* Erinnerung Datum mit DateInput */
        .erinnerung-datum{flex-shrink:0}
        .erinnerung-datum .date-input-wrapper{width:auto}
        .erinnerung-datum .date-input-text{width:100px;min-width:100px;font-size:12px;padding:6px 8px}
        .erinnerung-datum .date-calendar-btn{padding:6px 8px}
        
        /* Mieter/Miethistorie Datum mit DateInput */
        .mhist-date-field .date-input-wrapper{width:100%}
        .mhist-date-field .date-input-text{font-size:12px;padding:6px 8px}
        .mhist-date-field .date-calendar-btn{padding:6px 8px}
        .mieter-form-row .date-input-wrapper{width:100%}
        .mieter-form-row .date-input-text{padding:8px 10px;font-size:12px}
        
        /* Darlehen Datum mit DateInput */
        .darlehen-field .date-input-wrapper{width:100%}
        .darlehen-field .date-input-text{font-size:12px;padding:6px 8px}
        .ifld input:focus,.ifld select:focus{outline:none;border-color:#3b82f6}
        .ifld .suf{font-size:11px;color:var(--text-dim);min-width:20px;flex-shrink:0}
        
        .res{display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:var(--text-muted)}
        .res span:last-child{font-family:'JetBrains Mono',monospace}
        .res.hl{color:var(--text);font-weight:500;padding-top:10px;margin-top:4px;border-top:1px solid var(--border-hover)}
        hr{border:none;height:1px;background:var(--border);margin:10px 0}
        .hint{font-size:11px;color:var(--text-dim);margin:10px 0}
        .hint-small{font-size:10px;color:var(--text-dim);margin:-6px 0 10px 0;font-style:italic}
        .foerderung-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .field-row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .field-with-btn{display:flex;gap:6px;align-items:flex-end}
        .field-with-btn .field{flex:1}
        .auto-gen-btn{display:flex;align-items:center;justify-content:center;padding:6px 8px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--text-dim);font-size:10px;cursor:pointer;white-space:nowrap;margin-bottom:10px;height:34px;opacity:0.6;transition:all 0.15s}
        .auto-gen-btn:hover{opacity:1;color:#6366f1;border-color:#6366f1}
        .btn-reset-section{display:flex;align-items:center;gap:6px;padding:6px 10px;background:transparent;border:none;color:var(--text-dim);font-size:10px;cursor:pointer;opacity:0.5;transition:all 0.15s;margin-top:4px}
        .btn-reset-section:hover{opacity:1;color:#ef4444}
        .reset-confirm-modal{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:360px;text-align:center}
        .reset-confirm-icon{width:48px;height:48px;margin:0 auto 16px;background:rgba(239,68,68,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center}
        .reset-confirm-modal h3{font-size:16px;color:var(--text);margin:0 0 8px}
        .reset-confirm-modal p{font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5}
        .reset-confirm-buttons{display:flex;gap:10px;justify-content:center}
        .reset-confirm-buttons .btn-cancel{padding:8px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;cursor:pointer}
        .reset-confirm-buttons .btn-cancel:hover{background:var(--border-hover)}
        .reset-confirm-buttons .btn-reset{padding:8px 16px;background:#ef4444;border:none;border-radius:6px;color:#fff;font-size:13px;cursor:pointer}
        .reset-confirm-buttons .btn-reset:hover{background:#dc2626}
        
        .sa-row,.wk-row{display:flex;gap:6px;align-items:center;margin-bottom:6px}
        .sa-row input,.wk-row input{padding:7px 9px;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px}
        .sa-row input:first-child,.wk-row input:first-child{flex:2}
        .sa-row input:nth-child(2),.wk-row input:nth-child(2){flex:1;font-family:'JetBrains Mono',monospace;text-align:right}
        .sa-row button,.wk-row button{width:26px;height:26px;border:none;background:#7f1d1d;color:#fca5a5;border-radius:5px;cursor:pointer;font-size:14px}
        .btn-add{width:100%;padding:9px;background:transparent;border:1px dashed var(--border);border-radius:5px;color:var(--text-dim);font-size:11px;cursor:pointer;margin-top:6px}
        .btn-add:hover{border-color:#3b82f6;color:#3b82f6}
        
        .btn-import-inline{width:100%;padding:12px;background:rgba(99,102,241,0.1);border:1px dashed #6366f1;border-radius:8px;color:#6366f1;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s;margin-top:8px}
        .btn-import-inline:hover{background:rgba(99,102,241,0.2);border-style:solid}
        
        .field-group-label{font-size:11px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 8px}
        .miet-datum-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px}
        .miet-datum-field{display:flex;flex-direction:column;gap:6px}
        .miet-datum-field label{font-size:12px;color:var(--text-dim)}
        .miet-datum-field .date-input-wrapper{width:100%}
        .miet-datum-field .date-input-text{width:100%;min-width:0}
        .gesamtmiete-row{background:rgba(236,72,153,0.08);border:1px dashed rgba(236,72,153,0.3);margin-top:8px}
        .gesamtmiete-row span:last-child{color:#ec4899;font-weight:600}
        .mietstatus-checkboxes{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:10px 0}
        .mietstatus-option{display:flex;align-items:center;gap:8px;cursor:pointer}
        .mietstatus-option input[type="radio"],.mietstatus-option input[type="checkbox"]{width:16px;height:16px;accent-color:#ec4899;cursor:pointer}
        .mietstatus-option input[type="checkbox"]{border-radius:50%;-webkit-appearance:none;appearance:none;border:2px solid var(--border);background:transparent}
        .mietstatus-option input[type="checkbox"]:checked{background:#ec4899;border-color:#ec4899}
        .mietstatus-label{font-size:13px;color:var(--text)}
        .btn-archive-mieter{display:flex;align-items:center;gap:6px;padding:6px 12px;background:transparent;border:1px solid #ec4899;border-radius:6px;color:#ec4899;font-size:11px;cursor:pointer;margin-left:auto}
        .btn-archive-mieter:hover:not(:disabled){background:rgba(236,72,153,0.1)}
        .btn-archive-mieter:disabled{opacity:0.4;cursor:not-allowed}
        .btn-archive-mieter svg{width:14px;height:14px}
        .archive-confirm{margin:12px 0;padding:16px;background:rgba(236,72,153,0.08);border:1px solid rgba(236,72,153,0.3);border-radius:8px}
        .archive-confirm-content p{margin:0 0 8px;font-size:13px;color:var(--text)}
        .archive-confirm-content p:first-child{margin-bottom:12px}
        .archive-preview-list{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
        .archive-preview{font-family:'JetBrains Mono',monospace;font-size:12px;color:#ec4899;background:var(--bg-card);padding:4px 8px;border-radius:4px;display:inline-block}
        .archive-confirm-buttons{display:flex;gap:10px;margin-top:16px}
        .archive-confirm-buttons .btn-confirm{padding:8px 16px;background:#ec4899;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:500;cursor:pointer}
        .archive-confirm-buttons .btn-confirm:hover{background:#db2777}
        .archive-confirm-buttons .btn-confirm.btn-warning{background:#f59e0b}
        .archive-confirm-buttons .btn-confirm.btn-warning:hover{background:#d97706}
        .archive-confirm-buttons .btn-cancel{padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer}
        .archive-confirm-buttons .btn-cancel:hover{background:var(--bg-input)}
        .archive-overlap-warning{display:flex;gap:12px;padding:12px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:6px;margin:12px 0}
        .archive-overlap-warning .warning-icon{font-size:20px}
        .archive-overlap-warning strong{color:#f59e0b;display:block;margin-bottom:4px}
        .archive-overlap-warning p{margin:0;font-size:12px;color:var(--text)}
        .archive-overlap-warning .overlap-details{font-family:'JetBrains Mono',monospace;color:#f59e0b;margin-top:6px}
        
        .save-bottom{margin-top:20px;padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;text-align:center}
        .save-bottom-main button{padding:12px 28px;background:#22c55e;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
        .save-bottom-main button:disabled{background:var(--border-hover);color:var(--text-dim);cursor:not-allowed}
        .save-bottom-main p{margin-top:8px;font-size:11px;color:var(--text-dim)}
        .save-bottom-divider{display:flex;align-items:center;gap:12px;margin:16px 0;color:var(--text-dim);font-size:12px}
        .save-bottom-divider::before,.save-bottom-divider::after{content:'';flex:1;height:1px;background:var(--border)}
        .btn-import-bottom{padding:10px 20px;background:transparent;border:1px solid #6366f1;border-radius:6px;color:#6366f1;font-weight:500;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
        .btn-import-bottom:hover{background:rgba(99,102,241,0.1)}
        .import-hint{margin-top:8px;font-size:11px;color:var(--text-dim)}
        
        /* Toast Notifications */
        .toast{position:fixed;top:20px;right:20px;display:flex;align-items:center;gap:10px;padding:14px 20px;border-radius:10px;font-size:13px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:2000;animation:toastIn 0.3s ease}
        @keyframes toastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        .toast-success{background:#22c55e;color:#fff}
        .toast-warning{background:#f59e0b;color:#fff}
        .toast-error{background:#ef4444;color:#fff}
        .toast-icon{display:flex;align-items:center;justify-content:center;width:20px;height:20px;background:rgba(255,255,255,0.2);border-radius:50%;padding:4px}
        .toast-icon svg{width:14px;height:14px}
        .toast-message{flex:1}
        
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}
        .modal{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;width:100%;max-width:440px;max-height:80vh;display:flex;flex-direction:column;animation:mi .2s}
        @keyframes mi{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        .modal-h{display:flex;align-items:center;justify-content:space-between;padding:18px;border-bottom:1px solid var(--border)}
        .modal-h h2{display:flex;align-items:center;gap:10px;font-size:16px}
        .modal-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center}
        .modal-icon svg{width:28px;height:28px}
        .modal-h button{width:30px;height:30px;border:none;background:var(--bg-input);color:var(--text-muted);border-radius:6px;font-size:18px;cursor:pointer}
        .modal-b{padding:16px;overflow-y:auto;flex:1}
        .modal-f{padding:14px 18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
        .modal-f2{display:flex;justify-content:center;padding:0 18px 14px}
        .btn-data{width:100%;padding:10px;background:transparent;border:1px dashed var(--border);border-radius:6px;color:var(--text-dim);font-size:12px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-data:hover{border-color:#6366f1;color:#6366f1;background:rgba(99,102,241,0.05)}
        
        .data-modal-bg{z-index:1001}
        .data-modal{max-width:400px}
        .data-section{padding:16px 0}
        .data-section h3{font-size:14px;margin-bottom:8px}
        .data-section p{font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5}
        .data-divider{display:flex;align-items:center;gap:12px;color:var(--text-dim);font-size:11px;margin:8px 0}
        .data-divider::before,.data-divider::after{content:'';flex:1;height:1px;background:var(--border)}
        
        .btn-export-data{width:100%;padding:12px;background:#10b981;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-export-data:hover{background:#059669}
        .btn-import-data{width:100%;padding:12px;background:#3b82f6;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-import-data:hover{background:#2563eb}
        
        .file-input-json{width:100%;padding:12px;background:var(--bg-input);border:1px dashed var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer;margin-bottom:12px}
        .file-input-json::-webkit-file-upload-button{background:var(--border-hover);border:none;padding:6px 12px;border-radius:4px;color:var(--text);cursor:pointer;margin-right:10px}
        
        .import-preview{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:6px;margin-bottom:12px}
        .import-preview span{color:#10b981;font-weight:500}
        .import-preview small{color:var(--text-dim)}
        
        .import-error{padding:10px 12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:6px;color:#ef4444;font-size:12px;margin-bottom:12px}
        .import-success{padding:10px 12px;background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:6px;color:#10b981;font-size:12px;margin-bottom:12px}
        
        .import-actions-data{display:flex;gap:10px;margin-top:12px}
        .btn-do-import{flex:1;padding:12px;background:#f59e0b;border:none;border-radius:6px;color:#000;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-do-import:hover{background:#d97706}
        .btn-do-import:disabled{opacity:0.5;cursor:not-allowed}
        .btn-pri{width:100%;padding:11px;background:#3b82f6;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer}
        .btn-pri:hover{background:#2563eb}
        .btn-import{width:100%;padding:11px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-weight:500;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
        .btn-import:hover{background:var(--bg-input);color:var(--text);border-color:#6366f1}
        .btn-import-icon{width:18px;height:18px;display:inline-flex;align-items:center}
        .btn-import-icon svg{width:18px;height:18px}
        .empty{text-align:center;padding:30px;color:var(--text-dim)}
        .empty-icon{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;margin-bottom:12px}
        .empty-icon svg{width:48px;height:48px}
        
        .btn-data-icon,.btn-icon-sm,.btn-icon-xs,.section-icon,.tab-icon,.draft-icon,.nav-icon,.hint-icon,.hint-icon-sm,.parse-icon{display:inline-flex;vertical-align:middle}
        .btn-data-icon{width:16px;height:16px;margin-right:6px;display:inline-flex;align-items:center}
        .btn-data-icon svg{width:16px;height:16px}
        .btn-icon-sm{width:16px;height:16px;margin-right:6px;display:inline-flex;align-items:center}
        .btn-icon-sm svg{width:16px;height:16px}
        .btn-icon-xs{width:14px;height:14px;margin-right:4px;display:inline-flex;align-items:center}
        .btn-icon-xs svg{width:14px;height:14px}
        .section-icon{width:18px;height:18px;margin-right:8px;display:inline-flex;align-items:center}
        .section-icon svg{width:18px;height:18px}
        .tab-icon{width:16px;height:16px;margin-right:6px}
        .draft-icon{width:18px;height:18px;margin-right:8px;display:inline-flex;align-items:center}
        .draft-icon svg{width:18px;height:18px}
        .nav-icon{width:18px;height:18px}
        .hint-icon{width:20px;height:20px;margin-right:6px;vertical-align:middle;display:inline-flex;align-items:center}
        .hint-icon svg{width:20px;height:20px}
        .hint-icon-sm{width:16px;height:16px;margin-right:4px;vertical-align:middle}
        .parse-icon{width:24px;height:24px}
        
        .empty-p-icon{display:block;width:64px;height:64px;margin:0 auto 16px}
        .confirm-icon{display:block;width:48px;height:48px;margin:0 auto 12px}
        .empty span{font-size:40px;display:block;margin-bottom:12px}
        .empty p{color:var(--text-dim)}
        .immo-list{display:flex;flex-direction:column;gap:8px}
        .immo-card{display:flex;align-items:center;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;cursor:pointer;border-left:3px solid #6366f1;transition:all 0.15s}
        .immo-card:hover{background:var(--border-hover);border-color:#3b82f6}
        .immo-typ-tag{font-size:8px;padding:2px 5px;border-radius:3px;font-weight:700;margin-right:8px;border:1px solid;letter-spacing:0.5px}
        .immo-info{flex:1}
        .immo-name{font-weight:600;font-size:13px}
        .immo-addr{font-size:11px;color:var(--text-muted)}
        .immo-meta{font-size:10px;color:var(--text-dim);margin-top:3px;font-family:'JetBrains Mono',monospace}
        .immo-actions{display:flex;gap:4px}
        .del-sm,.dup-sm{width:28px;height:28px;border:none;background:transparent;cursor:pointer;border-radius:5px;display:flex;align-items:center;justify-content:center;padding:4px}
        .del-sm svg,.dup-sm svg{width:16px;height:16px}
        .del-sm:hover{background:rgba(239,68,68,0.15)}
        .dup-sm:hover{background:rgba(99,102,241,0.15)}
        .del-icon{width:18px;height:18px}
        
        .confirm-modal{max-width:320px;text-align:center}
        .confirm-content{padding:24px}
        .confirm-content h3{font-size:16px;margin-bottom:8px}
        .confirm-content p{font-size:13px;color:var(--text-dim);margin-bottom:20px}
        .confirm-btns{display:flex;gap:10px}
        .btn-cancel{flex:1;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-weight:500;cursor:pointer}
        .btn-cancel:hover{background:var(--border-hover)}
        .btn-delete{flex:1;padding:10px;background:#dc2626;border:none;border-radius:6px;color:#fff;font-weight:600;cursor:pointer}
        .btn-delete:hover{background:#b91c1c}
        
        .empty-p{text-align:center;padding:60px 20px}
        .empty-p span{font-size:50px;display:block;margin-bottom:16px}
        .empty-p h2{font-size:18px;margin-bottom:6px}
        .empty-p p{color:var(--text-dim);margin-bottom:20px}
        .empty-p button{padding:12px 28px;background:#3b82f6;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
        
        .tabs{display:flex;gap:4px;margin-bottom:14px;background:var(--bg-card);padding:4px;border-radius:6px;width:fit-content;border:1px solid var(--border)}
        .tabs button{padding:7px 12px;background:none;border:none;color:var(--text-dim);font-size:11px;font-weight:500;cursor:pointer;border-radius:5px;display:flex;align-items:center;gap:6px}
        .tabs button:hover{color:var(--text-muted)}
        .tabs button.act{background:#3b82f6;color:#fff}
        
        .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:14px}
        .kpi-c{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}
        .kpi-c.hl{border-color:#22c55e;background:rgba(34,197,94,0.05)}
        .kpi-c.hl b{color:#22c55e}
        .kpi-c span{font-size:9px;color:var(--text-dim);text-transform:uppercase;display:block;margin-bottom:3px}
        .kpi-c b{font-family:'JetBrains Mono',monospace;font-size:14px}
        
        .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
        .card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px}
        .card h4{font-size:11px;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px}
        .card .row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:var(--text-muted)}
        .card .row span:last-child{font-family:'JetBrains Mono',monospace}
        .card .row.tot{color:var(--text);font-weight:500;border-top:1px solid var(--border-hover);padding-top:8px;margin-top:4px}
        
        .set-panel{max-width:400px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px}
        
        .tbl-wrap{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
        .tbl-wrap{overflow-x:auto;max-height:400px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
        th{background:var(--bg-input);color:var(--text-dim);font-weight:600;font-size:9px;text-transform:uppercase;position:sticky;top:0}
        td{font-family:'JetBrains Mono',monospace;color:var(--text-muted)}
        td:first-child{position:sticky;left:0;background:var(--bg-card);text-align:left;font-weight:600;color:var(--text)}
        .pos{color:#22c55e}
        .neg{color:#ef4444}
        
        .chart{display:flex;flex-direction:column;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px}
        .bar-row{display:flex;align-items:center;gap:8px}
        .bar-row>span:first-child{width:28px;font-size:10px;color:var(--text-dim)}
        .bar-bg{flex:1;height:18px;background:var(--bg-input);border-radius:3px;overflow:hidden}
        .bar{height:100%;border-radius:3px}
        .bar.pos{background:linear-gradient(90deg,#22c55e,#16a34a)}
        .bar.neg{background:linear-gradient(90deg,#ef4444,#dc2626)}
        .bar-row>span:last-child{width:80px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px}
        
        .section-title{font-size:13px;font-weight:600;color:var(--text);margin:20px 0 12px;padding-top:16px;border-top:1px solid var(--border)}
        .section-title-first{font-size:13px;font-weight:600;color:var(--text);margin:0 0 12px}
        
        .chart-section{margin-top:20px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px}
        .chart-section h4{font-size:12px;font-weight:600;color:var(--text-muted);margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px}
        .chart-stacked{display:flex;align-items:flex-end;gap:4px;height:120px;padding:0 8px}
        .chart-bar-col{display:flex;flex-direction:column;align-items:center;flex:1;height:100%}
        .chart-bar-wrapper{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
        .chart-bar-v{width:70%;max-width:24px;border-radius:3px 3px 0 0;min-height:4px;transition:height 0.3s}
        .chart-bar-v.pos{background:linear-gradient(180deg,#22c55e,#16a34a)}
        .chart-bar-v.neg{background:linear-gradient(180deg,#ef4444,#dc2626)}
        .chart-bar-label{font-size:9px;color:var(--text-dim);margin-top:6px}
        .chart-legend{display:flex;justify-content:center;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
        .chart-legend span{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-muted)}
        
        .yr-bar{display:flex;align-items:center;gap:10px;margin-bottom:14px}
        .yr-bar label{font-size:12px;color:var(--text-muted)}
        .yr-bar select{padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px}
        .badge{font-size:10px;color:#3b82f6;background:rgba(59,130,246,0.1);padding:3px 8px;border-radius:4px}
        
        .result-box{text-align:center;padding:18px;border-radius:8px;margin-bottom:14px;border:1px solid}
        .result-box.pos{background:rgba(34,197,94,0.05);border-color:rgba(34,197,94,0.2)}
        .result-box.neg{background:rgba(239,68,68,0.05);border-color:rgba(239,68,68,0.2)}
        .result-header{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px}
        .result-header span{font-size:10px;color:var(--text-dim);text-transform:uppercase}
        .result-box b{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;display:block}
        .result-box.pos b{color:#22c55e}
        .result-box.neg b{color:#ef4444}
        .result-box small{font-size:11px;color:var(--text-dim);display:block;margin-top:4px}
        
        .info-tooltip{position:relative;display:inline-flex}
        .info-btn{width:18px;height:18px;padding:0;background:none;border:none;cursor:pointer;opacity:0.6;transition:opacity 0.15s}
        .info-btn:hover{opacity:1}
        .info-tooltip-content{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:8px;width:280px;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:100;text-align:left;opacity:0;visibility:hidden;transition:all 0.15s}
        .info-tooltip:hover .info-tooltip-content{opacity:1;visibility:visible}
        .info-tooltip-content strong{font-size:11px;color:var(--text);display:block;margin-bottom:8px}
        .info-tooltip-content p{font-size:11px;color:var(--text-muted);margin:6px 0;display:flex;align-items:flex-start;gap:6px}
        .info-tooltip-content b{color:var(--text)}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:3px}
        .dot.green{background:#22c55e}
        .dot.red{background:#ef4444}
        .th-with-info{display:inline-flex;align-items:center;gap:4px}
        .th-with-info .info-tooltip-content{left:auto;right:0;transform:none}
        
        .afa-box{background:var(--bg-input);border-radius:6px;padding:10px;margin-bottom:8px}
        .afa-r{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}
        .afa-r span:last-child{font-family:'JetBrains Mono',monospace}
        .afa-box small{font-size:10px;color:var(--text-dim)}
        
        @media(max-width:640px){
          .hdr{padding:10px 14px}
          .nav{padding:0 14px}
          .nav-in{flex-wrap:wrap;gap:4px}
          .nav-tab-btn{padding:10px 12px}
          .nav-divider{display:none}
          .nav-immo-select{width:100%;order:10;padding:6px 0 8px}
          .sel-btn{flex:1;max-width:none}
          .nav-tabs{width:100%;overflow-x:auto}
          .hdr-acts .hdr-btn span:not(.btn-icon-sm):not(.hdr-btn-icon){display:none}
          .main{padding:14px}
          .dash-totals{grid-template-columns:repeat(2,1fr)}
          .dash-table-wrap{overflow-x:auto}
          .dash-cards{grid-template-columns:1fr}
        }
        
        /* Dashboard Styles */
        .dash-header{display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
        .dash-header h2{font-size:18px;font-weight:600}
        .dash-search{display:flex;align-items:center;flex:1;max-width:280px;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;padding:0 8px;gap:6px}
        .dash-search:focus-within{border-color:#6366f1}
        .search-icon{width:12px;height:12px;flex-shrink:0;opacity:0.6}
        .dash-search input{flex:1;padding:5px 0;background:transparent;border:none;color:var(--text);font-size:11px;outline:none}
        .dash-search input::placeholder{color:var(--text-dim)}
        .search-clear{width:16px;height:16px;border:none;background:var(--border);color:var(--text-muted);border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center}
        .search-clear:hover{background:#ef4444;color:#fff}
        .dash-count{font-size:11px;color:var(--text-dim);background:var(--bg-input);padding:4px 10px;border-radius:20px;white-space:nowrap}
        
        /* Dashboard Filter Buttons */
        .dash-filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
        .dash-filter-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-size:12px;cursor:pointer;transition:all 0.15s}
        .dash-filter-btn svg{width:14px;height:14px;flex-shrink:0}
        .dash-filter-btn:hover{border-color:var(--border-hover);color:var(--text);background:var(--bg-card)}
        .dash-filter-btn.active{background:#6366f1;border-color:#6366f1;color:#fff}
        .dash-filter-btn.warning.active{background:#f59e0b;border-color:#f59e0b}
        .filter-badge{background:rgba(99,102,241,0.2);color:#6366f1;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;margin-left:2px}
        .dash-filter-btn.active .filter-badge{background:rgba(255,255,255,0.25);color:#fff}
        .filter-badge.warn{background:rgba(245,158,11,0.2);color:#f59e0b}
        .dash-filter-btn.active .filter-badge.warn{background:rgba(255,255,255,0.25);color:#fff}
        
        /* Zinsbindungs-Warnung Badge in Karten */
        .dic-warning-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:4px;color:#f59e0b;font-size:10px;font-weight:500}
        .dic-warning-badge svg{width:12px;height:12px}
        .dic-check-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:4px;color:#f59e0b;font-size:10px;font-weight:500}
        .dic-check-badge svg{width:12px;height:12px}
        
        .dash-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
        .filter-active-hint{grid-column:1/-1;padding:8px 12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:6px;color:#6366f1;font-size:11px;text-align:center}
        .dash-total-card{display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
        .dash-total-card.disabled{opacity:0.5;filter:grayscale(0.5)}
        .dtc-icon{width:40px;height:40px;flex-shrink:0}
        .dtc-icon svg{width:40px;height:40px}
        .dtc-info{flex:1;min-width:0;overflow:hidden}
        .dtc-info span{font-size:10px;color:var(--text-dim);text-transform:uppercase;display:block}
        .dtc-info b{font-family:'JetBrains Mono',monospace;font-size:15px;display:block;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .dtc-info small{font-size:10px;color:var(--text-dim);white-space:nowrap}
        
        .dash-table-wrap{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:20px;margin-top:24px}
        .dash-widget-full{grid-column:1/-1;margin-top:24px}
        .dash-table-inner{overflow-x:auto}
        .dash-table{width:100%;border-collapse:collapse;font-size:12px}
        .dash-table th,.dash-table td{padding:12px;text-align:right;border-bottom:1px solid var(--border)}
        .dash-table th{background:var(--bg-input);color:var(--text-dim);font-size:10px;text-transform:uppercase;font-weight:600}
        .dash-table th:first-child,.dash-table td:first-child{text-align:left}
        .dash-table th.sortable{cursor:pointer;user-select:none;transition:color 0.15s}
        .dash-table th.sortable:hover{color:#6366f1}
        .dash-table th.sorted{color:#6366f1}
        .dash-table td{font-family:'JetBrains Mono',monospace;color:var(--text-muted)}
        .dash-table tbody tr:hover td{background:rgba(59,130,246,0.03)}
        .dash-row-click{cursor:pointer}
        .dash-row-click:hover td{background:rgba(99,102,241,0.1)!important}
        .dash-table tfoot td{background:var(--bg-input);border-top:2px solid var(--border-hover)}
        .dash-name{font-family:'Inter',sans-serif}
        .dash-name strong{display:block;color:var(--text);font-size:13px}
        .dash-name small{color:var(--text-dim);font-size:11px}
        .dash-tag{font-size:9px;padding:3px 6px;border-radius:4px;font-weight:600;border:1px solid}
        
        .progress-cell{display:flex;align-items:center;gap:6px}
        .progress-bar-mini{flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;min-width:30px}
        .progress-fill{height:100%;border-radius:2px;background:var(--text-dim);transition:width 0.3s}
        .progress-cell span{font-size:10px;color:var(--text-dim);min-width:28px;text-align:right}
        
        .dash-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:8px}
        .dash-immo-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;cursor:pointer;transition:all 0.15s;border-left:4px solid #6366f1}
        .dash-immo-card:hover{border-color:#6366f1;transform:translateY(-2px);box-shadow:0 4px 12px rgba(99,102,241,0.15)}
        .dash-immo-card.dragging{opacity:0.5;transform:scale(0.98)}
        .dash-immo-card.drag-over{border-color:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,0.3)}
        
        /* Dashboard Widgets */
        .dash-widgets{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}
        .dash-widget{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px}
        .dash-widget h3{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;margin-bottom:16px;color:var(--text)}
        .widget-icon{width:20px;height:20px;display:inline-flex;align-items:center}
        .widget-icon svg{width:20px;height:20px}
        
        /* Pie Chart */
        .pie-chart-container{display:flex;align-items:center;gap:20px}
        .pie-chart{width:100px;height:100px;flex-shrink:0}
        .pie-center-number{font-size:18px;font-weight:700;fill:var(--text)}
        .pie-center-label{font-size:8px;fill:var(--text-dim)}
        .pie-legend{display:flex;flex-direction:column;gap:6px;flex:1}
        .pie-legend-item{display:flex;align-items:center;gap:8px;font-size:12px}
        .pie-legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
        .pie-legend-label{flex:1;color:var(--text)}
        .pie-legend-count{color:var(--text-dim);font-size:11px}
        
        /* Cashflow */
        .cashflow-container{display:flex;flex-direction:column;gap:10px}
        .cashflow-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px}
        .cashflow-row.income{background:rgba(34,197,94,0.1)}
        .cashflow-row.expense{background:rgba(239,68,68,0.1)}
        .cashflow-row.net{background:var(--bg-input);border:1px solid var(--border)}
        .cashflow-row.net.positive{border-color:rgba(34,197,94,0.3)}
        .cashflow-row.net.negative{border-color:rgba(239,68,68,0.3)}
        .cf-label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)}
        .cf-icon{font-size:14px}
        .cf-value{font-family:'JetBrains Mono',monospace;font-size:13px}
        .cashflow-divider{height:1px;background:var(--border);margin:4px 0}
        .cashflow-bar{margin-top:8px}
        .cashflow-bar-track{height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;position:relative}
        .cashflow-bar-income{position:absolute;top:0;left:0;height:100%;background:#22c55e;border-radius:4px}
        .cashflow-bar-expense{position:absolute;top:0;left:0;height:100%;background:#ef4444;border-radius:4px}
        .cashflow-bar-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-top:4px}
        .cashflow-hint{font-size:10px;color:var(--text-dim);text-align:center;margin-top:8px}
        
        /* Locations */
        .locations-container{display:flex;flex-direction:column;gap:12px}
        .dash-widget-map{grid-column:span 1}
        .svg-map-container{height:180px;border-radius:8px;overflow:hidden;background:var(--bg-input)}
        .svg-map{width:100%;height:100%}
        .map-marker-svg{cursor:pointer}
        .map-marker-svg:hover path{filter:brightness(1.2)}
        
        .location-list{display:flex;flex-direction:column;gap:4px}
        .location-item{display:flex;align-items:center;gap:8px;font-size:11px;padding:4px 0}
        .location-item.location-more{color:var(--text-dim);font-style:italic}
        .loc-marker{width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px}
        .loc-name{flex:1;color:var(--text)}
        .loc-count{color:var(--text-dim)}
        .loc-value{font-family:'JetBrains Mono',monospace;color:var(--text-muted);font-size:10px}
        
        /* Tilgungsplan Modal */
        .tilgungsplan-modal{max-width:700px;max-height:90vh;overflow-y:auto}
        .tp-header{display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px}
        .tp-info strong{display:block;color:var(--text)}
        .tp-info span{font-size:12px;color:var(--text-dim)}
        .tp-rate{text-align:right}
        .tp-rate span{font-size:11px;color:var(--text-dim);display:block}
        .tp-rate strong{font-size:18px;color:#3b82f6}
        .tp-control{display:flex;align-items:center;gap:12px;margin-bottom:16px}
        .tp-control label{font-size:12px;color:var(--text-muted)}
        .tp-control input[type="range"]{flex:1;accent-color:#3b82f6}
        .tp-control span{font-size:12px;font-weight:600;min-width:60px}
        .tp-summary{display:flex;gap:12px;margin-bottom:16px}
        .tp-sum-item{flex:1;padding:12px;background:var(--bg-input);border-radius:8px;text-align:center}
        .tp-sum-item span{display:block;font-size:11px;color:var(--text-dim);margin-bottom:4px}
        .tp-sum-item b{font-size:14px}
        .tp-chart{margin-bottom:16px;padding:12px;background:var(--bg-input);border-radius:8px}
        .tp-chart-bars{display:flex;align-items:flex-end;gap:2px;height:80px}
        .tp-bar-group{flex:1;display:flex;flex-direction:column;align-items:center}
        .tp-bar-stack{width:100%;display:flex;flex-direction:column-reverse;height:60px}
        .tp-bar-zinsen{background:#ef4444;border-radius:2px 2px 0 0;min-height:1px}
        .tp-bar-tilgung{background:#22c55e;border-radius:2px 2px 0 0;min-height:1px}
        .tp-bar-label{font-size:8px;color:var(--text-dim);margin-top:4px}
        .tp-chart-legend{display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:11px}
        .tp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
        .tp-dot.zinsen{background:#ef4444}
        .tp-dot.tilgung{background:#22c55e}
        .tp-table-wrap{max-height:250px;overflow-y:auto;border:1px solid var(--border);border-radius:8px}
        .tp-table{width:100%;border-collapse:collapse;font-size:12px}
        .tp-table th{background:var(--bg-input);padding:8px;text-align:left;position:sticky;top:0;font-weight:500;color:var(--text-muted)}
        .tp-table td{padding:8px;border-top:1px solid var(--border)}
        .btn-tilgungsplan{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:transparent;border:1px solid #3b82f6;border-radius:4px;color:#3b82f6;font-size:10px;cursor:pointer;margin-left:auto}
        .btn-tilgungsplan:hover{background:rgba(59,130,246,0.1)}
        .btn-tilgungsplan svg{width:12px;height:12px;flex-shrink:0;max-width:12px;max-height:12px}
        
        /* Onboarding Tour */
        .onboarding-modal{background:var(--bg-card);border-radius:16px;padding:32px;max-width:420px;text-align:center;position:relative}
        .onboarding-progress{display:flex;justify-content:center;gap:6px;margin-bottom:24px}
        .onboarding-dot{width:8px;height:8px;border-radius:50%;background:var(--border)}
        .onboarding-dot.active{background:#6366f1;transform:scale(1.2)}
        .onboarding-dot.done{background:#22c55e}
        .onboarding-icon{width:64px;height:64px;margin:0 auto 16px;background:rgba(99,102,241,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:16px}
        .onboarding-modal h2{font-size:20px;margin-bottom:12px;color:var(--text)}
        .onboarding-modal p{font-size:14px;color:var(--text-muted);line-height:1.6;margin-bottom:24px}
        .onboarding-actions{display:flex;gap:12px;justify-content:center}
        .onboarding-skip{position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-dim);font-size:12px;cursor:pointer}
        .onboarding-skip:hover{color:var(--text)}
        
        @media(max-width:900px){
          .dash-widgets{grid-template-columns:1fr}
        }
        .dic-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
        .dic-type-tag{font-size:10px;padding:6px 10px;border-radius:6px;font-weight:600;border:1px solid;flex-shrink:0;text-align:center;min-width:50px}
        .dic-title{flex:1;min-width:0}
        .dic-title strong{display:block;font-size:14px;line-height:1.3}
        .dic-title small{font-size:11px;color:var(--text-dim);display:block;margin-top:2px}
        .dic-badges-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
        .dic-progress-row{display:flex;justify-content:flex-end;margin-bottom:12px}
        .dic-tag{font-size:9px;padding:3px 8px;border-radius:4px;font-weight:600;border:1px solid}
        .dic-progress-inline{display:flex;align-items:center;gap:6px;margin-left:auto}
        .dic-progress-bar-inline{width:50px;height:4px;background:var(--border);border-radius:2px;overflow:hidden}
        .dic-progress-fill-inline{height:100%;background:var(--text-dim);border-radius:2px}
        .dic-progress-inline span{font-size:10px;color:var(--text-dim)}
        .dic-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}
        .dic-stat{background:var(--bg-input);border-radius:6px;padding:10px;text-align:center}
        .dic-stat span{font-size:9px;color:var(--text-dim);text-transform:uppercase;display:block;margin-bottom:2px}
        .dic-stat b{font-family:'JetBrains Mono',monospace;font-size:13px}
        .dic-bar{margin-top:10px}
        .dic-bar-label{display:flex;justify-content:space-between;font-size:9px;color:var(--text-dim);margin-bottom:4px}
        .dic-bar-track{height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden}
        .dic-bar-ek{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:4px}
        .dic-bar-vals{display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-top:4px;font-family:'JetBrains Mono',monospace}
        .dic-click-hint{text-align:center;font-size:10px;color:var(--text-dim);margin-top:12px;padding-top:10px;border-top:1px solid var(--border);transition:color 0.15s}
        .dash-immo-card:hover .dic-click-hint{color:#6366f1}
        
        .notes-textarea{width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;resize:vertical;min-height:100px;line-height:1.5}
        .notes-textarea:focus{outline:none;border-color:#6366f1}
        .notes-textarea::placeholder{color:var(--text-dim)}
        
        /* Dokumente/Fotos */
        .docs-list{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
        .doc-row{display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px}
        .doc-typ{width:120px;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px}
        .doc-name{flex:1;min-width:100px;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .doc-url{flex:2;min-width:150px;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;font-family:'JetBrains Mono',monospace}
        .doc-typ:focus,.doc-name:focus,.doc-url:focus{outline:none;border-color:#f97316}
        .doc-open{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(249,115,22,0.1);border:1px solid #f97316;border-radius:4px;color:#f97316;text-decoration:none;font-size:14px;font-weight:600}
        .doc-open:hover{background:#f97316;color:#fff}
        .doc-del{width:28px;height:28px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:16px}
        .doc-del:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        
        /* Dropzone */
        .doc-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;border:2px dashed var(--border);border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s}
        .doc-dropzone:hover,.doc-dropzone.dragover{border-color:#f97316;background:rgba(249,115,22,0.05)}
        .doc-dropzone.dragover{border-style:solid;background:rgba(249,115,22,0.1)}
        .dropzone-icon{font-size:28px;opacity:0.6}
        .doc-dropzone span{font-size:13px;color:var(--text-muted)}
        .doc-dropzone small{font-size:11px;color:var(--text-dim)}
        
        /* File entries */
        .doc-row.has-file{background:rgba(249,115,22,0.05);border-color:rgba(249,115,22,0.3)}
        .doc-preview{width:48px;height:48px;border-radius:6px;overflow:hidden;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .doc-preview img{width:100%;height:100%;object-fit:cover}
        .doc-pdf-icon{background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:4px 6px;border-radius:3px}
        .doc-file-icon{font-size:20px}
        .doc-file-info{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
        .doc-file-name{font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .doc-file-size{font-size:10px;color:var(--text-dim)}
        .doc-typ-sm{width:90px;padding:4px 6px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:10px}
        .doc-view{width:28px;height:28px;border:none;background:rgba(249,115,22,0.1);border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
        .doc-view:hover{background:#f97316}
        
        /* Darlehen */
        .darlehen-card{background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px}
        .darlehen-header{display:flex;gap:8px;margin-bottom:10px}
        .darlehen-name{flex:1;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;font-weight:500}
        .darlehen-typ{width:120px;padding:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px}
        .darlehen-del{width:32px;height:32px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:18px}
        .darlehen-del:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        .darlehen-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
        .darlehen-field{display:flex;flex-direction:column;gap:4px}
        .darlehen-field label{font-size:10px;color:var(--text-dim);text-transform:uppercase}
        .darlehen-field input{padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .darlehen-field input:focus{outline:none;border-color:#3b82f6}
        .darlehen-field .ifld{display:flex;align-items:center;gap:4px}
        .darlehen-field .ifld input{flex:1}
        .darlehen-field .ifld span{font-size:11px;color:var(--text-dim)}
        .darlehen-calc{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted)}
        .darlehen-section{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)}
        .darlehen-section:first-of-type{margin-top:10px;padding-top:0;border-top:none}
        .darlehen-section-label{font-size:10px;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;font-weight:600;letter-spacing:0.5px}
        .darlehen-field.wide{grid-column:span 2}
        .darlehen-field select{width:100%;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .darlehen-buttons{display:flex;gap:10px;flex-wrap:wrap}
        .btn-import-darlehen{padding:8px 14px;background:transparent;border:1px solid #3b82f6;border-radius:6px;color:#3b82f6;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
        .btn-import-darlehen:hover{background:rgba(59,130,246,0.1)}
        .miete-import-section{margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
        .miete-import-section .btn-import-darlehen{border-color:#ec4899;color:#ec4899}
        .miete-import-section .btn-import-darlehen:hover{background:rgba(236,72,153,0.1)}
        .import-section-top{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)}
        
        /* Darlehen Import Modal */
        .darlehen-import-modal{max-width:500px}
        .parsed-darlehen-header{display:flex;align-items:center;gap:10px;padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;margin-bottom:12px}
        .parsed-darlehen-header .parsed-icon{width:24px;height:24px}
        .parsed-darlehen-list{display:flex;flex-direction:column;gap:10px;max-height:350px;overflow-y:auto}
        .parsed-darlehen-card{padding:14px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px}
        .pdc-header{margin-bottom:10px}
        .pdc-header strong{display:block;font-size:14px;color:var(--text)}
        .pdc-header small{color:var(--text-dim);font-size:11px}
        .pdc-details{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:12px}
        .pdc-details span{font-size:12px;color:var(--text-muted)}
        .pdc-details b{color:var(--text-dim);font-weight:500}
        .btn-import-single{padding:6px 12px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);font-size:11px;cursor:pointer}
        .btn-import-single:hover{background:var(--border-hover);color:var(--text)}
        .legacy-hint{padding:8px;background:rgba(59,130,246,0.1);border-radius:4px;margin-bottom:10px}
        .legacy-hint small{color:var(--text-dim);font-size:11px}
        
        /* Miethistorie */
        .mhist-toggle{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-top:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all 0.15s}
        .mhist-toggle:hover{border-color:#ec4899;background:rgba(236,72,153,0.05)}
        .mhist-toggle-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:rgba(236,72,153,0.15);border-radius:4px;color:#ec4899;font-weight:600;font-size:14px}
        .mhist-toggle-count{margin-left:auto;font-size:11px;color:var(--text-dim)}
        .mhist-import-btn{display:flex;align-items:center;gap:6px;padding:4px 10px;background:transparent;border:1px solid #ec4899;border-radius:4px;color:#ec4899;font-size:11px;cursor:pointer;margin-left:auto;white-space:nowrap}
        .mhist-import-btn:hover{background:rgba(236,72,153,0.1)}
        .mhist-content{margin-top:10px;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px}
        .mhist-list{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
        .mhist-row{display:flex;flex-direction:column;gap:10px;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px}
        .mhist-dates{display:flex;gap:12px;flex-wrap:wrap}
        .mhist-date-field{display:flex;flex-direction:column;gap:4px}
        .mhist-date-field label{font-size:10px;color:var(--text-dim);text-transform:uppercase}
        .mhist-date-field input{width:130px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .mhist-values{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
        .mhist-field{display:flex;flex-direction:column;gap:4px}
        .mhist-field label{font-size:10px;color:var(--text-dim);text-transform:uppercase}
        .mhist-field input{width:80px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;text-align:right}
        .mhist-field span{font-size:11px;color:var(--text-dim);align-self:flex-end;padding-bottom:6px}
        .mhist-gesamt{background:rgba(236,72,153,0.08);padding:6px 10px;border-radius:4px;border:1px dashed rgba(236,72,153,0.3)}
        .mhist-gesamt-value{font-size:13px;font-weight:600;color:#ec4899;font-family:'JetBrains Mono',monospace;padding:6px 0}
        .mhist-grund{flex:1;min-width:150px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .mhist-del{position:absolute;top:8px;right:8px;width:24px;height:24px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:14px}
        .mhist-del:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        .mhist-row{position:relative}
        
        /* Frühere Mieter */
        .frueherer-mieter-section{margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
        .frueherer-mieter-list{display:flex;flex-direction:column;gap:6px}
        .frueherer-mieter-item{display:flex;align-items:center;gap:12px;padding:8px 10px;background:rgba(14,165,233,0.05);border:1px solid rgba(14,165,233,0.2);border-radius:6px;font-size:12px}
        .fm-name{flex:1;font-weight:500;color:var(--text)}
        .fm-datum{color:var(--text-dim);font-size:11px}
        .fm-miete{font-family:'JetBrains Mono',monospace;color:#0ea5e9;font-size:11px}
        
        /* Erinnerungen */
        .erinnerungen-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
        .erinnerung-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;transition:all 0.15s}
        .erinnerung-row.done{opacity:0.5}
        .erinnerung-row.done .erinnerung-titel{text-decoration:line-through}
        .erinnerung-row.overdue{border-color:#ef4444;background:rgba(239,68,68,0.05)}
        .erinnerung-row.upcoming{border-color:#f59e0b;background:rgba(245,158,11,0.05)}
        .erinnerung-check{width:18px;height:18px;accent-color:#22c55e}
        .erinnerung-datum{width:130px;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .erinnerung-titel{flex:1;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .erinnerung-del{width:28px;height:28px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:16px}
        .erinnerung-del:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        
        /* Nebenkosten Section */
        .nk-section{display:flex;flex-direction:column;gap:10px}
        .nk-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
        .nk-item{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;font-size:12px}
        .nk-jahr{font-weight:600;min-width:50px}
        .nk-voraus,.nk-tatsaechlich{color:var(--text-muted);font-family:'JetBrains Mono',monospace;font-size:11px}
        .nk-ergebnis{flex:1;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:500}
        .nk-ergebnis.pos{color:#22c55e}
        .nk-ergebnis.neg{color:#ef4444}
        .btn-del-small{width:28px;height:28px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:16px}
        .btn-del-small:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        .nk-form{padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;margin-bottom:12px}
        .nk-form-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)}
        .nk-form-row:last-of-type{border-bottom:none}
        .nk-form-row label{font-size:12px;color:var(--text-muted)}
        .nk-form-row input{width:100px;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;text-align:right}
        .nk-form-row.result{background:rgba(99,102,241,0.05);padding:10px;margin:8px -12px -12px;border-radius:0 0 8px 8px}
        .nk-calc{font-family:'JetBrains Mono',monospace;font-size:12px}
        .nk-form-buttons{display:flex;gap:8px;margin-top:12px}
        
        /* Mieter Section */
        .mieter-section{display:flex;flex-direction:column;gap:10px}
        .mieter-aktiv{display:flex;align-items:center;gap:12px;padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:8px;font-size:12px;margin-bottom:8px}
        .mieter-aktiv-label{background:#8b5cf6;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}
        .mieter-historie{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
        .mieter-item{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;font-size:12px}
        .mieter-item.aktiv{border-color:rgba(139,92,246,0.4);background:rgba(139,92,246,0.05)}
        .mieter-item-main{display:flex;align-items:center;gap:8px;min-width:150px}
        .mieter-badge{background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600}
        .mieter-item-details{display:flex;gap:16px;flex:1;color:var(--text-muted);font-family:'JetBrains Mono',monospace;font-size:11px}
        .mieter-item-actions{display:flex;gap:4px}
        .mieter-item-actions button{width:28px;height:28px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:14px}
        .mieter-item-actions button:first-child:hover{background:rgba(99,102,241,0.15);color:#6366f1}
        .mieter-item-actions button:last-child:hover{background:rgba(239,68,68,0.15);color:#ef4444}
        .mieter-form{padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;margin-bottom:12px}
        .mieter-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .mieter-form-row{display:flex;flex-direction:column;gap:4px}
        .mieter-form-row.full{grid-column:1/-1}
        .mieter-form-row label{font-size:11px;color:var(--text-muted)}
        .mieter-form-row input[type="text"],.mieter-form-row input[type="date"]{padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px}
        .mieter-form-row input[type="checkbox"]{width:18px;height:18px;accent-color:#8b5cf6}
        .mieter-form-row textarea{padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;resize:vertical;min-height:60px}
        .mieter-form-row.calculated{background:rgba(99,102,241,0.05);padding:8px 10px;border-radius:4px;border:1px dashed var(--border)}
        .mieter-warmmiete{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:#6366f1}
        .mieter-form-buttons{display:flex;gap:8px;margin-top:12px}
        
        /* Beteiligte Modal */
        .bet-modal{max-width:400px}
        .bet-list{display:flex;flex-direction:column;gap:4px;margin-bottom:16px;max-height:300px;overflow-y:auto}
        .bet-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all 0.15s}
        .bet-item:hover{border-color:var(--border-hover);background:var(--border-hover)}
        .bet-item.active{border-color:#8b5cf6;background:rgba(139,92,246,0.1)}
        .bet-icon{width:28px;height:28px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;padding:4px}
        .bet-icon svg{width:16px;height:16px}
        .bet-icon.all{border-color:#6366f1;background:rgba(99,102,241,0.1)}
        .bet-item span{flex:1;font-size:13px}
        .bet-check{color:#8b5cf6;font-weight:600}
        .bet-del{width:24px;height:24px;border:none;background:transparent;color:var(--text-dim);cursor:pointer;border-radius:4px;font-size:16px}
        .bet-del:hover{background:#ef4444;color:#fff}
        .bet-add{display:flex;gap:8px}
        .bet-add input{flex:1;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px}
        .bet-add input:focus{outline:none;border-color:#8b5cf6}
        .bet-add button{padding:10px 16px;background:#8b5cf6;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap}
        .bet-add button:disabled{opacity:0.5;cursor:not-allowed}
        .bet-add button:hover:not(:disabled){background:#7c3aed}
        .bet-sel-btn{min-width:100px;max-width:160px}
        
        /* Beteiligungen in Stammdaten */
        .bet-checkboxes{display:flex;flex-direction:column;gap:8px}
        .bet-checkbox-row{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;transition:all 0.15s}
        .bet-checkbox-row.active{border-color:#8b5cf6;background:rgba(139,92,246,0.05)}
        .bet-checkbox-label{display:flex;align-items:center;gap:10px;flex:1;cursor:pointer}
        .bet-checkbox-label input{accent-color:#8b5cf6;width:16px;height:16px}
        .bet-checkbox-icon{width:24px;height:24px;border-radius:50%;border:2px solid var(--border);padding:3px}
        .bet-checkbox-name{font-size:13px}
        .bet-anteil-wrap{display:flex;align-items:center;gap:8px;margin-left:auto}
        .bet-anteil-presets{display:flex;gap:4px}
        .bet-preset-btn{padding:4px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:10px;font-weight:500;cursor:pointer;transition:all 0.15s}
        .bet-preset-btn:hover{border-color:#8b5cf6;background:rgba(139,92,246,0.1)}
        .bet-preset-btn.active{background:#8b5cf6;border-color:#8b5cf6;color:#fff}
        .bet-anteil-custom{display:flex;align-items:center;gap:4px}
        .bet-anteil-custom input{width:50px;padding:4px 6px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px;text-align:right}
        .bet-anteil-custom input:focus{outline:none;border-color:#8b5cf6}
        .bet-anteil-custom input::placeholder{color:var(--text-dim);font-family:'Inter',sans-serif;font-size:10px}
        .bet-anteil-suffix{font-size:11px;color:var(--text-dim);font-weight:500}
        .bet-summe{margin-top:8px;padding:8px 12px;border-radius:6px;font-size:12px;text-align:right}
        .bet-summe.ok{background:rgba(34,197,94,0.1);color:#22c55e}
        .bet-summe.warn{background:rgba(245,158,11,0.1);color:#f59e0b}
        
        .empty-dash{text-align:center;padding:60px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px}
        .empty-dash-icon{width:64px;height:64px;margin:0 auto 20px;background:rgba(99,102,241,0.1);border:2px solid rgba(99,102,241,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:14px}
        .empty-dash-icon svg{width:36px;height:36px}
        .empty-dash h3{font-size:20px;margin-bottom:8px;color:var(--text)}
        .empty-dash p{color:var(--text-muted);margin-bottom:24px;max-width:400px;margin-left:auto;margin-right:auto}
        .empty-dash-features{display:flex;justify-content:center;gap:24px;flex-wrap:wrap}
        .edf-item{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-dim)}
        .edf-item svg{width:20px;height:20px}
        
        /* Import Modal Styles */
        .import-modal{max-width:520px}
        .upload-zone{border:2px dashed var(--border);border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s}
        .upload-zone:hover{border-color:#6366f1;background:rgba(99,102,241,0.05)}
        .upload-zone.has-file{border-color:#6366f1;border-style:solid}
        .upload-icon{width:48px;height:48px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center}
        .upload-icon svg{width:48px;height:48px}
        .upload-zone p{color:var(--text);margin-bottom:4px}
        .upload-zone small{color:var(--text-dim);font-size:11px}
        .upload-preview{max-width:100%;max-height:200px;border-radius:8px}
        .file-info{display:flex;justify-content:space-between;padding:10px 12px;background:var(--bg-input);border-radius:6px;margin-top:12px;font-size:12px}
        .files-list{display:flex;flex-direction:column;gap:4px;margin-top:12px;padding:10px;background:var(--bg-input);border-radius:8px}
        .file-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:12px;transition:all 0.15s}
        .file-item.current{border-color:#6366f1;background:rgba(99,102,241,0.05)}
        .file-item.done{opacity:0.6}
        .file-item.done .file-status{background:#22c55e;color:#fff}
        .file-status{width:22px;height:22px;border-radius:50%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--text-dim)}
        .file-item.current .file-status{background:#6366f1;color:#fff}
        .file-item .file-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .file-item .file-size{color:var(--text-dim);font-size:11px}
        .file-name{color:var(--text)}
        .file-size{color:var(--text-dim)}
        .import-error{padding:10px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#fca5a5;font-size:12px;margin-top:12px}
        .import-hint{padding:12px;background:rgba(99,102,241,0.1);border-radius:8px;font-size:12px;color:var(--text-muted);margin-top:16px}
        .import-hint strong{color:#6366f1;display:block;margin-bottom:4px}
        
        .parse-results{display:flex;flex-direction:column;gap:12px}
        .parse-header{display:flex;align-items:center;gap:12px;padding:12px;background:rgba(34,197,94,0.1);border-radius:8px}
        .parse-icon{width:32px;height:32px;background:#22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px}
        .parse-header strong{display:block;color:var(--text)}
        .parse-header small{color:var(--text-dim);font-size:11px}
        .parse-hint{font-size:12px;color:var(--text-dim);padding:8px 0}
        .parse-found-info{font-size:12px;color:var(--text-muted);margin:8px 0}
        .parse-icon-wrap{width:40px;height:40px;background:rgba(34,197,94,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center}
        
        .import-target-info{display:flex;align-items:center;gap:12px;padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:8px;margin-bottom:16px}
        .import-target-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center}
        .import-target-icon svg{width:32px;height:32px}
        .import-target-info strong{display:block;font-size:11px;color:var(--text-dim);text-transform:uppercase}
        .import-target-info span{font-size:14px;font-weight:600;color:#6366f1}
        
        .import-doctype-hint{margin-top:12px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:12px}
        .import-doctype-hint strong{display:block;color:var(--text-muted);margin-bottom:8px}
        .doctype-list{display:flex;flex-wrap:wrap;gap:6px}
        .doctype-list span{display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text-muted)}
        .doctype-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center}
        .doctype-icon svg{width:16px;height:16px}
        
        .parsed-immo{background:var(--bg-input);border-radius:10px;padding:14px}
        .parsed-immo-header{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
        .parsed-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center}
        .parsed-icon svg{width:32px;height:32px}
        .parsed-immo-header strong{display:block;color:var(--text);font-size:14px}
        .parsed-immo-header small{color:#f59e0b;font-size:11px}
        .parsed-immo-idx{color:var(--text-dim)}
        .parsed-source-badge{margin-left:auto;font-size:10px;padding:3px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text-dim)}
        .parsed-fields{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
        .pf{display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;background:var(--bg-card);border-radius:4px}
        .pf span:first-child{color:var(--text-dim)}
        .pf span:last-child{color:var(--text);font-family:'JetBrains Mono',monospace}
        .btn-import-immo{width:100%;padding:10px;background:#6366f1;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-import-immo:hover{background:#4f46e5}
        
        .parse-found-info-bar{display:flex;align-items:center;justify-content:space-between;padding:12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;margin-bottom:12px}
        .parse-found-count{font-size:14px;color:var(--text)}
        .parse-found-count strong{font-size:18px;color:#22c55e}
        .parse-darlehen-hint{color:#3b82f6;font-size:12px;margin-left:4px}
        .parsed-darlehen-badge{color:#3b82f6;font-weight:500}
        .pf-darlehen{background:rgba(59,130,246,0.1);border-left:3px solid #3b82f6}
        .pf-darlehen span:first-child{display:flex;align-items:center;gap:6px}
        .pf-darlehen span:first-child svg{width:14px;height:14px}
        .pf-darlehen-details{display:flex;flex-direction:column;gap:6px;padding:8px;background:rgba(59,130,246,0.05);border-radius:6px;border:1px dashed rgba(59,130,246,0.3)}
        .pf-darlehen-item{display:flex;flex-direction:column;gap:2px;padding:6px 8px;background:var(--bg-card);border-radius:4px}
        .pf-darlehen-item strong{font-size:12px;color:var(--text)}
        .pf-darlehen-item span{font-size:11px;color:var(--text-dim)}
        .btn-import-all{padding:8px 14px;background:#22c55e;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px}
        .btn-import-all:hover{background:#16a34a}
        .btn-import-all svg{width:14px;height:14px}
        
        .parse-multi-hint{display:flex;align-items:flex-start;gap:10px;padding:12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;margin-top:12px}
        .parse-multi-hint svg{width:20px;height:20px;flex-shrink:0}
        .parse-multi-hint span{font-size:12px;color:var(--text-muted);line-height:1.5}
        
        .parsed-immos-scroll{max-height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
        .pf.more{justify-content:center;color:#6366f1;font-style:italic}
        .pf-more-btn{width:100%;padding:8px;background:rgba(99,102,241,0.1);border:1px dashed #6366f1;border-radius:4px;color:#6366f1;font-size:11px;cursor:pointer;transition:all 0.15s}
        .pf-more-btn:hover{background:rgba(99,102,241,0.2);border-style:solid}
        .pf-extra{background:rgba(99,102,241,0.05);border-left:2px solid #6366f1}
        
        /* Merge View Styles */
        .merge-view{display:flex;flex-direction:column;gap:16px}
        .merge-header{display:flex;align-items:center;gap:12px;padding:12px;background:rgba(99,102,241,0.1);border-radius:8px}
        .merge-header-icon{width:40px;height:40px}
        .merge-header-info strong{display:block;font-size:14px}
        .merge-header-info small{font-size:12px;color:var(--text-dim)}
        
        .merge-section{background:var(--bg-input);border-radius:8px;padding:12px}
        .merge-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .merge-section-header small{font-size:11px;color:var(--text-dim)}
        .merge-badge{font-size:12px;font-weight:600}
        .merge-badge.auto{color:#22c55e}
        .merge-badge.conflict{color:#f59e0b}
        .merge-badge.unchanged{color:var(--text-dim)}
        
        .merge-fields{display:flex;flex-direction:column;gap:6px}
        .merge-field{display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg-card);border-radius:4px;font-size:12px}
        .merge-field.auto{border-left:3px solid #22c55e}
        .merge-field.unchanged{opacity:0.7}
        .merge-field-name{color:var(--text-dim)}
        .merge-field-value{font-family:'JetBrains Mono',monospace}
        .merge-field-value.new{color:#22c55e}
        .merge-field-more{text-align:center;font-size:11px;color:var(--text-dim);padding:6px}
        
        .merge-conflicts{display:flex;flex-direction:column;gap:10px}
        .merge-conflict{background:var(--bg-card);border-radius:6px;padding:12px;border:1px solid var(--border)}
        .merge-conflict-header{margin-bottom:10px}
        .merge-conflict-header strong{font-size:13px}
        .merge-conflict-options{display:flex;flex-direction:column;gap:6px}
        .merge-option{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-input);border-radius:6px;cursor:pointer;border:2px solid transparent;transition:all 0.15s}
        .merge-option:hover{border-color:var(--border-hover)}
        .merge-option.selected{border-color:#6366f1;background:rgba(99,102,241,0.05)}
        .merge-option input{accent-color:#6366f1}
        .merge-option-label{display:flex;align-items:center;gap:8px;flex:1}
        .merge-option-tag{font-size:10px;padding:2px 6px;border-radius:3px;font-weight:600}
        .merge-option-tag.keep{background:var(--bg-card);color:var(--text-muted)}
        .merge-option-tag.new{background:rgba(34,197,94,0.15);color:#22c55e}
        .merge-option-value{font-family:'JetBrains Mono',monospace;font-size:12px;margin-left:auto}
        
        .merge-actions{display:flex;gap:10px;margin-top:8px}
        .merge-actions .btn-back{flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text)}
        .merge-actions .btn-back:hover{background:var(--border-hover)}
        .btn-merge{flex:2;padding:12px;background:#22c55e;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn-merge:hover{background:#16a34a}
        
        .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle}
        @keyframes spin{to{transform:rotate(360deg)}}
        
        .btn-pri:disabled{opacity:0.7;cursor:wait}
        
        .btn-sec{width:100%;padding:11px;background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#fafafa;font-weight:500;font-size:13px;cursor:pointer}
        .btn-sec:hover{background:#3f3f46}
        
        .hdr-btn-icon{width:14px;height:14px;display:inline-flex;align-items:center;vertical-align:middle;margin-right:4px}
        .hdr-btn-icon svg{width:14px;height:14px}
        
        /* Review Badge */
        .review-badge{display:inline-flex;align-items:center;margin-left:8px;padding:2px 6px;background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);border-radius:4px;font-size:9px;color:#f59e0b;font-weight:500}
        .review-badge-icon{width:12px;height:12px;margin-right:3px;display:inline-flex;align-items:center}
        .review-badge-icon svg{width:12px;height:12px}
        
        /* Field Review Indicator in Stammdaten */
        .field-review{position:relative}
        .field-review{position:relative;border-color:#f59e0b}
        .review-banner{display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;margin-bottom:14px;flex-wrap:wrap}
        .review-banner-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center}
        .review-banner-icon svg{width:32px;height:32px}
        .review-banner-text{flex:1;font-size:13px;min-width:200px}
        .review-banner-text strong{color:#f59e0b;display:block}
        .review-banner-text span{color:#a1a1aa}
        .review-banner-actions{display:flex;gap:8px}
        .btn-review-done{padding:6px 12px;background:#22c55e;border:none;border-radius:5px;color:#fff;font-size:11px;font-weight:600;cursor:pointer}
        .btn-review-done:hover{background:#16a34a}
        .btn-review-delete{padding:6px 12px;background:#ef4444;border:none;border-radius:5px;color:#fff;font-size:11px;font-weight:600;cursor:pointer}
        .btn-review-delete:hover{background:#dc2626}
        
        /* Export View Styles */
        .yr-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .btn-export{margin-left:auto;display:flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(99,102,241,0.1);border:1px solid #6366f1;border-radius:6px;color:#6366f1;font-size:12px;font-weight:500;cursor:pointer}
        .btn-export:hover{background:rgba(99,102,241,0.2)}
        .btn-export-icon{width:16px;height:16px}
        
        .export-view{background:#18181b;border:1px solid #27272a;border-radius:10px;overflow:hidden}
        .export-header{padding:20px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);text-align:center}
        .export-header h2{font-size:16px;margin-bottom:4px}
        .export-header p{font-size:12px;opacity:0.8}
        
        .export-section{padding:16px 20px;border-bottom:1px solid #27272a}
        .export-section h3{font-size:13px;font-weight:600;color:#6366f1;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px}
        .export-section.summary{background:rgba(99,102,241,0.05)}
        
        .export-table{width:100%;border-collapse:collapse;font-size:12px}
        .export-table th{text-align:left;padding:6px 8px;background:#27272a;color:#71717a;font-size:10px;text-transform:uppercase;font-weight:600}
        .export-table td{padding:6px 8px;border-bottom:1px solid #27272a}
        .export-table td.val{text-align:right;font-family:'JetBrains Mono',monospace;white-space:nowrap}
        .export-table td.note{color:#71717a;font-size:10px;padding-left:12px}
        .export-table td.neg{color:#ef4444}
        .export-table td.empty-note{color:#52525b;font-style:italic;text-align:center;padding:12px}
        .export-table tr.hl td{background:rgba(99,102,241,0.1);font-weight:600;border-top:1px solid #6366f1}
        .export-table tr.hl.pos td{background:rgba(34,197,94,0.1);border-top-color:#22c55e}
        .export-table tr.hl.neg td{background:rgba(239,68,68,0.1);border-top-color:#ef4444}
        .export-table tr.hl.accent td{background:#6366f1;color:#fff}
        .export-table tr.sub td{background:#27272a;font-weight:500}
        
        .export-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .export-col{background:#27272a;border-radius:8px;padding:12px;overflow:hidden}
        .export-col .export-table td{border-color:#3f3f46}
        
        .export-footer{margin-top:16px;padding:12px;background:#27272a;border-radius:8px;text-align:center;font-size:13px}
        .export-footer .pos{color:#22c55e}
        .export-footer .neg{color:#ef4444}
        
        .export-actions{display:flex;gap:10px;padding:16px 20px;background:#0f0f11;flex-wrap:wrap}
        .btn-print{flex:1;padding:12px;background:#6366f1;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;min-width:140px}
        .btn-print:hover{background:#4f46e5}
        .btn-copy{flex:1;padding:12px;background:#10b981;border:none;border-radius:6px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;min-width:140px}
        .btn-copy:hover{background:#059669}
        .btn-back{flex:1;padding:12px;background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#fafafa;font-weight:500;font-size:13px;cursor:pointer;min-width:100px}
        .btn-back:hover{background:#3f3f46}
        
        .export-hint-small{text-align:center;font-size:11px;color:#71717a;padding:0 20px 16px}
        
        @media print{
          body{background:#fff!important;color:#000!important}
          .hdr,.nav,.export-actions{display:none!important}
          .export-view{border:none;box-shadow:none}
          .export-header{background:#6366f1!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .export-table tr.hl td,.export-table tr.hl.accent td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
        
        @media(max-width:640px){
          .export-cols{grid-template-columns:1fr}
        }
      `}</style>

      <header className="hdr">
        <div className="hdr-in">
          <div className="logo">
            <span className="logo-icon"><IconObjekt color="#6366f1" /></span>
            <span className="logo-text"><span className="logo-immo">Immo</span><span className="logo-hub">Hub</span></span>
            {CloudStatusComponent && <CloudStatusComponent />}
          </div>
          <div className="hdr-acts">
            {(history.length > 0 || redoHistory.length > 0) && (
              <div className="undo-redo-group">
                <button className="undo-btn" onClick={onUndo} disabled={history.length === 0} title="Rückgängig (Strg+Z)">
                  <span className="undo-icon"><IconUndo color="var(--text-muted)" /></span>
                </button>
                <button className="undo-btn" onClick={onRedo} disabled={redoHistory.length === 0} title="Wiederholen (Strg+Y)">
                  <span className="undo-icon"><IconRedo color="var(--text-muted)" /></span>
                </button>
              </div>
            )}
            {curr && !isSaved && <button className="hdr-btn pri" onClick={onSave} disabled={!curr?.stammdaten?.name || Object.keys(validationErrors).length > 0}><span className="btn-icon-sm"><IconSave color="#fff" /></span>Speichern</button>}
            <button className="hdr-btn" onClick={() => setImportModal(true)}><span className="hdr-btn-icon"><IconUpload color="var(--text-muted)" /></span>Import</button>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}>
              <span className="theme-toggle-icon">
                {theme === 'dark' ? <IconSun color="#f59e0b" /> : <IconMoon color="#6366f1" />}
              </span>
            </button>
            {UserMenuComponent && <UserMenuComponent />}
          </div>
        </div>
      </header>

      {/* Auto-Save Indicator */}
      {showAutoSaved && (
        <div className="auto-save-indicator">
          <span className="icon"><IconCheck color="#fff" /></span>
          Automatisch gespeichert
        </div>
      )}

      <nav className="nav">
        <div className="nav-in">
          <button className={`nav-tab-btn ${tab === 'dash' ? 'act' : ''}`} onClick={() => { setTab('dash'); setCurr(null); }}><span className="nav-icon"><IconDashboard color={tab === 'dash' ? '#fff' : 'var(--text-dim)'} /></span>Übersicht</button>
          
          <div className="nav-divider"></div>
          
          <button className="sel-btn bet-sel-btn" onClick={() => setBeteiligteModal(true)}>
            <span className="sel-icon"><IconPerson color="var(--text-muted)" /></span>
            <span className="sel-text">
              {(() => {
                if (aktiveBeteiligte.length === 0) return 'Alle';
                if (aktiveBeteiligte.length === 1) return beteiligte.find(b => b.id === aktiveBeteiligte[0])?.name || 'Unbekannt';
                return `${aktiveBeteiligte.length} ausgewählt`;
              })()}
            </span>
            <span className="sel-arrow">▼</span>
          </button>
          
          <div className="nav-divider"></div>
          
          <div className="nav-immo-select">
            <button className={`sel-btn ${curr && !isSaved ? 'draft' : ''}`} onClick={() => setModal(true)}>
              <span className="sel-icon"><IconObjekt color="var(--text-muted)" /></span>
              <span className="sel-text">
                {curr ? (curr.stammdaten.name || 'Unbenannt') : 'Immobilie wählen...'}
              </span>
              {curr && !isSaved && <span className="draft-tag">Entwurf</span>}
              <span className="sel-arrow">▼</span>
            </button>
            <button className="nav-new-btn" onClick={onNew} title="Neue Immobilie">+</button>
          </div>
          
          {curr && (
            <div className="nav-tabs">
              <button className={tab === 'stamm' ? 'act' : ''} onClick={() => setTab('stamm')}><span className="nav-icon"><IconObjekt color={tab === 'stamm' ? '#fff' : 'var(--text-dim)'} /></span>Stammdaten</button>
              <button className={tab === 'rendite' ? 'act' : ''} onClick={() => setTab('rendite')} disabled={!isSaved}><span className="nav-icon"><IconRendite color={tab === 'rendite' ? '#fff' : 'var(--text-dim)'} /></span>Rendite</button>
              <button className={tab === 'steuer' ? 'act' : ''} onClick={() => setTab('steuer')} disabled={!isSaved}><span className="nav-icon"><IconSteuer color={tab === 'steuer' ? '#fff' : 'var(--text-dim)'} /></span>Steuer</button>
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        {tab === 'dash' ? (
          <Dashboard 
            immobilien={saved} 
            onSelectImmo={(i) => { setCurr({...i}); setTab('stamm'); }} 
            aktiveBeteiligte={aktiveBeteiligte} 
            beteiligte={beteiligte}
            filter={dashFilter}
            onFilterChange={setDashFilter}
            onReorder={(draggedId, targetId) => {
              const draggedIdx = saved.findIndex(i => i.id === draggedId);
              const targetIdx = saved.findIndex(i => i.id === targetId);
              if (draggedIdx !== -1 && targetIdx !== -1) {
                const newSaved = [...saved];
                const [dragged] = newSaved.splice(draggedIdx, 1);
                newSaved.splice(targetIdx, 0, dragged);
                setSaved(newSaved);
                save(newSaved);
              }
            }}
          />
        ) : !curr ? (
          <div className="empty-p">
            <span className="empty-p-icon"><IconHome color="#6366f1" /></span>
            <h2>Keine Immobilie ausgewählt</h2>
            <p>Wähle eine gespeicherte Immobilie oder lege eine neue an.</p>
            <button onClick={() => setModal(true)}>Immobilie wählen</button>
          </div>
        ) : (
          <>
            {tab === 'stamm' && <Stamm p={curr} upd={onUpd} c={c} onSave={onSave} saved={isSaved} onOpenImport={() => setImportModal(true)} onDelete={() => setDeleteConfirm(curr?.id)} onDiscard={() => { setCurr(null); setTab('dash'); }} validationErrors={validationErrors} beteiligte={beteiligte} />}
            {tab === 'rendite' && isSaved && <Rendite p={curr} upd={onUpd} c={c} />}
            {tab === 'steuer' && isSaved && <Steuer p={curr} upd={onUpd} c={c} />}
          </>
        )}
      </main>

      {modal && <Modal items={saved} onSelect={onSelect} onNew={onNew} onClose={() => setModal(false)} onDel={onDel} onOpenImport={() => { setModal(false); setImportModal(true); }} onDuplicate={(i) => {
        const dup = {
          ...JSON.parse(JSON.stringify(i)),
          id: Date.now(),
          saved: false,
          stammdaten: {
            ...i.stammdaten,
            name: i.stammdaten.name + ' (Kopie)'
          }
        };
        setCurr(dup);
        setTab('stamm');
        setModal(false);
      }} />}
      {importModal && <ImportModal onClose={() => setImportModal(false)} onImport={onImport} existingImmo={curr?.saved ? curr : null} />}
      {beteiligteModal && (
        <BeteiligteModal 
          beteiligte={beteiligte}
          aktiveBeteiligte={aktiveBeteiligte}
          onClose={() => setBeteiligteModal(false)}
          onAdd={(b) => setBeteiligte([...beteiligte, b])}
          onDelete={(id) => {
            setBeteiligte(beteiligte.filter(b => b.id !== id));
            setAktiveBeteiligte(aktiveBeteiligte.filter(a => a !== id));
          }}
          onToggle={(id) => {
            if (id === null) {
              // "Alle" geklickt -> leeres Array
              setAktiveBeteiligte([]);
            } else if (aktiveBeteiligte.includes(id)) {
              // Bereits aktiv -> entfernen
              setAktiveBeteiligte(aktiveBeteiligte.filter(a => a !== id));
            } else {
              // Nicht aktiv -> hinzufügen
              setAktiveBeteiligte([...aktiveBeteiligte, id]);
            }
          }}
        />
      )}
      {deleteConfirm && (
        <div className="modal-bg" onClick={() => setDeleteConfirm(null)}>
          <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-content">
              <span className="confirm-icon"><IconTrash color="#ef4444" /></span>
              <h3>Immobilie löschen?</h3>
              <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
              <div className="confirm-btns">
                <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
                <button className="btn-delete" onClick={confirmDelete}>Löschen</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showOnboarding && (
        <OnboardingTour onComplete={completeOnboarding} />
      )}
      
      {/* Toast Notification */}
      <Toast toast={toast} />
    </div>
  );
}

// ============================================================================
// AUTH SCREENS & CLOUD COMPONENTS
// ============================================================================

// Cloud Status Component
const CloudStatus = ({ status }) => {
  const getDisplay = () => {
    switch (status) {
      case "saving": return { text: "Speichert...", color: "#f59e0b", icon: "⟳" };
      case "saved": return { text: "Gespeichert", color: "#22c55e", icon: "✓" };
      case "error": return { text: "Fehler", color: "#ef4444", icon: "✗" };
      default: return { text: "", color: "transparent", icon: "" };
    }
  };
  const d = getDisplay();
  return (
    <span style={{ marginLeft: "12px", fontSize: "11px", color: d.color, display: "flex", alignItems: "center", gap: "4px" }}>
      <span style={{ fontSize: "13px" }}>{d.icon}</span> {d.text}
    </span>
  );
};

// User Menu Component
const UserMenu = ({ user, onSignOut }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px",
          background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px",
          color: "var(--text)", fontSize: "13px", cursor: "pointer"
        }}
      >
        <span style={{
          width: "28px", height: "28px", borderRadius: "50%", background: "#6366f1",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: "600", fontSize: "12px"
        }}>
          {user?.email?.[0]?.toUpperCase() || "?"}
        </span>
        <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user?.email || "Benutzer"}
        </span>
        <span style={{ fontSize: "10px" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: "4px",
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px",
          padding: "8px", minWidth: "160px", zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }}>
          <div style={{ padding: "8px", fontSize: "12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            {user?.email}
          </div>
          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            style={{
              width: "100%", padding: "10px", marginTop: "4px", background: "transparent",
              border: "none", color: "#ef4444", fontSize: "13px", cursor: "pointer",
              textAlign: "left", borderRadius: "4px"
            }}
            onMouseOver={(e) => e.target.style.background = "rgba(239,68,68,0.1)"}
            onMouseOut={(e) => e.target.style.background = "transparent"}
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
};

// Loading Screen
const LoadingScreen = () => (
  <div style={{
    height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#0a0a0f", color: "#fff"
  }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "32px", marginBottom: "16px" }}>🏠</div>
      <div style={{ fontSize: "14px", color: "#888" }}>Laden...</div>
    </div>
  </div>
);

// Auth Screen (Login/Register)
const AuthScreen = () => {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    if (mode === "reset") {
      const { error } = await resetPassword(email);
      setLoading(false);
      if (error) setError(error.message);
      else setMessage("E-Mail zum Zurücksetzen wurde gesendet!");
      return;
    }
    const { error } = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) setError(error.message);
    else if (mode === "register") setMessage("Registrierung erfolgreich! Du kannst dich jetzt anmelden.");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "8px" }}>🏠</div>
          <h1 style={{ fontSize: "28px", color: "#fff", margin: "0 0 4px" }}>
            <span>Immo</span><span style={{ color: "#6366f1" }}>Hub</span>
          </h1>
          <p style={{ color: "#888", fontSize: "14px" }}>Dein Immobilien-Portfolio</p>
        </div>
        <div style={{ background: "#111118", border: "1px solid #2a2a3a", borderRadius: "12px", padding: "24px" }}>
          <h2 style={{ color: "#fff", fontSize: "18px", marginBottom: "20px", textAlign: "center" }}>
            {mode === "login" ? "Anmelden" : mode === "register" ? "Registrieren" : "Passwort zurücksetzen"}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", color: "#888", fontSize: "12px", marginBottom: "6px" }}>E-Mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                style={{ width: "100%", padding: "12px", background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: "8px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            {mode !== "reset" && (
              <div style={{ marginBottom: "16px", position: "relative" }}>
                <label style={{ display: "block", color: "#888", fontSize: "12px", marginBottom: "6px" }}>Passwort</label>
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required
                  style={{ width: "100%", padding: "12px", paddingRight: "44px", background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: "8px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: "12px", top: "32px", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "16px" }}>
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            )}
            {error && <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px", padding: "10px", background: "rgba(239,68,68,0.1)", borderRadius: "6px" }}>{error}</div>}
            {message && <div style={{ color: "#22c55e", fontSize: "13px", marginBottom: "16px", padding: "10px", background: "rgba(34,197,94,0.1)", borderRadius: "6px" }}>{message}</div>}
            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "12px", background: "#6366f1", border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "..." : mode === "login" ? "Anmelden" : mode === "register" ? "Registrieren" : "Link senden"}
            </button>
          </form>
          <div style={{ marginTop: "16px", textAlign: "center" }}>
            {mode === "login" && (
              <>
                <button onClick={() => setMode("register")} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "13px" }}>Noch kein Konto? Registrieren</button>
                <br />
                <button onClick={() => setMode("reset")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "12px", marginTop: "8px" }}>Passwort vergessen?</button>
              </>
            )}
            {mode !== "login" && (
              <button onClick={() => setMode("login")} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "13px" }}>Zurück zur Anmeldung</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ImmoHub App with Cloud Sync
const ImmoHubApp = () => {
  const { user, signOut } = useAuth();
  const [portfolioId, setPortfolioId] = useState(null);
  const [immobilien, setImmobilien] = useState([]);
  const [beteiligte, setBeteiligte] = useState([]);
  const [cloudStatus, setCloudStatus] = useState("saved");
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef(null);

  // Load portfolio on mount
  useEffect(() => {
    if (!user) return;
    loadPortfolio();
  }, [user]);

  const loadPortfolio = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("portfolios").select("*").eq("user_id", user.id).single();
    if (data) {
      setPortfolioId(data.id);
      setImmobilien(data.data?.immobilien || []);
      setBeteiligte(data.data?.beteiligte || []);
    } else if (!error || error.message?.includes("no rows")) {
      // Create new portfolio
      const { data: newData } = await supabase.from("portfolios").insert({ user_id: user.id, name: "Mein Portfolio", data: { immobilien: [], beteiligte: [] } }).select().single();
      if (newData) setPortfolioId(newData.id);
    }
    setLoading(false);
  };

  const savePortfolio = async (newImmobilien, newBeteiligte) => {
    if (!portfolioId) return;
    setCloudStatus("saving");
    const { error } = await supabase.from("portfolios").update({ data: { immobilien: newImmobilien, beteiligte: newBeteiligte }, updated_at: new Date().toISOString() }).eq("id", portfolioId).select().single();
    setCloudStatus(error ? "error" : "saved");
  };

  const handleDataChange = (newImmobilien, newBeteiligte) => {
    setImmobilien(newImmobilien);
    setBeteiligte(newBeteiligte);
    // Debounced save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => savePortfolio(newImmobilien, newBeteiligte), 1500);
  };

  if (loading) return <LoadingScreen />;

  return (
    <ImmoHubCore
      initialData={immobilien}
      initialBeteiligte={beteiligte}
      onDataChange={handleDataChange}
      UserMenuComponent={() => <UserMenu user={user} onSignOut={signOut} />}
      CloudStatusComponent={() => <CloudStatus status={cloudStatus} />}
    />
  );
};

// Export default with Auth wrapper
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  return <ImmoHubApp />;
}
