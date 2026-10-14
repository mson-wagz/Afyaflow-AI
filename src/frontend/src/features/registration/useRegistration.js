import { useState, useEffect, useCallback, useContext } from 'react';
import {
  validatePatientRegistration,
  validateObservationData,
  generateSubmissionIdempotencyKey,
  OBSERVATION_UNITS,
} from '../../../../shared/contracts/patient.js';
import { apiRegisterPatient } from './apiAdapter';

import { SyncContext } from '../../offline/SyncContext.jsx';

const REGISTRATION_DRAFT_KEY = 'afyaflow_patient_reg_draft_v1';

export default function useRegistration(currentStaff) {
  const sync = useContext(SyncContext);
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem(REGISTRATION_DRAFT_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      name: '',
      age: '',
      gender: 'Female',
      presentingComplaint: '',
      systolicBp: '',
      diastolicBp: '',
      heartRate: '',
      respiratoryRate: '',
      temperature: '',
      spO2: '',
      avpu: 'Alert',
      mobility: 'Walking normally',
    };
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [missingObservations, setMissingObservations] = useState([]);
  const [submissionStatus, setSubmissionStatus] = useState('idle'); // idle | submitting | confirmed | duplicate | error
  const [submittedRecord, setSubmittedRecord] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateSubmissionIdempotencyKey('new_reg'));

  // Save draft on change
  useEffect(() => {
    try {
      if (['confirmed','duplicate','pending'].includes(submissionStatus)) localStorage.removeItem(REGISTRATION_DRAFT_KEY);
      else localStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(formData));
    } catch {
      // ignore
    }
  }, [formData, submissionStatus]);

  const handleChange = (field, value) => {
    if (['confirmed','duplicate','pending'].includes(submissionStatus)) {
      setSubmissionStatus('idle'); setSubmittedRecord(null);
      setIdempotencyKey(generateSubmissionIdempotencyKey('new_reg'));
    }
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      return updated;
    });

    // Clear individual error
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = useCallback(() => {
    const patientValidation = validatePatientRegistration(formData);
    const obsValidation = validateObservationData(formData);

    const mergedErrors = {
      ...patientValidation.errors,
      ...obsValidation.errors,
    };

    setValidationErrors(mergedErrors);
    setMissingObservations(obsValidation.missingFields);

    return {
      isValid: Object.keys(mergedErrors).length === 0,
      errors: mergedErrors,
      missingFields: obsValidation.missingFields,
    };
  }, [formData]);

  const submitRegistration = async () => {
    if (submissionStatus === 'submitting') return false;
    const { isValid } = validate();
    if (!isValid) {
      setSubmissionStatus('error');
      setErrorMessage('Please correct validation errors before submitting.');
      return false;
    }

    setSubmissionStatus('submitting');
    setErrorMessage('');

    try {
      if (sync && !sync.isOnline) {
        sync.queueItem('REGISTRATION_DRAFT', 'Patient Intake: '+formData.name,
          {...formData,staffId:currentStaff?.id}, idempotencyKey);
        setSubmissionStatus('pending');
        return true;
      }
      const result = await apiRegisterPatient(
        {
          ...formData,
          staffId: currentStaff?.id,
        },
        idempotencyKey
      );

      if (result.success) {
        setSubmittedRecord(result.data);
        setSubmissionStatus(result.isDuplicate ? 'duplicate' : 'confirmed');

        // Reset draft storage
        localStorage.removeItem(REGISTRATION_DRAFT_KEY);
        // Keep the submission key until starting or editing another intake.
        return true;
      } else {
        setSubmissionStatus('error');
        setErrorMessage(result.error || 'Submission failed');
        return false;
      }
    } catch {
      setSubmissionStatus('error');
      setErrorMessage('Network or server error during registration');
      return false;
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      gender: 'Female',
      presentingComplaint: '',
      systolicBp: '',
      diastolicBp: '',
      heartRate: '',
      respiratoryRate: '',
      temperature: '',
      spO2: '',
      avpu: 'Alert',
      mobility: 'Walking normally',
    });
    setValidationErrors({});
    setMissingObservations([]);
    setSubmissionStatus('idle');
    setSubmittedRecord(null);
    setErrorMessage('');
    localStorage.removeItem(REGISTRATION_DRAFT_KEY);
    setIdempotencyKey(generateSubmissionIdempotencyKey('new_reg'));
  };

  return {
    formData,
    validationErrors,
    missingObservations,
    submissionStatus,
    submittedRecord,
    errorMessage,
    idempotencyKey,
    handleChange,
    validate,
    submitRegistration,
    resetForm,
    units: OBSERVATION_UNITS,
  };
}
