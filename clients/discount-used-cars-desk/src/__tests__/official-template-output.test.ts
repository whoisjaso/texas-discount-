import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { fillOfficialRebuiltDisclosure, officialRebuiltDataFromLink, OFFICIAL_REBUILT_FORM } from '@/lib/documents/official-rebuilt-disclosure';
import { fillVtr61 } from '@/lib/fill-vtr61/fill-pdf';
import { getTemplateSteps, initialTemplateValues, toOfficialRebuiltDisclosureData, toVtr61Request, validateTemplateStep } from '@/lib/documents/template-workflow';
import { type CompletedLinkData } from '@/lib/documents/customerPortal';

function contentStreams(pdf: PDFDocument, index: number): string[] {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs.map(ref => pdf.context.lookup(ref)).filter((item): item is PDFRawStream => item instanceof PDFRawStream).map(item => Buffer.from(item.getContents()).toString('base64'));
}
const vehicle = { vehicleYear:'2003',vehicleMake:'Honda',vehicleModel:'Accord',vehicleVin:'1HGCM82633A004352',vehicleBodyStyle:'Sedan' };
const rebuild = { ...vehicle,ownerName:'Avery Collins',rebuilderIsOwner:'no',rebuilderName:'Bayou Auto Repair',rebuilderStreet:'1200 Repair Lane',rebuilderCity:'Houston',rebuilderState:'TX',rebuilderZip:'77002',workPerformed:'Replaced damaged engine and hood.',dateWorkCompleted:'2026-09-01',partsUsed:'yes',componentsUsed:'engine,hood',part_engine_origin:'Parts Supply, 101 Test St, Houston TX 77002',part_engine_number:'ENG-204',part_engine_donorVin:vehicle.vehicleVin,part_hood_origin:'Body Parts, 202 Test St, Houston TX 77002',part_hood_number:'HD-100' };

describe('original government templates', () => {
  it('fills ENF write-in lines while preserving the original page and every original content stream', async () => {
    const source = await readFile('public/forms/ENF-MV-RBLT-DSCLMR.pdf');
    const original = await PDFDocument.load(source);
    const output = await PDFDocument.load(await fillOfficialRebuiltDisclosure(source, {year:'2003',make:'Honda',vin:vehicle.vehicleVin,buyerName:'Avery Collins'}));
    expect(output.getPageCount()).toBe(1);
    expect(output.getPage(0).getSize()).toEqual(original.getPage(0).getSize());
    for (const stream of contentStreams(original,0)) expect(contentStreams(output,0)).toContain(stream);
    const images = output.context.enumerateIndirectObjects().filter(([,obj])=>obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString()==='/Image');
    const originalImages = original.context.enumerateIndirectObjects().filter(([,obj])=>obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString()==='/Image');
    expect(images).toHaveLength(originalImages.length); // no logos or invented signature
  });
  it('ENF asks only for the state form fields and leaves signing date blank by default', () => {
    const fields = getTemplateSteps('rebuilt-disclosure',{}).flatMap(step=>step.fields.map(f=>f.key));
    expect(fields).toEqual(['vehicleVin','vehicleYear','vehicleMake','buyerName','signatureDate']);
    expect(initialTemplateValues('rebuilt-disclosure').signatureDate).toBe('');
    expect(toOfficialRebuiltDisclosureData({saleDate:'2026-09-01'}).signatureDate).toBe('');
  });
  it('VTR-61 fills the actual owner, rebuilder, work and component fields without certification signatures', async () => {
    const source = await PDFDocument.load(await readFile('public/forms/VTR-61.pdf'));
    const pdf = await PDFDocument.load(await fillVtr61(toVtr61Request(rebuild)));
    expect(pdf.getPageCount()).toBe(source.getPageCount());
    for(let page=0;page<2;page++)for(const stream of contentStreams(source,page))expect(contentStreams(pdf,page)).toContain(stream);
    const form=pdf.getForm();
    expect(form.getTextField('First Name or Entity Name Middle Name Last Name Suffix if any').getText()).toBe('Avery Collins');
    expect(form.getTextField('First Name or Entity Name Middle Name Last Name Suffix if any_2').getText()).toBe('Bayou Auto Repair');
    expect(form.getTextField('Address City State Zip').getText()).toBe('1200 Repair Lane, Houston, TX 77002');
    expect(form.getTextField('Component Part Number requiredEngine').getText()).toBe('ENG-204');
    expect(form.getTextField('Date Work Completed').getText()).toBe('09/01/2026');
    const changed = form.getFields().filter(field=>field.getName().toLowerCase().includes('signature')&&!field.getName().startsWith('Printed Name'));
    for (const field of changed) expect('getText' in field ? (field as {getText():string}).getText() : undefined).toBeFalsy();
  });
  it('omits hidden parts and a previous rebuilder when answers change', () => {
    const values={...rebuild,partsUsed:'no',rebuilderIsOwner:'yes'};
    expect(toVtr61Request(values).parts).toEqual([]);
    expect(toVtr61Request(values).rebuilderName).toBe('Avery Collins');
    expect(toVtr61Request(values).laborStatement).toBe('No component parts were replaced.');
    expect(getTemplateSteps('rebuilt-vehicle-statement',values).some(s=>s.id==='parts'||s.id.startsWith('part-'))).toBe(false);
    expect(getTemplateSteps('rebuilt-vehicle-statement',rebuild).flatMap(s=>Object.values(validateTemplateStep(s,rebuild)))).toEqual([]);
    const bad={...rebuild,componentsUsed:'invented'};
    expect(getTemplateSteps('rebuilt-vehicle-statement',bad).flatMap(s=>Object.values(validateTemplateStep(s,bad)))).not.toEqual([]);
  });
  it('keeps historical signed documents on their historical rendering', () => {
    const legacy:CompletedLinkData={s:'rebuiltDisclosure',dd:{vehicleYear:'2003',vehicleMake:'Honda',vin:vehicle.vehicleVin},cd:{buyerName:'Avery Collins'},bs:'actual-stroke',bsd:'2026-09-08'};
    expect(officialRebuiltDataFromLink(legacy)).toBeNull();
    const marked={...legacy,dd:{...legacy.dd,officialForm:OFFICIAL_REBUILT_FORM}};
    expect(officialRebuiltDataFromLink(marked)?.buyerSignature).toBe('actual-stroke');
    expect(officialRebuiltDataFromLink(marked,false)?.signatureDate).toBe('');
    expect(officialRebuiltDataFromLink(marked,false)?.buyerSignature).toBeUndefined();
  });
});
