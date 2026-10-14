import { useState, useEffect, useCallback, useId } from 'react';
import {
  validatePatientRegistration,
  validateObservationData,
  generateSubmissionIdempotencyKey,
  OBSERVATION_UNITS,
} from '../../../../shared/contracts/patient.js';
import { apiRegisterPatient } from './apiAdapter';

const REGISTRATION_DRAFT_KEY = 'afyaflow_patient_reg_draft_v1';

export default function useRegistration(currentStaff) {
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
      localStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(formData));
    } catch {
      // ignore
    }
  }, [formData]);

  const handleChange = (field, value) => {
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
    const { isValid, errors } = validate();
    if (!isValid) {
      setSubmissionStatus('error');
      setErrorMessage('Please correct validation errors before submitting.');
      return false;
    }

    setSubmissionStatus('submitting');
    setErrorMessage('');

    try {
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
        // Refresh idempotency key for next patient
        setIdempotencyKey(generateSubmissionIdempotencyKey('new_reg'));
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
