const fields={
  age:{label:'Age',unit:'years',action:'Confirm recorded age from an approved source; do not estimate.'},
  heartRate:{label:'Heart rate',unit:'bpm',action:'Record a measured heart rate in bpm.'},
  systolicBp:{label:'Systolic blood pressure',unit:'mmHg',action:'Record measured systolic blood pressure in mmHg.'},
  respiratoryRate:{label:'Respiratory rate',unit:'/min',action:'Record a measured respiratory rate per minute.'},
  temperature:{label:'Temperature',unit:'°C',action:'Record measured temperature in degrees Celsius.'},
  avpu:{label:'Consciousness (AVPU)',unit:'',action:'Assess and record AVPU directly; do not infer it from the complaint.'},
  diastolicBp:{label:'Diastolic blood pressure',unit:'mmHg'},
  spO2:{label:'Oxygen saturation',unit:'%'},mobility:{label:'Mobility',unit:''},
};
const absent=value=>value===undefined || value===null || value==='';

// Descriptive evidence inventory only: no thresholds, diagnoses, values or priorities are generated.
export function evidenceChecklist({age,vitals={},version,observationId},protocol) {
  const required=['age',...protocol.requiredFields];
  const keys=[...new Set([...required,...Object.keys(fields)])];
  const items=keys.map(key=>{
    const value=key==='age'?age:vitals[key],missing=absent(value);
    const unsupported=key==='age' && !missing && (!Number.isInteger(value) || value<18);
    const index=protocol.requiredFields.indexOf(key);
    return {key,...fields[key],required:required.includes(key),value:missing?null:value,
      status:missing?'MISSING':unsupported?'UNSUPPORTED':'PRESENT',
      action:missing?(fields[key]?.action || 'Record this observation if clinically appropriate.'):
        unsupported?'This fixture does not support this population. Request manual clinical review.':null,
      citation:{protocolId:protocol.id,version:protocol.version,pointer:key==='age'?'#/population':index>=0?`#/requiredFields/${index}`:'#/purpose'}};
  });
  return {observationId,observationVersion:version,protocolId:protocol.id,protocolVersion:protocol.version,
    clinicalValidated:false,supportedPopulation:Number.isInteger(age) && age>=18,
    missingRequired:items.filter(item=>item.required && item.status==='MISSING').map(item=>item.key),
    items};
}
