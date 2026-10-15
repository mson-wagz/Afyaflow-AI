import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetchQueueData } from './apiAdapter';
import { calculateElapsedWaitingTime } from '../../../../shared/contracts/queue.ts';

export default function useQueue(initialPollInterval = 15000) {
  const [queue, setQueue] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [lastConfirmedSnapshotTime, setLastConfirmedSnapshotTime] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [staleError, setStaleError] = useState('');
  const [loading, setLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [simulatePollingFailure, setSimulatePollingFailure] = useState(false);

  const pollTimerRef = useRef(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetchQueueData(simulatePollingFailure);
      setQueue(data.queue);
      setWorkload(data.workload);
      setLastConfirmedSnapshotTime(data.snapshotTimestamp);
      setIsStale(false);
      setStaleError('');
    } catch (err) {
      // Polling failed: keep last confirmed snapshot visibly stale (QUEUE-04)
      setIsStale(true);
      setStaleError(err.message || 'Connection to queue service failed');
    } finally {
      setLoading(false);
    }
  }, [simulatePollingFailure]);

  useEffect(() => {
    fetchQueue();
    pollTimerRef.current = setInterval(fetchQueue, initialPollInterval);
    return () => clearInterval(pollTimerRef.current);
  }, [fetchQueue, initialPollInterval]);

  const filteredQueue = queue.filter((item) => {
    if (departmentFilter === 'ALL') return true;
    return item.assignedDepartment.toLowerCase().includes(departmentFilter.toLowerCase());
  });

  useEffect(() => {
    window.addEventListener('afyaflow-demo-change', fetchQueue);
    window.addEventListener('storage', fetchQueue);
    return () => {
      window.removeEventListener('afyaflow-demo-change', fetchQueue);
      window.removeEventListener('storage', fetchQueue);
    };
  }, [fetchQueue]);

  return {
    queue: filteredQueue,
    rawQueue: queue,
    workload,
    lastConfirmedSnapshotTime,
    isStale,
    staleError,
    loading,
    departmentFilter,
    setDepartmentFilter,
    simulatePollingFailure,
    setSimulatePollingFailure,
    refreshQueue: fetchQueue,
    getWaitingTime: calculateElapsedWaitingTime,
  };
}
