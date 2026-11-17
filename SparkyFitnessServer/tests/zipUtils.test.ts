import { describe, expect, it } from 'vitest';
import { parseZipArchive } from '../utils/zipUtils.js';
import { createMockZip } from './helpers/mockZip.js';

describe('zipUtils', () => {
  it('parses stored and deflated zip entries correctly', () => {
    const zipBuf = createMockZip([
      {
        name: 'FOOD NAME.csv',
        content: 'FoodID,FoodDescription\n1,Apple',
        compress: true,
      },
      {
        name: 'readme.txt',
        content: 'Health Canada CNF Archive',
        compress: false,
      },
    ]);

    const entries = parseZipArchive(zipBuf);
    expect(entries).toHaveLength(2);
    expect(entries[0].path).toBe('FOOD NAME.csv');
    expect(entries[0].getData().toString('utf8')).toBe(
      'FoodID,FoodDescription\n1,Apple'
    );
    expect(entries[1].path).toBe('readme.txt');
    expect(entries[1].getData().toString('utf8')).toBe(
      'Health Canada CNF Archive'
    );
  });

  it('throws an error if EOCD signature is missing', () => {
    const invalidBuf = Buffer.from('not a zip file');
    expect(() => parseZipArchive(invalidBuf)).toThrow('Invalid ZIP archive');
  });

  it('throws an error if central directory or local header offsets exceed buffer', () => {
    const validZip = createMockZip([
      {
        name: 'test.csv',
        content: 'hello world',
      },
    ]);
    // Truncate the buffer so the central directory or data offsets exceed buffer length
    const truncatedBuf = validZip.subarray(0, validZip.length - 15);
    expect(() => parseZipArchive(truncatedBuf)).toThrow('Invalid ZIP archive');
  });
});
