export interface QueueItem {
  id: string;
  patientId: string;
  arrivalTime: string;
  waitingTime: string;
  assessmentStatus: 'pending' | 'approved' | 'rejected';
  approvedPriority: number | null;
}

export interface GetQueueResponse {
  queue: QueueItem[];
}

export interface UpdateQueueRequest {
  id: string;
  approvedPriority: number;
  assessmentStatus: 'approved' | 'rejected';
}

export interface UpdateQueueResponse {
  success: boolean;
}

export { sortQueueByApprovedPriority, calculateWorkloadSnapshot, calculateElapsedWaitingTime } from './queue-runtime.js';
