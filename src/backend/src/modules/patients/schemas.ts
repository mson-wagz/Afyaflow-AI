import { z } from 'zod';
import {SPEECH_MODEL} from '../../../../shared/contracts/voice.js';
const measurement=(min:number,max:number) => z.preprocess(value => {
  if (value === '' || value === null || value === undefined) return undefined;
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
},z.number().finite().min(min).max(max).optional());
export const vitalsSchema=z.object({
  systolicBp:measurement(40,300),diastolicBp:measurement(20,200),heartRate:measurement(20,260),
  respiratoryRate:measurement(4,80),temperature:measurement(28,45),spO2:measurement(40,100),
  avpu:z.preprocess(v=>v === '' || v === null ? undefined:v,z.enum(['Alert','Voice','Pain','Unresponsive']).optional()),
  mobility:z.preprocess(v=>v === '' || v === null ? undefined:v,z.enum(['Walking normally','Needs assistance to walk','Immobile / Stretcher']).optional()),
});
export const registrationSchema=vitalsSchema.extend({
  name:z.string().trim().min(2).max(100),
  age:z.union([z.number(),z.string().trim().min(1)]).transform(Number).pipe(z.number().int().min(0).max(130)),
  gender:z.enum(['Male','Female','Other']),presentingComplaint:z.string().trim().min(3).max(2000),
  arrivalTime:z.iso.datetime().optional(),staffId:z.string().optional(),
  voiceReview:z.object({method:z.literal('LOCAL_SPEECH_REVIEWED'),language:z.enum(['en','sw']),modelId:z.literal(SPEECH_MODEL.id),
    modelRevision:z.literal(SPEECH_MODEL.revision),reviewed:z.literal(true)}).strict().optional(),
}).strict();
export const observationsSchema=z.object({vitals:vitalsSchema.strict(),expectedVersion:z.number().int().positive()}).strict();
export const decisionSchema=z.object({
  patientId:z.string().min(1),proposalId:z.string().min(1),observationVersion:z.number().int().positive(),
  decision:z.enum(['APPROVED','REJECTED','OVERRIDDEN']),
  overridePriority:z.enum(['RED','ORANGE','YELLOW','GREEN']).nullable().optional(),
  reason:z.string().trim().min(5).max(2000),toolTraceId:z.string().optional(),
}).strict();
export const transferSchema=z.object({patientId:z.string(),departmentId:z.string(),
  assessmentVersion:z.number().int().nonnegative(),departmentVersion:z.number().int().positive(),
  rationale:z.string().trim().min(5).max(2000)}).strict();
