import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import TriageView from './TriageView';
import {
  calculateSatsScore,
  TRIAGE_PRIORITY,
  CLINICAL_DECISION_TYPES,
} from '../../../../shared/contracts/triage.js';
import {
  apiGetPendingTriageProposals,
  apiSubmitClinicalDecision,
} from './apiAdapter';

describe('Triage & Prioritisation Feature Specification Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('FE-PATIENT-PRIORITISATION-01: Protocol Sourcing & Deterministic Scoring', () => {
    it('calculates deterministic SATS score and assigns Resuscitation / RED priority for high TEWS scores', () => {
      const severeVitals = {
        heartRate: '140', // +3
        systolicBp: '65',  // +3
        respiratoryRate: '36', // +3
        temperature: '39.0', // +1
        avpu: 'Pain', // +3
      };

      const result = calculateSatsScore(severeVitals);
      expect(result.isSufficientEvidence).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(7);
      expect(result.priority.code).toBe('RED');
      expect(result.ruleTriggered).toMatch(/Resuscitation threshold/i);
    });

    it('suppresses automated score and flags missing evidence when core measurements are absent (TRIAGE-02)', () => {
      const incompleteVitals = {
        heartRate: '80',
        // systolicBp, respiratoryRate, temperature absent
      };

      const result = calculateSatsScore(incompleteVitals);
      expect(result.isSufficientEvidence).toBe(false);
      expect(result.score).toBeNull();
      expect(result.priority).toBeNull();
      expect(result.missingEvidence).toContain('Systolic Blood Pressure');
      expect(result.missingEvidence).toContain('Respiratory Rate');
      expect(result.missingEvidence).toContain('Temperature');
    });
  });

  describe('FE-PATIENT-PRIORITISATION-02: Human Clinical Gate & Reason Enforcement', () => {
    it('requires a mandatory clinical justification reason when rejecting or overriding proposals', async () => {
      const clinician = { id: 'STAFF-102', name: 'Dr. Kamau Otieno', role: 'clinician' };

      // Attempt override without reason
      const resultNoReason = await apiSubmitClinicalDecision(clinician, {
        patientId: 'SYN-PT-8821',
        decision: CLINICAL_DECISION_TYPES.OVERRIDE,
        overridePriority: TRIAGE_PRIORITY.RED,
        reason: '', // Empty reason
      });

      expect(resultNoReason.success).toBe(false);
      expect(resultNoReason.error.code).toBe('REASON_REQUIRED');
      expect(resultNoReason.error.message).toMatch(/clinical justification reason/i);

      // Attempt override with valid clinical reason
      const resultWithReason = await apiSubmitClinicalDecision(clinician, {
        patientId: 'SYN-PT-8821',
        decision: CLINICAL_DECISION_TYPES.OVERRIDE,
        overridePriority: TRIAGE_PRIORITY.RED,
        reason: 'Patient deteriorating rapidly with severe respiratory distress.',
      });

      expect(resultWithReason.success).toBe(true);
      expect(resultWithReason.data.simulation).toBe(true);
      expect(resultWithReason.data.decision).toBe('OVERRIDDEN');
    });
  });

  describe('FE-PATIENT-PRIORITISATION-03 & 04: Tool Trace Inspection & Audit Trail', () => {
    it('renders tool trace details when inspector button is clicked', async () => {
      const nurse = { id: 'STAFF-101', name: 'Jane Mwangi, RN', role: 'nurse' };

      render(<TriageView currentStaff={nurse} isClinical={true} />);

      await waitFor(() => {
        expect(screen.getByText(/Kofi Mwangi/i)).toBeInTheDocument();
      });

      const inspectButton = screen.getByRole('button', { name: /Inspect simulated tool trace/i });
      fireEvent.click(inspectButton);

      await waitFor(() => {
        expect(screen.getByText(/MCP Tool Trace Inspector/i)).toBeInTheDocument();
        expect(screen.getByText(/custom_mcp_get_observations/i)).toBeInTheDocument();
        expect(screen.getByText(/custom_mcp_calculate_sats_score/i)).toBeInTheDocument();
      });
    });
  });
});
