import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeCompletedLink } from '@/lib/documents/customerPortal';
const state=vi.hoisted(()=>({row:{} as Record<string,unknown>,fill:vi.fn(),staff:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({data:table==='document_agreements'?state.row:null,error:null})})})})})}));
vi.mock('@/lib/fill-130u/fill-pdf',()=>({fill130U:state.fill}));
vi.mock('@/lib/actions/staff-signature',()=>({getStaffSignature:state.staff}));
import { render130UPdf } from '@/lib/documents/render130U';
beforeEach(()=>{
 state.fill.mockReset().mockResolvedValue(new Uint8Array([37,80,68,70]));state.staff.mockReset().mockResolvedValue({dataUrl:'data:image/png;base64,STAFF'});
 state.row={id:'application',buyer_id_photo:'data:image/png;base64,ID',completed_link:encodeCompletedLink('form130U',{vehicleVin:'1HGCM82633A004352',vehicleYear:'2003'},{applicantFirstName:'Avery',applicantLastName:'Collins'},'https://example.test',undefined,undefined,'data:image/png;base64,BUYER','2026-09-08')};
});
describe('130-U copy options',()=>{
 it('omits ID imagery and signatures when explicitly requested',async()=>{
  expect((await render130UPdf('application',{stripIdImagery:true,includeSignatures:false})).ok).toBe(true);
  expect(state.fill.mock.calls[0][1]).toEqual({preserveInstructions:true,idPhotoDataUrl:null,staffSignatureDataUrl:null,buyerSignatureDataUrl:null});
  expect(state.staff).not.toHaveBeenCalled();
 });
 it('uses the filed dealer signature without requiring a staff session',async()=>{
  state.row.completed_link=encodeCompletedLink('form130U',{vehicleVin:'1HGCM82633A004352'},{applicantFirstName:'Avery'},'https://example.test','data:image/png;base64,FILED','2026-09-08');
  await render130UPdf('application',{stripIdImagery:true});
  expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBe('data:image/png;base64,FILED');
  expect(state.staff).not.toHaveBeenCalled();
 });
 it('preserves existing signed dealer-copy defaults',async()=>{
  await render130UPdf('application');
  expect(state.fill.mock.calls[0][1]).toEqual({preserveInstructions:true,idPhotoDataUrl:'data:image/png;base64,ID',staffSignatureDataUrl:'data:image/png;base64,STAFF',buyerSignatureDataUrl:'data:image/png;base64,BUYER'});
 });
});
