import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';
import { AuthProvider } from './AuthContext';
import ClinicalReviewPanel from './ClinicalReviewPanel';
import RegistrationDraftPanel from './RegistrationDraftPanel';
import LockScreen from './LockScreen';
import SignInScreen from './SignInScreen';
import {
  SYNTHETIC_STAFF_FIXTURES,
  hasPermission,
  isClinicalRole,
  PERMISSIONS,
  ROLES,
} from '../../../../shared/contracts/auth.js';
import { apiSignIn, apiUnlockSession, apiExecuteClinicalAction } from './apiAdapter';

describe('Staff Access and App Shell Feature Specification Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('FE-APP-SHELL-AND-STAFF-ACCESS-01: Accessible Controls & Responsive Layout', () => {
    it('renders labelled controls and accessible input fields on sign-in screen', () => {
      render(
        <AuthProvider>
          <SignInScreen />
        </AuthProvider>
      );

      const identifierInput = screen.getByLabelText(/Staff ID or Staff Number/i);
      expect(identifierInput).toBeInTheDocument();
      expect(identifierInput).toHaveAttribute('type', 'text');

      const pinInput = screen.getByLabelText(/4-digit Security PIN/i);
      expect(pinInput).toBeInTheDocument();
      expect(pinInput).toHaveAttribute('type', 'password');

      const submitButton = screen.getByRole('button', { name: /Sign In to Station/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('renders header with facility branding, staff info, and lock terminal button', async () => {
      render(<App />);

      expect(screen.getByText(/AfyaFlow AI/i)).toBeInTheDocument();
      expect(screen.getByText(/Kenyatta National Hospital/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Lock shared device terminal/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign out of AfyaFlow AI/i })).toBeInTheDocument();
    });
  });

  describe('FE-APP-SHELL-AND-STAFF-ACCESS-02: Sign-in, Locking & Draft Retention', () => {
    it('authenticates valid synthetic staff fixtures', async () => {
      const nurse = SYNTHETIC_STAFF_FIXTURES[0];
      const result = await apiSignIn(nurse.staffNumber, nurse.pin);

      expect(result.success).toBe(true);
      expect(result.staff.name).toBe(nurse.name);
      expect(result.staff.isClinical).toBe(true);
    });

    it('rejects invalid PIN with descriptive error', async () => {
      const nurse = SYNTHETIC_STAFF_FIXTURES[0];
      const result = await apiSignIn(nurse.staffNumber, '9999');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid 4-digit security PIN/i);
    });

    it('obscures patient data on shared device lock and restores draft upon unlock', async () => {
      render(<App />);

      // Navigate to patient registration draft view
      const regTab = screen.getByRole('button', { name: /Patient Registration/i });
      fireEvent.click(regTab);

      // Enter draft patient information
      const nameInput = screen.getByLabelText(/Patient Full Name/i);
      fireEvent.change(nameInput, { target: { value: 'Amani Wambui' } });

      const complaintInput = screen.getByLabelText(/Presenting Complaint/i);
      fireEvent.change(complaintInput, { target: { value: 'Severe chest pains and fever' } });

      expect(screen.getByDisplayValue('Amani Wambui')).toBeInTheDocument();

      // Click "Lock Terminal"
      const lockButton = screen.getByRole('button', { name: /Lock shared device terminal/i });
      fireEvent.click(lockButton);

      // Verify Lock Screen is displayed and patient data is obscured
      expect(screen.getByText(/Terminal Locked/i)).toBeInTheDocument();
      expect(screen.getByText(/Patient data obscured for shared-device privacy/i)).toBeInTheDocument();
      expect(screen.queryByRole('textbox', {name:/Patient Full Name/i})).not.toBeInTheDocument();

      // Attempt unlock with wrong PIN
      const pinInput = screen.getByLabelText(/Enter 4-digit Staff PIN/i);
      fireEvent.change(pinInput, { target: { value: '0000' } });

      const unlockBtn = screen.getByRole('button', { name: /Unlock Session/i });
      fireEvent.click(unlockBtn);

      await waitFor(() => {
        expect(screen.getByText(/Incorrect PIN/i)).toBeInTheDocument();
      });

      // Unlock with correct PIN (Nurse Jane's PIN is 1234)
      fireEvent.change(pinInput, { target: { value: '1234' } });
      fireEvent.click(unlockBtn);

      // Verify session unlocked and draft patient data preserved intact
      await waitFor(() => {
        expect(screen.queryByText(/Terminal Locked/i)).not.toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('Amani Wambui')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Severe chest pains and fever')).toBeInTheDocument();
    });
  });

  describe('FE-APP-SHELL-AND-STAFF-ACCESS-03: Role-Aware RBAC & Server Permission Errors', () => {
    it('verifies clinical permissions matrix for roles', () => {
      expect(isClinicalRole(ROLES.NURSE)).toBe(true);
      expect(isClinicalRole(ROLES.CLINICIAN)).toBe(true);
      expect(isClinicalRole(ROLES.DOCTOR)).toBe(true);
      expect(isClinicalRole(ROLES.CLERK)).toBe(false);
      expect(isClinicalRole(ROLES.ADMIN)).toBe(false);

      expect(hasPermission(ROLES.NURSE, PERMISSIONS.CLINICAL_APPROVAL)).toBe(true);
      expect(hasPermission(ROLES.CLERK, PERMISSIONS.CLINICAL_APPROVAL)).toBe(false);
      expect(hasPermission(ROLES.ADMIN, PERMISSIONS.CLINICAL_APPROVAL)).toBe(false);
    });

    it('allows clinical staff to commit clinical decisions with server acknowledgement', async () => {
      const clinicalStaff = SYNTHETIC_STAFF_FIXTURES[0]; // Nurse Jane Mwangi
      const response = await apiExecuteClinicalAction(
        clinicalStaff,
        PERMISSIONS.CLINICAL_APPROVAL,
        {
          patientId: 'SYN-PT-8821',
          decision: 'APPROVED',
          reason: 'SATS score verified',
        }
      );

      expect(response.success).toBe(true);
      expect(response.data.serverAcknowledged).toBe(true);
      expect(response.data.clinicianName).toBe(clinicalStaff.name);
      expect(response.data.decision).toBe('APPROVED');
    });

    it('strictly denies non-clinical roles from clinical approval with standard 403 Forbidden payload', async () => {
      const clerkStaff = SYNTHETIC_STAFF_FIXTURES[2]; // Clerk Faith Achieng
      const response = await apiExecuteClinicalAction(
        clerkStaff,
        PERMISSIONS.CLINICAL_APPROVAL,
        {
          patientId: 'SYN-PT-8821',
          decision: 'APPROVED',
        }
      );

      expect(response.success).toBe(false);
      expect(response.error.status).toBe(403);
      expect(response.error.code).toBe('PERMISSION_DENIED');
      expect(response.error.message).toMatch(/Clinical approval authority required/i);
      expect(response.error.details.userRole).toBe(ROLES.CLERK);
    });

    it('displays server permission denial banner when non-clinical user attempts clinical approval in UI', async () => {
      render(<App />);

      // Switch to non-clinical persona: Faith (clerk)
      const clerkButton = screen.getByRole('button', { name: /Faith \(clerk\)/i });
      fireEvent.click(clerkButton);

      await waitFor(() => {
        expect(screen.getAllByText(/Faith Achieng/i).length).toBeGreaterThan(0);
      });

      // Navigate to Triage & Clinical Review
      const triageNav = screen.getByRole('button', { name: /Triage & Prioritisation/i });
      fireEvent.click(triageNav);

      // Verify warning notice is shown by PermissionGate
      expect(await screen.findByText(/Restricted \(Non-Clinical\)/i)).toBeInTheDocument();

      // Click the approve button to trigger server check
      const approveBtn = screen.getByRole('button', { name: /Approve Proposed Priority/i });
      fireEvent.click(approveBtn);

      // Verify the server permission denial alert is visibly rendered
      await waitFor(() => {
        expect(screen.getByText(/Clinical Decision Error \(PERMISSION_DENIED\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Clinical approval authority required/i)).toBeInTheDocument();
      });
    });
  });
});
