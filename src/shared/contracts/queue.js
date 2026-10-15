export function sortQueueByApprovedPriority(queueItems = []) {
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
export function calculateWorkloadSnapshot(queueItems, availableNurses) {
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
export function calculateElapsedWaitingTime(arrivalIsoTimestamp) {
    if (!arrivalIsoTimestamp)
        return '0 mins';
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
//# sourceMappingURL=queue.js.map