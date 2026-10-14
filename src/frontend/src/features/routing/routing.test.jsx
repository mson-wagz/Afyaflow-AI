import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoutingView from './RoutingView';
import {
  generateRoutingProposal,
  HOSPITAL_DEPARTMENTS,
} from '../../../../shared/contracts/routing.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';
import { apiCommitDepartmentTransfer } from './apiAdapter';

describe('Department Routing Feature Specification Tests', () => {
  describe('FE-DEPARTMENT-ROUTING-01 & 03: Service Snapshots & Urgency Preservation', () => {
    it('routes approved Red/Orange emergency patients to Emergency / Resus without downgrading urgency (ROUTE-04)', () => {
      const urgentPatient = {
        id: 'PT-99',
        age: 45,
        presentingComplaint: 'Severe acute crushing chest pain',
      };

      const proposal = generateRoutingProposal(urgentPatient, TRIAGE_PRIORITY.ORANGE, HOSPITAL_DEPARTMENTS);

      expect(proposal.isEligible).toBe(true);
      expect(proposal.approvedPriority).toBe('ORANGE');
      expect(proposal.recommendedDepartment.code).toBe('RESUS');
      // Urgency is preserved intact!
      expect(proposal.approvedPriority).not.toBe('GREEN');
    });

    it('routes paediatric patients (< 12y) to Paediatric Outpatient & Triage', () => {
      const childPatient = {
        id: 'PT-CHILD',
        age: 3,
        presentingComplaint: 'High fever, vomiting',
      };

      const proposal = generateRoutingProposal(childPatient, TRIAGE_PRIORITY.YELLOW, HOSPITAL_DEPARTMENTS);
      expect(proposal.recommendedDepartment.code).toBe('PAEDS');
    });

    it('renders urgency preservation notice and department service availability in UI', () => {
      render(<RoutingView currentStaff={{ id: 'STAFF-101', name: 'Jane Mwangi' }} isClinical={true} />);

      expect(screen.getByText(/Facility Department Availability & Capacity Snapshot/i)).toBeInTheDocument();
      expect(screen.getByText(/Clinical Urgency Preservation Policy \(ROUTE-04\)/i)).toBeInTheDocument();
    });
  });

  describe('FE-DEPARTMENT-ROUTING-02: Transfer Authorization & Commitment', () => {
    it('commits patient department transfer with clinician attribution and server acknowledgement', async () => {
      const nurse = { id: 'STAFF-101', name: 'Jane Mwangi, RN', role: 'nurse' };

      const result = await apiCommitDepartmentTransfer(nurse, {
        patientId: 'SYN-PT-8821',
        departmentId: 'DEP-EMERGENCY',
        rationale: 'Confirmed transfer to Resus bay.',
      });

      expect(result.success).toBe(true);
      expect(result.data.serverAcknowledged).toBe(true);
      expect(result.data.department).toMatch(/Emergency/i);
      expect(result.data.clinicianName).toBe(nurse.name);
    });
  });
});
