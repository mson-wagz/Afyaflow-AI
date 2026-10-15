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
export declare function sortQueueByApprovedPriority(queueItems?: QueueItem[]): QueueItem[];
export declare function calculateWorkloadSnapshot(queueItems: QueueItem[], availableNurses: number): {
    totalWaiting: number;
    redCount: number;
    orangeCount: number;
    ratio: string;
    isHighLoad: boolean;
    recommendation: string;
};
export declare function calculateElapsedWaitingTime(arrivalIsoTimestamp: string): string;
