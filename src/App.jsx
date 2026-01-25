import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from 'react';

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
const SUPABASE_URL = 'https://gcotfldbnuatkewauvhv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb3RmbGRibnVhdGtld2F1dmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzM5ODgsImV4cCI6MjA4NDk0OTk4OH0.OvK6e9owY_zRKsxkcAEHcuVRlcMUvmrMOVez_hmuTcM';

// Simple Supabase Client
const supabase = {
  auth: {
    getSession: async () => {
      const token = localStorage.getItem('sb_access_token');
      const user = localStorage.getItem('sb_user');
      if (token && user) {
        return { data: { session: { access_token: token, user: JSON.parse(user) } }, error: null };
      }
      return { data: { session: null }, error: null };
    },
    
    signUp: async ({ email, password }) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ 
            email, 
            password,
            data: {}
          }),
        });
        const data = await res.json();
        console.log('SignUp Response:', data);
        
        if (data.error || data.msg || data.code) {
          return { data: null, error: { message: data.error_description || data.msg || data.error || 'Registrierung fehlgeschlagen' } };
        }
        
        // Supabase returns user object on successful signup
        if (data.user || data.id) {
          const user = data.user || data;
          // If email confirmation is disabled, we also get tokens
          if (data.access_token) {
            localStorage.setItem('sb_access_token', data.access_token);
            localStorage.setItem('sb_refresh_token', data.refresh_token);
            localStorage.setItem('sb_user', JSON.stringify(user));
          } else {
            // Email confirmation enabled - need to sign in after
            localStorage.setItem('sb_user', JSON.stringify(user));
          }
          return { data: { user }, error: null };
        }
        
        return { data: null, error: { message: 'Unerwartete Antwort vom Server' } };
      } catch (err) {
        console.error('SignUp Error:', err);
        return { data: null, error: { message: err.message } };
      }
    },
    
    signInWithPassword: async ({ email, password }) => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.error || !data.access_token) {
          return { data: null, error: { message: data.error_description || data.msg || 'Anmeldung fehlgeschlagen' } };
        }
        localStorage.setItem('sb_access_token', data.access_token);
        localStorage.setItem('sb_refresh_token', data.refresh_token);
        localStorage.setItem('sb_user', JSON.stringify(data.user));
        return { data, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
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
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.error) {
          return { error: { message: data.error_description || data.error } };
        }
        return { error: null };
      } catch (err) {
        return { error: { message: err.message } };
      }
    },
  },
  
  from: (table) => ({
    select: (columns = '*') => ({
      eq: (column, value) => ({
        single: async () => {
          const token = localStorage.getItem('sb_access_token');
          try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`, {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
              },
            });
            const data = await res.json();
            return { data: data[0] || null, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
        execute: async () => {
          const token = localStorage.getItem('sb_access_token');
          try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`, {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
              },
            });
            const data = await res.json();
            return { data, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
      }),
      execute: async () => {
        const token = localStorage.getItem('sb_access_token');
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${columns}`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            },
          });
          const data = await res.json();
          return { data, error: null };
        } catch (err) {
          return { data: null, error: { message: err.message } };
        }
      },
    }),
    insert: (data) => ({
      select: () => ({
        single: async () => {
          const token = localStorage.getItem('sb_access_token');
          try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(data),
            });
            const result = await res.json();
            if (Array.isArray(result)) {
              return { data: result[0], error: null };
            }
            if (result.error || result.message) {
              return { data: null, error: { message: result.message || result.error } };
            }
            return { data: result, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        },
      }),
    }),
    update: (data) => ({
      eq: (column, value) => ({
        select: () => ({
          single: async () => {
            const token = localStorage.getItem('sb_access_token');
            try {
              const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${token}`,
                  'Prefer': 'return=representation',
                },
                body: JSON.stringify(data),
              });
              const result = await res.json();
              if (Array.isArray(result)) {
                return { data: result[0], error: null };
              }
              return { data: result, error: null };
            } catch (err) {
              return { data: null, error: { message: err.message } };
            }
          },
        }),
      }),
    }),
    delete: () => ({
      eq: async (column, value) => {
        const token = localStorage.getItem('sb_access_token');
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            },
          });
          return { error: null };
        } catch (err) {
          return { error: { message: err.message } };
        }
      },
    }),
  }),
};

// ============================================================================
// AUTH CONTEXT
// ============================================================================
const AuthContext = createContext(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await loadPortfolio(session.user.id);
    }
    setLoading(false);
  };

  const loadPortfolio = async (userId) => {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (data) {
      setPortfolio(data);
    } else if (!error || error.message?.includes('rows returned')) {
      // No portfolio exists, create one
      const { data: newPortfolio } = await supabase
        .from('portfolios')
        .insert({ user_id: userId, name: 'Mein Portfolio', data: { immobilien: [], beteiligte: [] } })
        .select()
        .single();
      setPortfolio(newPortfolio);
    }
  };

  const savePortfolio = async (portfolioData) => {
    if (!portfolio?.id) return;
    
    const { data, error } = await supabase
      .from('portfolios')
      .update({ data: portfolioData })
      .eq('id', portfolio.id)
      .select()
      .single();
    
    if (data) {
      setPortfolio(data);
    }
    return { data, error };
  };

  const signUp = async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    console.log('AuthProvider signUp result:', data, error);
    if (error) return { error };
    
    if (data?.user) {
      // If no access token (email confirmation enabled), try to sign in
      const token = localStorage.getItem('sb_access_token');
      if (!token) {
        // Auto sign-in after registration
        const signInResult = await supabase.auth.signInWithPassword({ email, password });
        if (signInResult.error) {
          return { error: { message: 'Registrierung erfolgreich! Bitte melde dich jetzt an.' } };
        }
      }
      
      setUser(data.user);
      // Create portfolio for new user
      try {
        const { data: newPortfolio, error: portfolioError } = await supabase
          .from('portfolios')
          .insert({ 
            user_id: data.user.id, 
            name: displayName || 'Mein Portfolio', 
            data: { immobilien: [], beteiligte: [] } 
          })
          .select()
          .single();
        console.log('Portfolio created:', newPortfolio, portfolioError);
        if (newPortfolio) {
          setPortfolio(newPortfolio);
        }
      } catch (e) {
        console.error('Portfolio creation error:', e);
      }
    }
    return { data, error: null };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    
    if (data?.user) {
      setUser(data.user);
      await loadPortfolio(data.user.id);
    }
    return { data, error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPortfolio(null);
  };

  const resetPassword = async (email) => {
    return await supabase.auth.resetPasswordForEmail(email);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      portfolio,
      signUp,
      signIn,
      signOut,
      resetPassword,
      savePortfolio,
      loadPortfolio,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ============================================================================
// LOGIN / REGISTER SCREENS
// ============================================================================
const AuthScreen = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const { signIn, signUp, resetPassword } = useAuth();

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        console.log('Attempting login for:', email);
        const { error } = await signIn(email, password);
        if (error) {
          console.error('Login error:', error);
          setError(error.message);
        }
      } else if (mode === 'register') {
        if (password !== passwordConfirm) {
          setError('Passwörter stimmen nicht überein');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Passwort muss mindestens 6 Zeichen lang sein');
          setLoading(false);
          return;
        }
        console.log('Attempting registration for:', email);
        const result = await signUp(email, password, displayName);
        console.log('Registration result:', result);
        if (result.error) {
          setError(result.error.message);
        } else {
          setSuccess('Registrierung erfolgreich!');
        }
      } else if (mode === 'reset') {
        const { error } = await resetPassword(email);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('E-Mail zum Zurücksetzen wurde gesendet (falls das Konto existiert)');
        }
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <h1>ImmoHub</h1>
          <p>Immobilien-Portfolio verwalten</p>
        </div>

        <div className="auth-form">
          <h2>
            {mode === 'login' && 'Anmelden'}
            {mode === 'register' && 'Konto erstellen'}
            {mode === 'reset' && 'Passwort zurücksetzen'}
          </h2>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {mode === 'register' && (
            <div className="auth-field">
              <label>Anzeigename</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z.B. Max Mustermann"
              />
            </div>
          )}

          <div className="auth-field">
            <label>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="auth-field">
              <label>Passwort</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="auth-field">
              <label>Passwort bestätigen</label>
              <div className="password-input-wrapper">
                <input
                  type={showPasswordConfirm ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  tabIndex={-1}
                >
                  {showPasswordConfirm ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <button type="button" className="auth-btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? (
              <span className="auth-spinner"></span>
            ) : (
              <>
                {mode === 'login' && 'Anmelden'}
                {mode === 'register' && 'Registrieren'}
                {mode === 'reset' && 'Link senden'}
              </>
            )}
          </button>

          {mode === 'login' && (
            <>
              <button type="button" className="auth-btn-link" onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}>
                Passwort vergessen?
              </button>
              <div className="auth-divider">
                <span>oder</span>
              </div>
              <button type="button" className="auth-btn-secondary" onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>
                Neues Konto erstellen
              </button>
            </>
          )}

          {mode === 'register' && (
            <button type="button" className="auth-btn-link" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
              ← Zurück zur Anmeldung
            </button>
          )}

          {mode === 'reset' && (
            <button type="button" className="auth-btn-link" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
              ← Zurück zur Anmeldung
            </button>
          )}
        </div>

        <div className="auth-footer">
          <p>Daten werden sicher in der Cloud gespeichert</p>
        </div>
      </div>

      <style>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #09090b 0%, #18181b 100%);
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .auth-card {
          width: 100%;
          max-width: 400px;
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 16px;
          overflow: hidden;
        }
        .auth-header {
          text-align: center;
          padding: 32px 24px 24px;
          background: linear-gradient(180deg, rgba(99,102,241,0.1) 0%, transparent 100%);
        }
        .auth-logo {
          width: 72px;
          height: 72px;
          margin: 0 auto 16px;
          background: rgba(99,102,241,0.15);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: #fafafa;
          margin: 0 0 4px;
        }
        .auth-header p {
          font-size: 14px;
          color: #71717a;
          margin: 0;
        }
        .auth-form {
          padding: 24px;
        }
        .auth-form h2 {
          font-size: 18px;
          font-weight: 600;
          color: #fafafa;
          margin: 0 0 20px;
          text-align: center;
        }
        .auth-field {
          margin-bottom: 16px;
        }
        .auth-field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #a1a1aa;
          margin-bottom: 6px;
        }
        .auth-field input {
          width: 100%;
          padding: 12px 14px;
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          color: #fafafa;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .auth-field input:focus {
          outline: none;
          border-color: #6366f1;
        }
        .auth-field input::placeholder {
          color: #52525b;
        }
        .password-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .password-input-wrapper input {
          padding-right: 44px;
        }
        .password-toggle {
          position: absolute;
          right: 8px;
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          color: #71717a;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .password-toggle:hover {
          background: #3f3f46;
          color: #a1a1aa;
        }
        .auth-btn-primary {
          width: 100%;
          padding: 12px;
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .auth-btn-primary:hover:not(:disabled) {
          background: #4f46e5;
        }
        .auth-btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .auth-btn-secondary {
          width: 100%;
          padding: 12px;
          background: transparent;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          color: #fafafa;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .auth-btn-secondary:hover {
          background: #27272a;
          border-color: #52525b;
        }
        .auth-btn-link {
          width: 100%;
          padding: 8px;
          background: none;
          border: none;
          color: #6366f1;
          font-size: 13px;
          cursor: pointer;
          margin-top: 8px;
        }
        .auth-btn-link:hover {
          text-decoration: underline;
        }
        .auth-divider {
          display: flex;
          align-items: center;
          margin: 20px 0;
          gap: 12px;
        }
        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #27272a;
        }
        .auth-divider span {
          font-size: 12px;
          color: #52525b;
        }
        .auth-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #f87171;
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .auth-success {
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .auth-footer {
          padding: 16px 24px;
          border-top: 1px solid #27272a;
          text-align: center;
        }
        .auth-footer p {
          font-size: 12px;
          color: #52525b;
          margin: 0;
        }
        .auth-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// LOADING SCREEN
// ============================================================================
const LoadingScreen = () => (
  <div className="loading-screen">
    <div className="loading-content">
      <div className="loading-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
      <div className="loading-spinner"></div>
      <p>ImmoHub wird geladen...</p>
    </div>
    <style>{`
      .loading-screen {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #09090b;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .loading-content {
        text-align: center;
      }
      .loading-logo {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: rgba(99,102,241,0.15);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #27272a;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 16px;
      }
      .loading-screen p {
        color: #71717a;
        font-size: 14px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// ============================================================================
// USER HEADER COMPONENT
// ============================================================================
const UserHeader = ({ onLogout }) => {
  const { user, portfolio } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="user-header">
      <div className="user-info" onClick={() => setShowMenu(!showMenu)}>
        <div className="user-avatar">
          {(user?.email?.[0] || 'U').toUpperCase()}
        </div>
        <span className="user-email">{user?.email}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {showMenu && (
        <>
          <div className="user-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="user-menu">
            <div className="user-menu-header">
              <strong>{portfolio?.name || 'Mein Portfolio'}</strong>
              <span>{user?.email}</span>
            </div>
            <div className="user-menu-divider" />
            <button className="user-menu-item" onClick={() => { setShowMenu(false); onLogout(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Abmelden
            </button>
          </div>
        </>
      )}
      <style>{`
        .user-header {
          position: relative;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .user-info:hover {
          border-color: var(--border-hover);
        }
        .user-avatar {
          width: 28px;
          height: 28px;
          background: #6366f1;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
        }
        .user-email {
          font-size: 12px;
          color: var(--text-muted);
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .user-info svg {
          color: var(--text-dim);
        }
        .user-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
        }
        .user-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 220px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          z-index: 100;
          overflow: hidden;
        }
        .user-menu-header {
          padding: 14px 16px;
          background: var(--bg-input);
        }
        .user-menu-header strong {
          display: block;
          font-size: 13px;
          color: var(--text);
          margin-bottom: 2px;
        }
        .user-menu-header span {
          font-size: 11px;
          color: var(--text-dim);
        }
        .user-menu-divider {
          height: 1px;
          background: var(--border);
        }
        .user-menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: none;
          border: none;
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .user-menu-item:hover {
          background: var(--bg-input);
        }
        .user-menu-item svg {
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// MAIN APP WRAPPER
// ============================================================================
const AppWrapper = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <ImmoHubApp />;
};

// ============================================================================
// ORIGINAL APP CODE (with Supabase integration)
// ============================================================================

// Formatierung
const fmt = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtD = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v || 0);
const fmtP = (v) => new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 2 }).format(v || 0);
const fmtPlain = (v) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

// Immobilien-Typ Farben
const TYP_COLORS = {
  etw: { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#818cf8' },
  efh: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399' },
  mfh: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24' },
  gewerbe: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#f472b6' },
  grundstueck: { bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8', text: '#94a3b8' }
};

const TYP_LABELS = {
  etw: 'ETW',
  efh: 'EFH',
  mfh: 'MFH',
  gewerbe: 'GEWERBE',
  grundstueck: 'GRUNDST'
};

const getTypLabel = (typ) => TYP_LABELS[typ] || typ?.toUpperCase() || '';

// Default Immobilie
const createNewImmo = () => ({
  id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
  stammdaten: {
    lfdNr: 1, name: '', adresse: '', eigentuemer: '', typ: 'etw', objektstatus: 'bestand',
    nutzung: 'vermietet', bundesland: 'hessen', kaufdatum: '', verkehrswert: 0, verkehrswertDatum: '',
    wohnungsNr: '', etage: '', kaufpreisImmobilie: 0, kaufpreisStellplatz: 0,
    grundstueckGroesse: 0, bodenrichtwert: 0, teileigentumsanteil: 0,
    wohnflaeche: 0, mieteProQm: 0, mieteStellplatz: 0, anzahlStellplaetze: 1,
    mieteSonderausstattung: 0, kaltmiete: 0, nebenkostenVorauszahlung: 0,
    mieterName: '', mietstatusAktiv: true, mietbeginn: '', mietende: '',
    kaution: 0, kautionErhalten: false, kautionZurueckgezahlt: false,
    maklerProvision: 0, notarkosten: 0, grunderwerbsteuer: 0, mehrkosten: 0,
    afaSatz: 3, baujahr: 2020,
    eigenkapitalAnteil: 20, eigenkapitalBetrag: 0, eigenkapitalHerkunft: 'ersparnis', eigenleistung: 0,
    kfwZuschuss: 0, kfwProgramm: '', bafaFoerderung: 0, landesFoerderung: 0,
    zinssatz: 3.5, tilgung: 2, laufzeit: 30,
    darlehenAbschluss: new Date().toISOString().split('T')[0],
    tilgungsbeginn: new Date().toISOString().split('T')[0],
    sonderausstattung: [], steuersatz: 42,
  },
  rendite: { mietanpassung: 2, kostenProzent: 6, instandhaltung: 12, mietausfall: 4 },
  steuerJahre: {},
});

// Calculations Hook
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
  const jm = ((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12;
  return { kp, nk, ak, gwg, ga, afaBasis, afaGeb, saSumme, afaSA, afaGes: afaGeb + afaSA, jm, mm: jm / 12, rendite: kp > 0 ? jm / kp : 0 };
}, [s]);

// Format helpers
const formatNumber = (num) => {
  if (num === '' || num === null || num === undefined) return '';
  const n = typeof num === 'string' ? parseFloat(num.replace(/\./g, '').replace(',', '.')) : num;
  if (isNaN(n)) return '';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
};

const parseNumber = (str) => {
  if (!str || str === '') return 0;
  const cleaned = str.toString().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const formatDateDE = (isoDate) => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};

const parseDateDE = (deDate) => {
  if (!deDate) return '';
  const separators = /[.\/\-]/;
  const parts = deDate.split(separators);
  if (parts.length !== 3) return deDate;
  let [day, month, year] = parts;
  if (year.length === 2) {
    const currentYear = new Date().getFullYear();
    const century = Math.floor(currentYear / 100) * 100;
    const shortYear = parseInt(year);
    year = shortYear > 50 ? (century - 100 + shortYear).toString() : (century + shortYear).toString();
  }
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ============================================================================
// IMMOHUB MAIN APP
// ============================================================================
function ImmoHubApp() {
  const { signOut, portfolio, savePortfolio } = useAuth();
  
  // Load data from portfolio
  const [immobilien, setImmobilien] = useState(() => {
    return portfolio?.data?.immobilien || [];
  });
  const [beteiligte, setBeteiligte] = useState(() => {
    return portfolio?.data?.beteiligte || [];
  });
  
  const [curr, setCurr] = useState(null);
  const [tab, setTab] = useState('dash');
  const [modal, setModal] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('immoTheme') || 'dark');
  const [aktiveBeteiligte, setAktiveBeteiligte] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'error'
  const [lastSaved, setLastSaved] = useState(null);
  const saveTimeoutRef = useRef(null);

  // Sync data to Supabase when it changes
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    setSaveStatus('saving');
    
    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await savePortfolio({ immobilien, beteiligte });
      if (error) {
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
        setLastSaved(new Date());
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [immobilien, beteiligte]);

  // Theme
  useEffect(() => { 
    localStorage.setItem('immoTheme', theme);
    document.body.className = theme;
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

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

  const onNew = () => {
    const newImmo = createNewImmo();
    newImmo.stammdaten.lfdNr = immobilien.length + 1;
    setCurr(newImmo);
    setTab('stamm');
    setModal(false);
  };

  const onSave = () => {
    if (!curr) return;
    const exists = immobilien.find(i => i.id === curr.id);
    if (exists) {
      setImmobilien(immobilien.map(i => i.id === curr.id ? curr : i));
    } else {
      setImmobilien([...immobilien, curr]);
    }
  };

  const onUpdate = (updated) => {
    setCurr(updated);
    // Auto-save
    const exists = immobilien.find(i => i.id === updated.id);
    if (exists) {
      setImmobilien(immobilien.map(i => i.id === updated.id ? updated : i));
    }
  };

  const onDelete = (id) => {
    setImmobilien(immobilien.filter(i => i.id !== id));
    if (curr?.id === id) {
      setCurr(null);
      setTab('dash');
    }
  };

  const onSelect = (immo) => {
    setCurr(immo);
    setTab('stamm');
    setModal(false);
  };

  // Simple Dashboard
  const totals = useMemo(() => {
    return immobilien.reduce((acc, immo) => {
      const s = immo.stammdaten;
      const kp = (s.kaufpreisImmobilie || 0) + (s.kaufpreisStellplatz || 0);
      const jm = ((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12;
      return {
        count: acc.count + 1,
        kp: acc.kp + kp,
        jm: acc.jm + jm,
        qm: acc.qm + (s.wohnflaeche || 0),
      };
    }, { count: 0, kp: 0, jm: 0, qm: 0 });
  }, [immobilien]);

  return (
    <div className={`app ${theme}`} style={themeVars}>
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>ImmoHub</span>
          </div>
          <div className="save-status">
            {saveStatus === 'saving' && <span className="status-saving">⟳ Speichert...</span>}
            {saveStatus === 'saved' && <span className="status-saved">✓ Gespeichert</span>}
            {saveStatus === 'error' && <span className="status-error">✗ Fehler</span>}
          </div>
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <UserHeader onLogout={signOut} />
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {tab === 'dash' && (
          <div className="dashboard">
            <div className="dash-header">
              <h1>Portfolio-Übersicht</h1>
              <button className="btn-new" onClick={onNew}>
                + Neue Immobilie
              </button>
            </div>

            {/* KPIs */}
            <div className="dash-kpis">
              <div className="kpi-card">
                <span>Immobilien</span>
                <b>{totals.count}</b>
              </div>
              <div className="kpi-card">
                <span>Gesamtwert</span>
                <b>{fmt(totals.kp)}</b>
              </div>
              <div className="kpi-card">
                <span>Jahres-Kaltmiete</span>
                <b className="pos">{fmt(totals.jm)}</b>
              </div>
              <div className="kpi-card">
                <span>Vermietete Fläche</span>
                <b>{totals.qm.toLocaleString('de-DE')} qm</b>
              </div>
            </div>

            {/* Immobilien Liste */}
            {immobilien.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏠</div>
                <h2>Keine Immobilien</h2>
                <p>Füge deine erste Immobilie hinzu</p>
                <button onClick={onNew}>+ Neue Immobilie</button>
              </div>
            ) : (
              <div className="immo-grid">
                {immobilien.map(immo => {
                  const s = immo.stammdaten;
                  const kp = (s.kaufpreisImmobilie || 0) + (s.kaufpreisStellplatz || 0);
                  const jm = ((s.kaltmiete || 0) + (s.mieteStellplatz || 0) + (s.mieteSonderausstattung || 0)) * 12;
                  const rendite = kp > 0 ? jm / kp : 0;
                  
                  return (
                    <div key={immo.id} className="immo-card" onClick={() => onSelect(immo)}>
                      <div className="immo-card-header">
                        <span className="immo-type" style={{ 
                          background: TYP_COLORS[s.typ]?.bg, 
                          borderColor: TYP_COLORS[s.typ]?.border,
                          color: TYP_COLORS[s.typ]?.text 
                        }}>
                          {getTypLabel(s.typ)}
                        </span>
                        <button className="immo-delete" onClick={(e) => { e.stopPropagation(); onDelete(immo.id); }}>×</button>
                      </div>
                      <h3>{s.name || 'Unbenannt'}</h3>
                      <p className="immo-address">{s.adresse || 'Keine Adresse'}</p>
                      <div className="immo-stats">
                        <div><span>Kaufpreis</span><b>{fmt(kp)}</b></div>
                        <div><span>Miete/Mon.</span><b className="pos">{fmt(jm / 12)}</b></div>
                        <div><span>Rendite</span><b>{fmtP(rendite)}</b></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'stamm' && curr && (
          <div className="detail-view">
            <div className="detail-header">
              <button className="btn-back" onClick={() => setTab('dash')}>← Zurück</button>
              <h2>{curr.stammdaten.name || 'Neue Immobilie'}</h2>
            </div>
            <SimpleStammEditor immo={curr} onUpdate={onUpdate} />
          </div>
        )}
      </main>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        .app {
          min-height: 100vh;
          background: var(--bg-app);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }
        
        .save-status {
          font-size: 12px;
        }
        .status-saving { color: #f59e0b; }
        .status-saved { color: #22c55e; }
        .status-error { color: #ef4444; }
        
        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .theme-toggle {
          width: 36px;
          height: 36px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
        }
        
        .app-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 20px;
        }
        
        .dashboard {}
        
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        
        .dash-header h1 {
          font-size: 24px;
          font-weight: 700;
        }
        
        .btn-new {
          padding: 10px 20px;
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-new:hover {
          background: #4f46e5;
        }
        
        .dash-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }
        
        .kpi-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .kpi-card span {
          font-size: 12px;
          color: var(--text-dim);
          text-transform: uppercase;
          display: block;
          margin-bottom: 8px;
        }
        .kpi-card b {
          font-size: 24px;
          font-weight: 700;
        }
        .kpi-card b.pos {
          color: #22c55e;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .empty-state h2 {
          font-size: 20px;
          margin-bottom: 8px;
        }
        .empty-state p {
          color: var(--text-dim);
          margin-bottom: 24px;
        }
        .empty-state button {
          padding: 12px 24px;
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        
        .immo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        
        .immo-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .immo-card:hover {
          border-color: #6366f1;
        }
        
        .immo-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .immo-type {
          font-size: 10px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid;
        }
        
        .immo-delete {
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 18px;
          cursor: pointer;
          border-radius: 4px;
        }
        .immo-delete:hover {
          background: rgba(239,68,68,0.1);
          color: #ef4444;
        }
        
        .immo-card h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .immo-address {
          font-size: 13px;
          color: var(--text-dim);
          margin-bottom: 16px;
        }
        
        .immo-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }
        .immo-stats > div {
          text-align: center;
        }
        .immo-stats span {
          font-size: 10px;
          color: var(--text-dim);
          display: block;
          margin-bottom: 4px;
        }
        .immo-stats b {
          font-size: 13px;
          font-family: 'JetBrains Mono', monospace;
        }
        .immo-stats b.pos {
          color: #22c55e;
        }
        
        .detail-view {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }
        
        .detail-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        
        .btn-back {
          padding: 8px 16px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
        }
        .btn-back:hover {
          border-color: var(--border-hover);
        }
        
        .detail-header h2 {
          font-size: 20px;
          font-weight: 600;
        }
        
        .form-section {
          margin-bottom: 24px;
        }
        .form-section h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-field label {
          font-size: 12px;
          color: var(--text-muted);
        }
        .form-field input,
        .form-field select {
          padding: 10px 12px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-size: 14px;
        }
        .form-field input:focus,
        .form-field select:focus {
          outline: none;
          border-color: #6366f1;
        }
        
        .pos { color: #22c55e; }
        .neg { color: #ef4444; }
      `}</style>
    </div>
  );
}

// Simple Stammdaten Editor
const SimpleStammEditor = ({ immo, onUpdate }) => {
  const s = immo.stammdaten;
  
  const set = (field, value) => {
    onUpdate({
      ...immo,
      stammdaten: { ...s, [field]: value }
    });
  };

  return (
    <div className="stamm-editor">
      <div className="form-section">
        <h3>Objekt</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Name</label>
            <input type="text" value={s.name || ''} onChange={e => set('name', e.target.value)} placeholder="z.B. ETW Marburg" />
          </div>
          <div className="form-field">
            <label>Adresse</label>
            <input type="text" value={s.adresse || ''} onChange={e => set('adresse', e.target.value)} placeholder="Straße, PLZ Ort" />
          </div>
          <div className="form-field">
            <label>Typ</label>
            <select value={s.typ || 'etw'} onChange={e => set('typ', e.target.value)}>
              <option value="etw">ETW</option>
              <option value="efh">EFH</option>
              <option value="mfh">MFH</option>
              <option value="gewerbe">Gewerbe</option>
              <option value="grundstueck">Grundstück</option>
            </select>
          </div>
          <div className="form-field">
            <label>Wohnfläche (qm)</label>
            <input type="number" value={s.wohnflaeche || ''} onChange={e => set('wohnflaeche', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Kaufpreis & Kosten</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Kaufpreis Immobilie (€)</label>
            <input type="number" value={s.kaufpreisImmobilie || ''} onChange={e => set('kaufpreisImmobilie', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Kaufpreis Stellplatz (€)</label>
            <input type="number" value={s.kaufpreisStellplatz || ''} onChange={e => set('kaufpreisStellplatz', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Makler (€)</label>
            <input type="number" value={s.maklerProvision || ''} onChange={e => set('maklerProvision', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Notar (€)</label>
            <input type="number" value={s.notarkosten || ''} onChange={e => set('notarkosten', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Grunderwerbsteuer (€)</label>
            <input type="number" value={s.grunderwerbsteuer || ''} onChange={e => set('grunderwerbsteuer', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Miete</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Kaltmiete (€/Monat)</label>
            <input type="number" value={s.kaltmiete || ''} onChange={e => set('kaltmiete', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>NK-Vorauszahlung (€/Monat)</label>
            <input type="number" value={s.nebenkostenVorauszahlung || ''} onChange={e => set('nebenkostenVorauszahlung', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Stellplatz (€/Monat)</label>
            <input type="number" value={s.mieteStellplatz || ''} onChange={e => set('mieteStellplatz', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-field">
            <label>Mieter</label>
            <input type="text" value={s.mieterName || ''} onChange={e => set('mieterName', e.target.value)} placeholder="Name des Mieters" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppWrapper;
