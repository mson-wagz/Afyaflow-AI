import { Request, Response } from 'express'; // Updated imports for Express
import { Database } from '../../database/db.js';
import {
  QueueItem,
  UpdateQueueRequest,
} from '../../../../shared/contracts/queue.js';

/**
 * Fetch the patient queue.
 */
export async function getQueueHandler(req: Request, res: Response) {
  try {
    const database: Database = req.app.locals.database;

    const queue: QueueItem[] = await database.query(`
      SELECT id, patient_id AS "patientId", arrival_at AS "arrivalTime",
             assessment_status AS "assessmentStatus", approved_priority AS "approvedPriority"
      FROM visits
      WHERE assessment_status != 'rejected'
      ORDER BY approved_priority ASC NULLS LAST, arrival_at ASC
    `);

    const now = Date.now();
    const queueWithWaitingTime = queue.map((item) => ({
      ...item,
      waitingTime: calculateElapsedWaitingTime(item.arrivalTime),
    }));

    res.status(200).json({ queue: queueWithWaitingTime });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ queue: [] });
  }
}

/**
 * Update the queue with approved changes.
 */
export async function updateQueueHandler(req: Request, res: Response) {
  try {
    const database: Database = req.app.locals.database;
    const { id, approvedPriority, assessmentStatus } =
      req.body as UpdateQueueRequest;

    await database.transaction(async (db) => {
      const result = await db.query(
        `UPDATE visits
         SET approved_priority = $1, assessment_status = $2
         WHERE id = $3 AND assessment_status = 'pending'
         RETURNING id`,
        [approvedPriority, assessmentStatus, id],
      );

      if (result.rowCount === 0) {
        throw new Error(
          'No rows updated. Ensure the visit exists and is in "pending" status.',
        );
      }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating queue:', error);
    res.status(500).json({ success: false });
  }
}

/**
 * Calculates elapsed waiting time string from arrival timestamp.
 */
function calculateElapsedWaitingTime(arrivalIsoTimestamp: string): string {
  if (!arrivalIsoTimestamp) return '0 mins';
  const arrival = new Date(arrivalIsoTimestamp).getTime();
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - arrival) / (60 * 1000)));

  if (diffMinutes < 60) {
    return `${diffMinutes} mins`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const remainingMins = diffMinutes % 60;
  return `${hours}h ${remainingMins}m`;
}