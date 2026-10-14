import { useState, useEffect, useCallback } from 'react';
import {
  apiFetchDepartmentSnapshot,
  apiFetchRoutingCandidates,
  apiCommitDepartmentTransfer,
} from './apiAdapter';

export default function useRouting(currentStaff) {
  const [departments, setDepartments] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [deps, cands] = await Promise.all([
        apiFetchDepartmentSnapshot(),
        apiFetchRoutingCandidates(),
      ]);
      setDepartments(deps);
      setCandidates(cands);
      if (cands.length > 0 && !selectedPatientId) {
        setSelectedPatientId(cands[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeCandidate = candidates.find((c) => c.id === selectedPatientId) || candidates[0];

  const handleTransfer = async (departmentId) => {
    if (!activeCandidate || actionInProgress) return;
    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiCommitDepartmentTransfer(currentStaff, {
        patientId: activeCandidate.id,
        departmentId,
        rationale: activeCandidate.proposal?.evidenceRationale,
      });

      if (result.success) {
        setActionSuccess(result.data);
        await loadData();
      } else {
        setActionError(result.error);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionInProgress(false);
    }
  };

  useEffect(() => {
    window.addEventListener('afyaflow-demo-change', loadData);
    window.addEventListener('storage', loadData);
    return () => {
      window.removeEventListener('afyaflow-demo-change', loadData);
      window.removeEventListener('storage', loadData);
    };
  }, [loadData]);

  return {
    departments,
    candidates,
    activeCandidate,
    selectedPatientId,
    setSelectedPatientId,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    handleTransfer,
    clearMessages: () => {
      setActionSuccess(null);
      setActionError(null);
    },
  };
}
