import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DeteriorationView from './DeteriorationView';
import {
  compareObservationsForDeterioration,
  calculateObservationAge,
} from '../../../../shared/contracts/deterioration.js';

describe('Deterioration Monitoring Feature Specification Tests', () => {
  describe('FE-DETERIORATION-MONITORING-01: Before/After Delta Analysis', () => {
    it('detects significant deterioration when heart rate escalates by >= 20 bpm and SpO2 drops', () => {
      const baseline = {
        heartRate: '80',
        systolicBp: '120',
        respiratoryRate: '16',
        spO2: '98',
        avpu: 'Alert',
      };

      const deteriorated = {
        heartRate: '118', // +38 bpm
        systolicBp: '90',  // -30 mmHg
        respiratoryRate: '26', // +10 /min
        spO2: '90', // desaturation
        avpu: 'Voice',
      };

      const result = compareObservationsForDeterioration(baseline, deteriorated);
      expect(result.hasDeteriorated).toBe(true);
      expect(result.triggers.length).toBeGreaterThanOrEqual(3);
      expect(result.deltas.heartRate.diff).toBe('+38 bpm');
      expect(result.deltas.systolicBp.diff).toBe('-30 mmHg');
    });

    it('identifies stable observations without false positive triggers', () => {
      const baseline = { heartRate: '72', systolicBp: '120', respiratoryRate: '16', spO2: '98' };
      const repeat = { heartRate: '75', systolicBp: '118', respiratoryRate: '17', spO2: '98' };

      const result = compareObservationsForDeterioration(baseline, repeat);
      expect(result.hasDeteriorated).toBe(false);
      expect(result.triggers.length).toBe(0);
    });
  });

  describe('FE-DETERIORATION-MONITORING-03: Observation Age & No False Continuous Coverage', () => {
    it('calculates observation age in minutes and flags records > 60m as stale', () => {
      const freshTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const freshInfo = calculateObservationAge(freshTimestamp);
      expect(freshInfo.isStale).toBe(false);
      expect(freshInfo.ageMinutes).toBe(15);

      const staleTimestamp = new Date(Date.now() - 75 * 60 * 1000).toISOString();
      const staleInfo = calculateObservationAge(staleTimestamp);
      expect(staleInfo.isStale).toBe(true);
      expect(staleInfo.warningText).toMatch(/Observation Stale/i);
    });

    it('renders disclaimer banner stating software does not provide continuous telemetry (WATCH-03)', () => {
      render(<DeteriorationView currentStaff={{ id: 'STAFF-101', name: 'Jane Mwangi' }} isClinical={true} />);

      expect(screen.getByText(/Nursing Observation-Driven Surveillance Notice/i)).toBeInTheDocument();
      expect(screen.getByText(/does not provide continuous telemetry/i)).toBeInTheDocument();
    });
  });
});
