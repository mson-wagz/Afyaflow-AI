import { useState, useEffect, useCallback } from 'react';
import { apiFetchDeteriorationCases, apiCommitReassessmentDecision } from './apiAdapter';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

export default function useDeterioration(currentStaff) {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [dismissModalOpen, setDismissModalOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetchDeteriorationCases();
      setCases(data);
      if (data.length > 0 && !selectedCaseId) {
        setSelectedCaseId(data[0].patientId);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const activeCase = cases.find((c) => c.patientId === selectedCaseId) || cases[0];

  const handleEscalate = async () => {
    if (!activeCase || actionInProgress) return;
    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiCommitReassessmentDecision(currentStaff, {
        patientId: activeCase.patientId,
        action: 'ESCALATE',
        reason: 'Confirmed significant vital signs deterioration across observation intervals.',
        targetPriority: TRIAGE_PRIORITY.RED,
      });

      if (result.success) {
        setActionSuccess(result.data);
        await loadCases();
      } else {
        setActionError(result.error);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDismiss = async () => {
    if (!activeCase || actionInProgress) return;
    if (!dismissReason.trim()) {
      setActionError('Dismissal reason is required.');
      return;
    }

    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiCommitReassessmentDecision(currentStaff, {
        patientId: activeCase.patientId,
        action: 'DISMISS',
        reason: dismissReason,
      });

      if (result.success) {
        setActionSuccess(result.data);
        setDismissModalOpen(false);
        setDismissReason('');
        await loadCases();
      } else {
        setActionError(result.error);
      }
    } finally {
      setActionInProgress(false);
    }
  };

  return {
    cases,
    activeCase,
    selectedCaseId,
    setSelectedCaseId,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    dismissModalOpen,
    setDismissModalOpen,
    dismissReason,
    setDismissReason,
    handleEscalate,
    handleDismiss,
    clearMessages: () => {
      setActionSuccess(null);
      setActionError(null);
    },
  };
}
