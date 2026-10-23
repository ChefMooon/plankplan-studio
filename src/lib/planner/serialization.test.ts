import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, MAX_PROJECT_BYTES, readBoundedProjectInput, serializeCanonical, serializeProjectDocument, utf8ByteLength } from './serialization';

describe('canonical project bytes', () => {
  it('sorts every key lexically, preserves arrays, and counts multibyte text as UTF-8', () => {
    const first={ z:1, '2':'two', '10':'ten', nested:{ b:'é', a:'木' }, list:[2,1] };
    const second={ list:[2,1], nested:{ a:'木', b:'é' }, '10':'ten', '2':'two', z:1 };
    expect(serializeCanonical(first)).toBe('{"10":"ten","2":"two","list":[2,1],"nested":{"a":"木","b":"é"},"z":1}');
    expect(serializeCanonical(first)).toBe(serializeCanonical(second));
    expect(utf8ByteLength(serializeCanonical(first))).toBeGreaterThan(serializeCanonical(first).length);
    expect(serializeCanonical({list:[1,2]})).not.toBe(serializeCanonical({list:[2,1]}));
  });

  it('accepts exact canonical document byte ceilings and rejects overflow', () => {
    const at=(bytes:number)=>({a:'x'.repeat(bytes-8)});
    expect(utf8ByteLength(serializeProjectDocument(at(MAX_PROJECT_BYTES-1)))).toBe(MAX_PROJECT_BYTES-1);
    expect(utf8ByteLength(serializeProjectDocument(at(MAX_PROJECT_BYTES)))).toBe(MAX_PROJECT_BYTES);
    expect(()=>serializeProjectDocument(at(MAX_PROJECT_BYTES+1))).toThrow(/1000000/);
  });

  it('bounds raw input independently from normalized document size', () => {
    expect(readBoundedProjectInput(`${' '.repeat(MAX_IMPORT_BYTES-2)}{}`)).toEqual({});
    expect(()=>readBoundedProjectInput(`${' '.repeat(MAX_IMPORT_BYTES-1)}{}`)).toThrow(/2000000/);
  });
});
