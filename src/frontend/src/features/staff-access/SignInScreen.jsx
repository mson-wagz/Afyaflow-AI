import React, { useState } from 'react';
import useAuth from './useAuth';
import { Button, Input, Card, Alert } from '../../components';

/**
 * Staff Sign-In Screen
 * 
 * Fulfills FE-APP-SHELL-AND-STAFF-ACCESS-02:
 * "Build sign-in, session expiry and lock screens from reviewed authentication contracts."
 */
export default function SignInScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Staff identifier is required');
      return;
    }
    if (!pin.trim() || pin.trim().length !== 4) {
      setError('A 4-digit PIN is required');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(identifier, pin);
      if (!result.success) {
        setError(result.error || 'Sign-in failed. Please check your credentials.');
      }
    } catch {
      setError('Network or system error during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: '#0f172a',
      }}
    >
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#f8fafc' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
              fontSize: '2rem',
              marginBottom: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(2, 132, 199, 0.4)',
            }}
          >
            🩺
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>AfyaFlow AI</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            Emergency Triage & Patient Flow Assistant
          </p>
          <div
            style={{
              marginTop: '0.5rem',
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              fontSize: '0.75rem',
              color: '#cbd5e1',
            }}
          >
            Kenyatta National Hospital • Triage Station
          </div>
        </div>

        <Card
          style={{
            backgroundColor: '#ffffff',
            boxShadow: 'var(--shadow-xl)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ padding: '0.5rem 0' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Staff Sign In
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Sign in with your assigned Kenyan facility credentials
            </p>
          </div>

          {error && (
            <Alert variant="danger" onClose={() => setError('')} style={{ marginTop: '1rem' }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <Input
              id="staff-identifier"
              label="Staff ID or Staff Number"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. KNH-NURSE-042 or STAFF-101"
              required
              autoComplete="username"
              hint="Use your assigned hospital staff code"
            />

            <Input
              id="staff-pin"
              label="4-digit Security PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              required
              autoComplete="current-password"
            />

            <div style={{ marginTop: '1.25rem' }}>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                disabled={loading}
              >
                Sign In to Station
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
