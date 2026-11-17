import { createMockZip } from './mockZip.js';

type MockCell = string | number | null | undefined;

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

// Builds a minimal .xlsx workbook the way Excel stores one: text cells in the
// shared string table, numbers inline, empty cells omitted, sheet files named
// by number and reached through the workbook relationships.
export function createMockXlsx(sheets: Record<string, MockCell[][]>): Buffer {
  const sharedStrings: string[] = [];
  const sharedIndex = new Map<string, number>();
  const stringRef = (text: string) => {
    let index = sharedIndex.get(text);
    if (index === undefined) {
      index = sharedStrings.length;
      sharedStrings.push(text);
      sharedIndex.set(text, index);
    }
    return index;
  };

  const sheetNames = Object.keys(sheets);
  const sheetFiles = sheetNames.map((name, sheetIndex) => {
    const rows = sheets[name]
      .map((cells, rowIndex) => {
        const r = rowIndex + 1;
        const cellXml = cells
          .map((cell, col) => {
            const ref = `${columnName(col)}${r}`;
            if (cell === null || cell === undefined) return '';
            return typeof cell === 'number'
              ? `<c r="${ref}"><v>${cell}</v></c>`
              : `<c r="${ref}" t="s"><v>${stringRef(cell)}</v></c>`;
          })
          .join('');
        return `<row r="${r}">${cellXml}</row>`;
      })
      .join('');
    return {
      name: `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    };
  });

  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames
    .map(
      (name, i) =>
        `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('')}</Relationships>`;
  const shared = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sharedStrings
    .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
    .join('')}</sst>`;

  return createMockZip([
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: rels },
    { name: 'xl/sharedStrings.xml', content: shared },
    ...sheetFiles,
  ]);
}
