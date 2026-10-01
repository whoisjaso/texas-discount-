import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { encodeCompletedLink } from '@/lib/documents/customerPortal';
const state=vi.hoisted(()=>({row:{} as Record<string,unknown>,render130:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:state.row,error:null})})})})})}));
vi.mock('@/lib/documents/render130U',()=>({render130UPdf:state.render130}));
import { generatePdf } from '@/lib/documents/pdf-generator';

beforeEach(()=>{state.render130.mockReset();vi.stubEnv('INTERNAL_RENDER_TOKEN','');});
describe('every delivery route gets the original form',()=>{
 it('passes buyer-copy privacy and blank-signature flags into the official 130-U renderer',async()=>{
  state.row={id:'application',document_type:'form130U'};
  state.render130.mockResolvedValue({ok:true,bytes:new Uint8Array([37,80,68,70]),filename:'130-U.pdf'});
  const bytes=await generatePdf({copyLabel:'Buyer Copy',agreementId:'application',includeSignatures:false,stripIdImagery:true});
  expect([...bytes]).toEqual([37,80,68,70]);
  expect(state.render130).toHaveBeenCalledWith('application',{includeSignatures:false,stripIdImagery:true});
 });
 it('renders a new marked rebuilt disclosure directly from the original PDF without an HTML render token',async()=>{
  state.row={id:'disclosure',document_type:'rebuiltDisclosure',completed_link:encodeCompletedLink('rebuiltDisclosure',{officialForm:'ENF-MV-RBLT-DSCLMR',vehicleYear:'2003',vehicleMake:'Honda',vin:'1HGCM82633A004352'},{buyerName:'Avery Collins'},'https://example.test')};
  const bytes=await generatePdf({copyLabel:'Buyer Copy',agreementId:'disclosure',stripIdImagery:true});
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
 });
 it('keeps historical disclosure links on the historical renderer',async()=>{
  state.row={id:'historical',document_type:'rebuiltDisclosure',completed_link:encodeCompletedLink('rebuiltDisclosure',{vehicleYear:'2003'},{buyerName:'Avery Collins'},'https://example.test')};
  await expect(generatePdf({copyLabel:'Buyer Copy',agreementId:'historical'})).rejects.toThrow('INTERNAL_RENDER_TOKEN');
 });
});
