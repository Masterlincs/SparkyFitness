import { parseZipArchive, type ZipEntry } from './zipUtils.js';

// Reads cell text from named worksheets of an .xlsx workbook. Values come back
// as the strings Excel stored (shared strings resolved, numbers as written),
// with no formatting, dates or formulas evaluated. Enough for flat data tables
// such as the UK CoFID dataset.

// Row cells by zero-based column; a missing cell is undefined.
export type XlsxRow = Array<string | undefined>;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, value] of tag.matchAll(/([\w:]+)="([^"]*)"/g)) {
    attributes[name] = decodeXml(value);
  }
  return attributes;
}

// Concatenates every <t> run, so rich-text strings read as plain text.
function readTextRuns(xml: string): string {
  let text = '';
  for (const [, run] of xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) {
    text += run;
  }
  return decodeXml(text);
}

function columnIndex(cellRef: string): number {
  let index = 0;
  for (const char of cellRef) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g), ([, si]) =>
    readTextRuns(si)
  );
}

function readSheetRows(xml: string, sharedStrings: string[]): XlsxRow[] {
  const rows: XlsxRow[] = [];
  for (const [, rowTag, rowBody] of xml.matchAll(
    /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
  )) {
    const rowNumber = Number(readAttributes(rowTag).r);
    const row: XlsxRow = [];
    for (const [, cellTag, cellBody] of (rowBody ?? '').matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    )) {
      const { r, t } = readAttributes(cellTag);
      const col = r ? columnIndex(r) : row.length;
      if (!cellBody) continue;
      if (t === 'inlineStr') {
        row[col] = readTextRuns(cellBody);
        continue;
      }
      const raw = /<v>([^<]*)<\/v>/.exec(cellBody)?.[1];
      if (raw === undefined) continue;
      row[col] = t === 's' ? sharedStrings[Number(raw)] : decodeXml(raw);
    }
    rows[
      Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length
    ] = row;
  }
  return Array.from(rows, (row) => row ?? []);
}

/**
 * Returns the rows of each requested worksheet, indexed from row 1 at [0].
 * Throws when the buffer is not a workbook or a requested sheet is missing.
 */
export function readXlsxSheets(
  buffer: Buffer,
  sheetNames: readonly string[]
): Map<string, XlsxRow[]> {
  const entries = new Map<string, ZipEntry>(
    parseZipArchive(buffer).map((entry) => [entry.path, entry])
  );
  const readEntry = (path: string) =>
    entries.get(path)?.getData().toString('utf8');

  const workbookXml = readEntry('xl/workbook.xml');
  const relsXml = readEntry('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) {
    throw new Error('Invalid XLSX workbook: workbook.xml not found');
  }

  const targetsById = new Map<string, string>();
  for (const [tag] of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const { Id, Target } = readAttributes(tag);
    if (Id && Target) targetsById.set(Id, Target);
  }

  const sheetPathByName = new Map<string, string>();
  for (const [tag] of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const attributes = readAttributes(tag);
    const target = targetsById.get(attributes['r:id']);
    if (attributes.name && target) {
      const path = target.startsWith('/')
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, '')}`;
      sheetPathByName.set(attributes.name, path);
    }
  }

  const sharedStrings = readSharedStrings(readEntry('xl/sharedStrings.xml'));
  const result = new Map<string, XlsxRow[]>();
  for (const name of sheetNames) {
    const path = sheetPathByName.get(name);
    const sheetXml = path ? readEntry(path) : undefined;
    if (!sheetXml) {
      throw new Error(`Invalid XLSX workbook: sheet "${name}" not found`);
    }
    result.set(name, readSheetRows(sheetXml, sharedStrings));
  }
  return result;
}
