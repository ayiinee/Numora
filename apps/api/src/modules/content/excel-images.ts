import { posix } from 'node:path';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { BadRequestException, HttpException } from '@nestjs/common';

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}
export function excelError(code: string, detail: string): never {
  throw new BadRequestException({ code, detail });
}
export function descendants(node: XmlElement, name: string): XmlElement[] {
  return node.children.flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendants(child, name),
  ]);
}
export function xml(bytes: Buffer, budget = { elements: 0 }): XmlElement {
  const source = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    excelError('EXCEL_XML_INVALID', 'XML declarations are not supported.');
  const root: XmlElement = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', (tag) => {
    if (++budget.elements > 300_000 || stack.length > 64)
      excelError('EXCEL_XML_TOO_LARGE', 'XML is too complex.');
    const node: XmlElement = {
      name: tag.name.split(':').pop()!,
      attrs: tag.attributes,
      children: [],
      text: '',
    };
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  });
  parser.on('text', (value) => {
    stack[stack.length - 1]!.text += value;
  });
  parser.on('cdata', (value) => {
    stack[stack.length - 1]!.text += value;
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('error', () => excelError('EXCEL_XML_INVALID', 'Workbook XML is invalid.'));
  parser.write(source).close();
  return root;
}

// Bound actual expanded bytes before ExcelJS allocates its workbook model.
export async function excelParts(buffer: Buffer): Promise<Map<string, Buffer>> {
  if (buffer.length > 10 * 1024 * 1024)
    throw new HttpException({ code: 'EXCEL_TOO_LARGE', detail: 'Excel exceeds 10 MiB.' }, 413);
  if (buffer.subarray(0, 4).toString('hex') !== '504b0304')
    excelError('EXCEL_FORMAT_INVALID', 'Upload an .xlsx workbook.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return excelError('EXCEL_FORMAT_INVALID', 'Workbook ZIP is invalid or encrypted.');
  }
  const entries = Object.values(zip.files).filter((file) => !file.dir);
  if (entries.length > 2000)
    excelError('EXCEL_TOO_MANY_PARTS', 'Workbook contains too many parts.');
  let expanded = 0;
  const xmlBudget = { elements: 0 };
  const parts = new Map<string, Buffer>();
  for (const file of entries) {
    if (/vbaProject|externalLinks/i.test(file.name))
      excelError(
        'EXCEL_UNSUPPORTED_CONTENT',
        'Macros and external workbook links are not supported.',
      );
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of new Readable().wrap(file.nodeStream())) {
        expanded += chunk.length;
        if (expanded > 50 * 1024 * 1024) {
          throw new HttpException(
            { code: 'EXCEL_EXPANDED_TOO_LARGE', detail: 'Expanded workbook exceeds 50 MiB.' },
            413,
          );
        } else chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      excelError('EXCEL_FORMAT_INVALID', 'Workbook part is damaged.');
    }
    const bytes = Buffer.concat(chunks);
    if (/\.(xml|rels)$/i.test(file.name)) xml(bytes, xmlBudget);
    parts.set(file.name, bytes);
  }
  if (!parts.has('xl/workbook.xml'))
    excelError('EXCEL_FORMAT_INVALID', 'Workbook part is missing.');
  return parts;
}
function relFile(part: string) {
  return posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels');
}
export function relationships(parts: Map<string, Buffer>, part: string): Map<string, string> {
  const bytes = parts.get(relFile(part));
  if (!bytes) return new Map();
  return new Map(
    descendants(xml(bytes), 'Relationship').map((r) => {
      if (r.attrs.TargetMode === 'External')
        excelError('EXCEL_EXTERNAL_MEDIA', 'External media is not supported; embed the picture.');
      const target = r.attrs.Target ?? '';
      const resolved = posix.normalize(
        target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(part), target),
      );
      if (!resolved || resolved.startsWith('../') || !parts.has(resolved))
        excelError('EXCEL_RELATIONSHIP_INVALID', 'Workbook relationship target is missing.');
      return [r.attrs.Id!, resolved];
    }),
  );
}
export interface ExcelImage {
  row: number;
  col: number;
  rowOffset: number;
  colOffset: number;
  bytes: Buffer;
  alt: string;
  mode: 'FLOATING' | 'IN_CELL';
}
function integer(value: string | undefined, minimum = 0): number {
  if (
    !value ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum
  )
    return excelError('EXCEL_IMAGE_METADATA_INVALID', 'Image location metadata is invalid.');
  return Number(value);
}
function child(node: XmlElement, name: string): XmlElement {
  return (
    node.children.find((n) => n.name === name) ??
    excelError('EXCEL_IMAGE_METADATA_INVALID', 'Image metadata is incomplete.')
  );
}
function requiredXml(parts: Map<string, Buffer>, part: string): XmlElement {
  return xml(
    parts.get(part) ??
      excelError('EXCEL_IMAGE_METADATA_INVALID', 'Image relationship data is missing.'),
  );
}

export function sheetImages(parts: Map<string, Buffer>, sheetPart: string): ExcelImage[] {
  const images: ExcelImage[] = [];
  const sheet = requiredXml(parts, sheetPart);
  const sheetRels = relationships(parts, sheetPart);
  for (const drawing of descendants(sheet, 'drawing')) {
    const part =
      sheetRels.get(drawing.attrs['r:id']!) ??
      excelError('EXCEL_IMAGE_METADATA_INVALID', 'Drawing relationship is missing.');
    const drawingRels = relationships(parts, part);
    const tree = requiredXml(parts, part);
    for (const anchor of tree.children.flatMap((r) => r.children)) {
      if (!['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'].includes(anchor.name)) continue;
      const pictures = descendants(anchor, 'pic');
      if (!pictures.length) continue;
      if (anchor.name === 'absoluteAnchor')
        excelError('EXCEL_IMAGE_UNANCHORED', 'Place every picture at a question cell.');
      const from = child(anchor, 'from');
      for (const pic of pictures) {
        const blip = descendants(pic, 'blip')[0];
        const imagePart =
          drawingRels.get(blip?.attrs['r:embed'] ?? '') ??
          excelError('EXCEL_IMAGE_METADATA_INVALID', 'Embedded picture is missing.');
        images.push({
          row: integer(child(from, 'row').text) + 1,
          col: integer(child(from, 'col').text) + 1,
          rowOffset: integer(child(from, 'rowOff').text),
          colOffset: integer(child(from, 'colOff').text),
          bytes: parts.get(imagePart)!,
          alt: descendants(pic, 'cNvPr')[0]?.attrs.descr ?? '',
          mode: 'FLOATING',
        });
      }
    }
  }
  const valueCells = descendants(sheet, 'c').filter((c) => c.attrs.vm);
  if (!valueCells.length) return images;
  // Excel Place in Cell: cell vm -> valueMetadata -> XLRICHVALUE -> rvb ->
  // rich value structure's _rvRel:LocalImageIdentifier -> relationship -> bytes.
  const workbookRels = relationships(parts, 'xl/workbook.xml');
  const richPart = [...workbookRels.values()].find((p) => /\/(?:rd)?richvalue\.xml$/i.test(p));
  const structurePart = [...workbookRels.values()].find((p) => /richvaluestructure\.xml$/i.test(p));
  const relPart = [...workbookRels.values()].find((p) => /richvaluerel\.xml$/i.test(p));
  const metadataPart = [...workbookRels.values()].find((p) => /metadata\.xml$/i.test(p));
  if (!richPart || !structurePart || !relPart || !metadataPart)
    return excelError(
      'EXCEL_IN_CELL_UNSUPPORTED',
      'Place in Cell metadata is incomplete or unsupported.',
    );
  const metadata = requiredXml(parts, metadataPart);
  const types = descendants(metadata, 'metadataType');
  const valueMetadata = descendants(metadata, 'valueMetadata')[0];
  const future = descendants(metadata, 'futureMetadata').find(
    (f) => f.attrs.name === 'XLRICHVALUE',
  );
  const values = descendants(requiredXml(parts, richPart), 'rv');
  const structures = descendants(requiredXml(parts, structurePart), 's');
  const richRels = descendants(requiredXml(parts, relPart), 'rel');
  const targets = relationships(parts, relPart);
  for (const cell of valueCells) {
    const block = valueMetadata?.children[integer(cell.attrs.vm, 1) - 1];
    const record = block?.children.find(
      (r) => r.name === 'rc' && types[integer(r.attrs.t, 1) - 1]?.attrs.name === 'XLRICHVALUE',
    );
    const futureBlock = record && future?.children[integer(record.attrs.v)];
    const rvb = futureBlock && descendants(futureBlock, 'rvb')[0];
    const value = rvb && values[integer(rvb.attrs.i)];
    const structure = value && structures[integer(value.attrs.s)];
    const keys = structure?.children.filter((k) => k.name === 'k') ?? [];
    const imageIndex = keys.findIndex((k) => k.attrs.n === '_rvRel:LocalImageIdentifier');
    if (!value || imageIndex < 0)
      return excelError(
        'EXCEL_IN_CELL_UNSUPPORTED',
        'Only embedded local Place in Cell images are supported.',
      );
    const fields = value.children.filter((v) => v.name === 'v');
    const rel = richRels[integer(fields[imageIndex]?.text)];
    const target = rel && targets.get(rel.attrs['r:id']!);
    if (!target)
      return excelError('EXCEL_IMAGE_METADATA_INVALID', 'Place in Cell image bytes are missing.');
    const address = /^([A-Z]+)([1-9]\d*)$/.exec(cell.attrs.r ?? '');
    if (!address)
      return excelError('EXCEL_IMAGE_METADATA_INVALID', 'Place in Cell address is invalid.');
    const col = [...address[1]!].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
    const altIndex = keys.findIndex((k) => /Text|Description/i.test(k.attrs.n ?? ''));
    images.push({
      row: Number(address[2]),
      col,
      rowOffset: 0,
      colOffset: 0,
      bytes: parts.get(target)!,
      alt: altIndex < 0 ? '' : (fields[altIndex]?.text ?? ''),
      mode: 'IN_CELL',
    });
  }
  return images;
}
