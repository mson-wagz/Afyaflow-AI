import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import RegistrationView from './RegistrationView';
import {
  validatePatientRegistration,
  validateObservationData,
  generateSubmissionIdempotencyKey,
} from '../../../../shared/contracts/patient.js';
import { apiRegisterPatient, apiGetRegisteredVisits } from './apiAdapter';

describe('Patient Registration Feature Specification Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Measurement validation feedback', () => {
    const measurements = {
      name: '', age: '', gender: 'Female', presentingComplaint: '',
      systolicBp: '129', diastolicBp: '75', heartRate: '78',
      respiratoryRate: '18', temperature: '29.2', spO2: '72',
      avpu: 'Voice', mobility: 'Needs assistance to walk',
    };

    function openForm(values) {
      localStorage.setItem('afyaflow_patient_reg_draft_v1', JSON.stringify(values));
      render(<RegistrationView currentStaff={{ id: 'STAFF-101', name: 'Jane Mwangi' }} />);
      fireEvent.click(screen.getByRole('button', { name: /Validate Measurements/i }));
    }

    it('shows success for supported entries without implying clinical normality or registering a visit', () => {
      const initialCount = apiGetRegisteredVisits().length;
      openForm(measurements);
      expect(screen.getByText('Measurement checks passed')).toBeInTheDocument();
      expect(screen.getByText(/does not mean the readings are clinically normal/i)).toBeInTheDocument();
      expect(screen.queryByText(/Patient name is required/i)).not.toBeInTheDocument();
      expect(apiGetRegisteredVisits()).toHaveLength(initialCount);
      fireEvent.change(screen.getByLabelText(/Temperature/i), { target: { value: '37' } });
      expect(screen.queryByText('Measurement checks passed')).not.toBeInTheDocument();
    });

    it('shows out-of-range errors beside the validation button', () => {
      openForm({ ...measurements, heartRate: '320' });
      expect(screen.getByText('Please correct the measurements')).toBeInTheDocument();
      expect(screen.getAllByText(/Heart rate must be between 20 and 260/i)).toHaveLength(2);
      expect(screen.queryByText('Measurement checks passed')).not.toBeInTheDocument();
    });

    it('shows missing readings and unrecorded selections without a success message', () => {
      openForm({ ...measurements, spO2: '', avpu: '', mobility: '' });
      expect(screen.getByText('Measurements are incomplete')).toBeInTheDocument();
      expect(screen.getByText(/Not recorded: SpO2, Consciousness \(AVPU\), Mobility Status/i)).toBeInTheDocument();
      expect(screen.queryByText('Measurement checks passed')).not.toBeInTheDocument();
    });
  });

  describe('FE-PATIENT-REGISTRATION-01: Explicit Missing-Information Validation', () => {
    it('rejects missing patient name and invalid age without guessing values', () => {
      const invalidPatient = {
        name: '',
        age: 'invalid-age',
        gender: '',
        presentingComplaint: '',
      };

      const result = validatePatientRegistration(invalidPatient);
      expect(result.valid).toBe(false);
      expect(result.errors.name).toMatch(/Patient name is required/i);
      expect(result.errors.age).toMatch(/valid age in years/i);
      expect(result.errors.presentingComplaint).toMatch(/Presenting complaint is required/i);
    });

    it('accepts fully valid patient demographic entries', () => {
      const validPatient = {
        name: 'Wanjiru Kamau',
        age: '42',
        gender: 'Female',
        presentingComplaint: 'High fever and persistent dry cough for 3 days',
      };

      const result = validatePatientRegistration(validPatient);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });
  });

  describe('FE-PATIENT-REGISTRATION-02: Observation Units, Timestamps & Field Errors', () => {
    it('detects out-of-range observations with unit-specific field error messages', () => {
      const invalidObs = {
        heartRate: '320', // Out of bounds > 260 bpm
        systolicBp: '30', // Out of bounds < 40 mmHg
        temperature: '50.2', // Out of bounds > 45 °C
        spO2: '120', // Out of bounds > 100%
      };

      const result = validateObservationData(invalidObs);
      expect(result.valid).toBe(false);
      expect(result.errors.heartRate).toMatch(/between 20 and 260 bpm/i);
      expect(result.errors.systolicBp).toMatch(/between 40 and 300 mmHg/i);
      expect(result.errors.temperature).toMatch(/between 28.0 and 45.0 °C/i);
      expect(result.errors.spO2).toMatch(/between 40% and 100%/i);
    });

    it('identifies missing vital measurements explicitly without guessing or inventing numbers', () => {
      const partialObs = {
        heartRate: '88',
        temperature: '37.1',
        // systolicBp, diastolicBp, respiratoryRate, spO2 are absent
      };

      const result = validateObservationData(partialObs);
      expect(result.missingFields).toContain('Systolic BP');
      expect(result.missingFields).toContain('Diastolic BP');
      expect(result.missingFields).toContain('Respiratory Rate');
      expect(result.missingFields).toContain('SpO2');
      expect(result.missingFields).not.toContain('Heart Rate');
    });
  });

  describe('FE-PATIENT-REGISTRATION-03: Retry-Safe Idempotent Submission & Status Flow', () => {
    it('guarantees repeated submissions with same idempotency key do not create duplicate confirmed records', async () => {
      const key = generateSubmissionIdempotencyKey('pt_test_1');
      const intakeData = {
        name: 'Daniel Kiprono',
        age: 29,
        gender: 'Male',
        presentingComplaint: 'Laceration on right hand',
        staffId: 'STAFF-101',
      };

      const initialCount = apiGetRegisteredVisits().length;

      // First submission
      const res1 = await apiRegisterPatient(intakeData, key);
      expect(res1.success).toBe(true);
      expect(res1.isDuplicate).toBe(false);

      const afterFirstCount = apiGetRegisteredVisits().length;
      expect(afterFirstCount).toBe(initialCount + 1);

      // Repeated submission with same idempotency key
      const res2 = await apiRegisterPatient(intakeData, key);
      expect(res2.success).toBe(true);
      expect(res2.isDuplicate).toBe(true);
      expect(res2.data.id).toBe(res1.data.id);

      // Verify no duplicate visit was added to the registry
      const afterSecondCount = apiGetRegisteredVisits().length;
      expect(afterSecondCount).toBe(afterFirstCount);
    });

    it('renders form and displays validation errors when submitting blank inputs', async () => {
      render(<RegistrationView currentStaff={{ id: 'STAFF-101', name: 'Jane Mwangi' }} />);

      const submitButton = screen.getByRole('button', { name: /Confirm & Register Visit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Validation Failed/i)).toBeInTheDocument();
        expect(screen.getByText(/Patient name is required/i)).toBeInTheDocument();
      });
    });
  });
});
