import { useState, useEffect, useCallback } from 'react';
import {
  apiGetPendingTriageProposals,
  apiSubmitClinicalDecision,
  apiGetTriageDecisionHistory,
} from './apiAdapter';
import { CLINICAL_DECISION_TYPES, TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

export default function useTriage(currentStaff) {
  const [proposals, setProposals] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [decisionHistory, setDecisionHistory] = useState(apiGetTriageDecisionHistory);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeTrace, setActiveTrace] = useState(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [reasonInput, setReasonInput] = useState('');
  const [targetOverridePriority, setTargetOverridePriority] = useState('ORANGE');
  const [decisionCase, setDecisionCase] = useState(null);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetPendingTriageProposals();
      setProposals(data);
      setDecisionHistory(apiGetTriageDecisionHistory());
      if (data.length > 0 && !data.some(p => p.patientId === selectedPatientId)) {
        setSelectedPatientId(data[0].patientId);
      }
    } catch (error) {
      setActionError({code:error.code || 'LOAD_ERROR',message:error.message});
    } finally {
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    loadProposals();
    const timer=setInterval(loadProposals,5000);
    return ()=>clearInterval(timer);
  }, [loadProposals]);

  const activeCase = proposals.find((p) => p.patientId === selectedPatientId) || proposals[0];

  const handleApprove = async () => {
    if (!activeCase || actionInProgress) return;
    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiSubmitClinicalDecision(currentStaff, {
        patientId: activeCase.patientId,
        ...(activeCase.proposalId ? {proposalId:activeCase.proposalId} : {}),
        decision: CLINICAL_DECISION_TYPES.APPROVE,
        reason: 'Confirmed SATS deterministic protocol calculations and clinical discriminators.',
        toolTraceId: activeCase.toolTrace?.runId,
        observationVersion: activeCase.observationVersion,
      });

      if (result.success) {
        setActionSuccess(result.data);
        setDecisionHistory(apiGetTriageDecisionHistory());
        await loadProposals();
      } else {
        setActionError(result.error);
      }
    } catch (error) {
      setActionError({code:'DEMO_STORAGE_ERROR',message:error.message});
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!decisionCase || actionInProgress) return;
    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiSubmitClinicalDecision(currentStaff, {
        patientId: decisionCase.patientId,
        decision: CLINICAL_DECISION_TYPES.REJECT,
        ...(decisionCase.proposalId ? {proposalId:decisionCase.proposalId} : {}),
        observationVersion: decisionCase.observationVersion,
        reason: reasonInput,
        toolTraceId: decisionCase.toolTrace?.runId,
      });

      if (result.success) {
        setActionSuccess(result.data);
        setDecisionHistory(apiGetTriageDecisionHistory());
        setRejectModalOpen(false);
        setReasonInput('');
        await loadProposals();
      } else {
        setActionError(result.error);
      }
    } catch (error) {
      setActionError({code:'DEMO_STORAGE_ERROR',message:error.message});
    } finally {
      setActionInProgress(false);
    }
  };

  const handleOverride = async () => {
    if (!decisionCase || actionInProgress) return;
    setActionInProgress(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await apiSubmitClinicalDecision(currentStaff, {
        patientId: decisionCase.patientId,
        decision: CLINICAL_DECISION_TYPES.OVERRIDE,
        ...(decisionCase.proposalId ? {proposalId:decisionCase.proposalId} : {}),
        observationVersion: decisionCase.observationVersion,
        overridePriority: TRIAGE_PRIORITY[targetOverridePriority],
        reason: reasonInput,
        toolTraceId: decisionCase.toolTrace?.runId,
      });

      if (result.success) {
        setActionSuccess(result.data);
        setDecisionHistory(apiGetTriageDecisionHistory());
        setOverrideModalOpen(false);
        setReasonInput('');
        await loadProposals();
      } else {
        setActionError(result.error);
      }
    } catch (error) {
      setActionError({code:'DEMO_STORAGE_ERROR',message:error.message});
    } finally {
      setActionInProgress(false);
    }
  };

  useEffect(() => {
    window.addEventListener('afyaflow-demo-change', loadProposals);
    window.addEventListener('storage', loadProposals);
    return () => {
      window.removeEventListener('afyaflow-demo-change', loadProposals);
      window.removeEventListener('storage', loadProposals);
    };
  }, [loadProposals]);

  return {
    proposals,
    activeCase,
    selectedPatientId,
    setSelectedPatientId,
    decisionHistory,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    activeTrace,
    setActiveTrace,
    overrideModalOpen,
    decisionCase,
    setOverrideModalOpen: open => {if(open)setDecisionCase(activeCase);setOverrideModalOpen(open);},
    rejectModalOpen,
    setRejectModalOpen: open => {if(open)setDecisionCase(activeCase);setRejectModalOpen(open);},
    reasonInput,
    setReasonInput,
    targetOverridePriority,
    setTargetOverridePriority,
    handleApprove,
    handleReject,
    handleOverride,
    clearMessages: () => {
      setActionSuccess(null);
      setActionError(null);
    },
  };
}
