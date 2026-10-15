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

/**
 * Sorts queue entries by approved priority and arrival time.
 */
export function sortQueueByApprovedPriority(queueItems: QueueItem[] = []): QueueItem[] {
  return [...queueItems].sort((a, b) => {
    const prioA = a.approvedPriority ?? Number.MAX_SAFE_INTEGER;
    const prioB = b.approvedPriority ?? Number.MAX_SAFE_INTEGER;

    if (prioA !== prioB) {
      return prioA - prioB;
    }

    const timeA = new Date(a.arrivalTime).getTime();
    const timeB = new Date(b.arrivalTime).getTime();
    return timeA - timeB;
  });
}

/**
 * Calculates workload snapshot for the department.
 */
export function calculateWorkloadSnapshot(queueItems: QueueItem[], availableNurses: number) {
  const totalWaiting = queueItems.length;
  const redCount = queueItems.filter((q) => q.approvedPriority === 1).length;
  const orangeCount = queueItems.filter((q) => q.approvedPriority === 2).length;

  const ratio = availableNurses > 0 ? (totalWaiting / availableNurses).toFixed(1) : `${totalWaiting}`;
  const isHighLoad = parseFloat(ratio) > 6 || redCount > 0 || orangeCount >= 3;

  return {
    totalWaiting,
    redCount,
    orangeCount,
    ratio: `${ratio}:1`,
    isHighLoad,
    recommendation: isHighLoad
      ? 'High triage load: Reassign 1 relief nurse to Station 1'
      : 'Workload within normal operational parameters',
  };
}

/**
 * Calculates elapsed waiting time string from arrival timestamp
 * @param arrivalIsoTimestamp ISO timestamp string
 * @returns Elapsed waiting time (e.g., "18 mins" or "1h 12m")
 */
export function calculateElapsedWaitingTime(arrivalIsoTimestamp: string): string {
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