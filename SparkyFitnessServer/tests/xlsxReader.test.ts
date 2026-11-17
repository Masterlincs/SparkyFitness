import { describe, expect, it } from 'vitest';
import { readXlsxSheets } from '../utils/xlsxReader.js';
import { createMockZip } from './helpers/mockZip.js';
import { createMockXlsx } from './helpers/mockXlsx.js';

describe('readXlsxSheets', () => {
  it('reads shared strings, numbers and gaps by cell reference', () => {
    const workbook = createMockXlsx({
      Notes: [['ignored']],
      Data: [
        ['Code', 'Name', null, 'Value'],
        [],
        ['13-145', 'Ackee & salt fish', null, 15.2],
      ],
    });

    const rows = readXlsxSheets(workbook, ['Data']).get('Data');

    expect(rows?.[0]).toEqual(['Code', 'Name', undefined, 'Value']);
    expect(rows?.[1]).toEqual([]);
    expect(rows?.[2]).toEqual([
      '13-145',
      'Ackee & salt fish',
      undefined,
      '15.2',
    ]);
  });

  it('reads inline strings, rich text runs and entities', () => {
    const workbook = createMockZip([
      {
        name: 'xl/workbook.xml',
        content:
          '<workbook xmlns:r="r"><sheets><sheet name="S &amp; T" sheetId="1" r:id="rId7"/></sheets></workbook>',
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        content:
          '<Relationships><Relationship Target="/xl/worksheets/sheet9.xml" Id="rId7" Type="worksheet"/></Relationships>',
      },
      {
        name: 'xl/sharedStrings.xml',
        content:
          '<sst><si><r><t>Vitamin </t></r><r><t xml:space="preserve">B12 (&#181;g)</t></r></si></sst>',
      },
      {
        name: 'xl/worksheets/sheet9.xml',
        content:
          '<worksheet><sheetData><row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="inlineStr"><is><t>Tr</t></is></c><c r="AA2" s="3"/></row></sheetData></worksheet>',
      },
    ]);

    const rows = readXlsxSheets(workbook, ['S & T']).get('S & T');

    expect(rows?.[0]).toEqual([]);
    expect(rows?.[1]?.[1]).toBe('Vitamin B12 (µg)');
    expect(rows?.[1]?.[2]).toBe('Tr');
    expect(rows?.[1]?.[26]).toBeUndefined();
  });

  it('throws for a missing sheet or a buffer that is not a workbook', () => {
    const workbook = createMockXlsx({ Data: [['x']] });
    expect(() => readXlsxSheets(workbook, ['Other'])).toThrow(
      'sheet "Other" not found'
    );
    expect(() =>
      readXlsxSheets(createMockZip([{ name: 'a.txt', content: 'a' }]), ['Data'])
    ).toThrow('workbook.xml not found');
  });
});
