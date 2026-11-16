import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SignInScreen from './SignInScreen';
import { AuthContext } from './AuthContext';

const renderWith = (signIn) => render(
  <AuthContext.Provider value={{ signIn }}><SignInScreen /></AuthContext.Provider>,
);
const fillCredentials = () => {
  fireEvent.change(screen.getByLabelText(/Staff ID or Staff Number/i), { target: { value: 'STAFF-104' } });
  fireEvent.change(screen.getByLabelText(/6-digit Security PIN/i), { target: { value: '456789' } });
};

describe('administrator sign-in with an authenticator code', () => {
  it('asks for the authenticator code after a correct PIN and resubmits with it', async () => {
    const signIn = vi.fn()
      .mockResolvedValueOnce({ success: false, code: 'MFA_REQUIRED', error: 'Enter the 6-digit code' })
      .mockResolvedValueOnce({ success: true });
    renderWith(signIn);
    expect(screen.queryByLabelText(/Authenticator code/i)).toBeNull();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));

    const codeField = await screen.findByLabelText(/Authenticator code/i);
    expect(signIn).toHaveBeenLastCalledWith('STAFF-104', '456789', undefined);
    // Asking for the code is a normal step, not an error.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(codeField, { target: { value: '287082' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));
    await waitFor(() => expect(signIn).toHaveBeenLastCalledWith('STAFF-104', '456789', '287082'));
  });

  it('clears a rejected code and explains why', async () => {
    const signIn = vi.fn()
      .mockResolvedValueOnce({ success: false, code: 'MFA_REQUIRED' })
      .mockResolvedValueOnce({ success: false, code: 'INVALID_MFA_CODE', error: 'That authenticator code is incorrect or already used.' });
    renderWith(signIn);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));
    const codeField = await screen.findByLabelText(/Authenticator code/i);
    fireEvent.change(codeField, { target: { value: '111222' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));
    expect(await screen.findByText(/incorrect or already used/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Authenticator code/i).value).toBe('');
  });

  it('does not submit a malformed code', async () => {
    const signIn = vi.fn().mockResolvedValueOnce({ success: false, code: 'MFA_REQUIRED' });
    renderWith(signIn);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));
    fireEvent.change(await screen.findByLabelText(/Authenticator code/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Station/i }));
    expect(await screen.findByText(/Enter the 6-digit code from your authenticator app/i)).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
