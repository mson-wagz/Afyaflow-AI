import React, { useState } from 'react';
import useAuth from './useAuth';
import { Button, Input, Badge, Alert } from '../../components';

/**
 * Shared-Device Lock Screen
 * 
 * Fulfills FE-APP-SHELL-AND-STAFF-ACCESS-02 & acceptance criteria:
 * "Locking or session expiry hides patient content and follows the reviewed draft-retention policy."
 */
export default function LockScreen() {
  const {
    staff,
    unlockSession,
    switchAccount,
    lockTimestamp,
    hasDraft,
    localDraft,
  } = useAuth();

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const handleUnlock = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!pin || pin.trim().length !== 4) {
      setError('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const result = await unlockSession(pin.trim());
      if (!result.success) {
        setError(result.error || 'Incorrect PIN');
      } else {
        setPin('');
      }
    } catch {
      setError('An unexpected error occurred during unlock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="lock-screen-container"
      role="region"
      aria-label="Shared terminal lock screen"
    >
      <div className="lock-screen-box">
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(2, 132, 199, 0.2)',
              border: '2px solid var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              marginBottom: '0.75rem',
            }}
          >
            🔒
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Terminal Locked
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Patient data obscured for shared-device privacy
          </p>
          {lockTimestamp && (
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              Locked at {lockTimestamp}
            </p>
          )}
        </div>

        {/* Current staff identity info */}
        {staff && (
          <div
            style={{
              backgroundColor: '#0e1a2b',
              border: '1px solid #1e293b',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              marginBottom: '1.25rem',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: staff.isClinical ? 'var(--color-clinical)' : 'var(--color-admin)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {staff.avatarInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc' }}>
                {staff.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {staff.title} • {staff.department}
              </div>
            </div>
            <Badge variant={staff.isClinical ? 'clinical' : 'admin'}>
              {staff.isClinical ? 'Clinical' : 'Clerical'}
            </Badge>
          </div>
        )}

        {/* Draft retention notice */}
        {hasDraft && (
          <div
            style={{
              backgroundColor: 'rgba(217, 119, 6, 0.15)',
              border: '1px solid rgba(217, 119, 6, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1.25rem',
              fontSize: '0.825rem',
              color: '#fde68a',
              textAlign: 'left',
            }}
          >
            <strong>📝 Local Draft Preserved:</strong> Unsaved input is safely retained
            under this session. Enter your PIN to continue editing.
          </div>
        )}

        {error && (
          <Alert variant="danger" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* PIN unlock form */}
        <form onSubmit={handleUnlock}>
          <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
            <label
              htmlFor="terminal-unlock-pin"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#e2e8f0',
                marginBottom: '0.5rem',
              }}
            >
              Enter 4-digit Staff PIN
            </label>
            <input
              id="terminal-unlock-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              className="form-input"
              style={{
                textAlign: 'center',
                letterSpacing: '0.4em',
                fontSize: '1.5rem',
                padding: '0.6rem',
                backgroundColor: '#0c1524',
                color: '#fff',
                borderColor: '#334155',
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
              Hint for demo: {staff?.pin || '1234'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={loading || pin.length !== 4}
            >
              Unlock Session
            </Button>

            {!confirmSwitch ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => setConfirmSwitch(true)}
                style={{ color: '#cbd5e1', borderColor: '#334155' }}
              >
                Switch Staff User
              </Button>
            ) : (
              <div
                style={{
                  backgroundColor: '#0c1524',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid #334155',
                }}
              >
                <p style={{ fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Switch user? {hasDraft ? 'Your local draft will remain safe.' : ''}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    fullWidth
                    onClick={switchAccount}
                  >
                    Confirm Switch
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => setConfirmSwitch(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
