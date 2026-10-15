import { WorkflowService } from '../../backend/src/modules/workflow.service';
import { Request, Response } from 'express';
import { Database } from '../../backend/src/database/db.js';

const workflowService = new WorkflowService(new Database());

/**
 * GET /api/routing
 * Fetch routing proposals for visits based on approved assessments and department availability.
 */
export const GET = async (req: Request, res: Response) => {
  try {
    const proposals = await workflowService.routing();
    res.status(200).json({ proposals });
  } catch (error) {
    console.error('Error fetching routing proposals:', error);
    res.status(500).json({ error: 'Failed to fetch routing proposals' });
  }
};

/**
 * POST /api/routing/transfer
 * Handle department transfers with clinician approval.
 */
export const POST = async (req: Request, res: Response) => {
  try {
    const staff = req.body.staff; // Replace with actual staff authentication logic
    const key = req.headers['idempotency-key'] as string;

    if (!key) {
      return res.status(400).json({ error: 'Idempotency key is required' });
    }

    const result = await workflowService.transfer(staff, req.body, key);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error processing transfer:', error);

    if (error instanceof Error && error.message) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to process transfer' });
    }
  }
};