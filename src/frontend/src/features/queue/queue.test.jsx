import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import QueueView from './QueueView';
import {
  sortQueueByApprovedPriority,
  calculateElapsedWaitingTime,
  calculateWorkloadSnapshot,
} from '../../../../shared/contracts/queue.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

describe('Queue Management Feature Specification Tests', () => {
  describe('FE-QUEUE-MANAGEMENT-01 & 02: Approved Queue Ordering & Elapsed Wait Times', () => {
    it('sorts visits strictly by approved clinical priority and arrival timestamp', () => {
      const mockQueue = [
        {
          id: '1',
          name: 'Green Patient',
          arrivalTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          approvedPriority: TRIAGE_PRIORITY.GREEN,
        },
        {
          id: '2',
          name: 'Red Patient (Immediate)',
          arrivalTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          approvedPriority: TRIAGE_PRIORITY.RED,
        },
        {
          id: '3',
          name: 'Orange Patient',
          arrivalTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          approvedPriority: TRIAGE_PRIORITY.ORANGE,
        },
        {
          id: '4',
          name: 'Unapproved Patient with Proposed Red',
          arrivalTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          approvedPriority: null, // Proposal not yet approved!
          pendingProposal: { priority: TRIAGE_PRIORITY.RED },
        },
      ];

      const sorted = sortQueueByApprovedPriority(mockQueue);

      // RED approved patient MUST be first!
      expect(sorted[0].name).toBe('Red Patient (Immediate)');
      // ORANGE approved patient MUST be second!
      expect(sorted[1].name).toBe('Orange Patient');
      // GREEN approved patient is third!
      expect(sorted[2].name).toBe('Green Patient');
      // Unapproved patient CANNOT leap approved queue ordering (QUEUE-02)
      expect(sorted[3].name).toBe('Unapproved Patient with Proposed Red');
    });

    it('formats elapsed waiting times accurately from ISO timestamps', () => {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      expect(calculateElapsedWaitingTime(fifteenMinsAgo)).toBe('15 mins');

      const twoHoursAgo = new Date(Date.now() - 125 * 60 * 1000).toISOString();
      expect(calculateElapsedWaitingTime(twoHoursAgo)).toBe('2h 5m');
    });
  });

  describe('FE-QUEUE-MANAGEMENT-03: Stale Data & Polling Failure Handling', () => {
    it('visibly presents a stale data banner when polling outage is simulated', async () => {
      render(<QueueView />);

      await waitFor(() => {
        expect(screen.getByRole('button', {name:/Simulate Polling Outage/i})).toBeInTheDocument();
      });

      // Toggle simulated polling outage
      const outageButton = screen.getByRole('button', { name: /Simulate Polling Outage/i });
      fireEvent.click(outageButton);

      await waitFor(() => {
        expect(screen.getByText(/Showing Stale Queue Snapshot/i)).toBeInTheDocument();
        expect(screen.getByText(/Network timeout: Facility API unreachable/i)).toBeInTheDocument();
      });
    });
  });
});
