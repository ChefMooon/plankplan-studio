import type { DesignDocumentV1, Issue, LooseObject, Vec3Um } from './schema';
import { transformLocalPoint } from './geometry';

export const MAX_ANNOTATIONS = 500;
export const MAX_ANNOTATION_TEXT = 500;

export type AnnotationTarget = { kind: 'instance' | 'loose'; id: string };
export type AnnotationElement = { type: 'vertex' | 'edge' | 'face'; id: string; edgeTPpm?: number };
export type AnnotationAnchor = { target: AnnotationTarget; element: AnnotationElement; localUm: Vec3Um };
export type TextAnnotation = { id: string; kind: 'text'; anchor: AnnotationAnchor; text: string; labelLocalUm: Vec3Um };
export type DimensionMeasure = 'x' | 'y' | 'z' | 'direct';
export type DimensionAnnotation = { id: string; kind: 'dimension'; start: AnnotationAnchor; end: AnnotationAnchor; measure: DimensionMeasure; offsetUm: Vec3Um };
export type Annotation = TextAnnotation | DimensionAnnotation;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isIntegerIn = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const vector = (value: unknown): value is Vec3Um => Array.isArray(value) && value.length === 3 && value.every(v => isIntegerIn(v, -1_000_000_000, 1_000_000_000));

export function validateAnnotations(value: unknown, instanceIds: Set<string>, looseIds: Set<string>, basePath: string): Issue[] {
  const issues: Issue[] = [];
  const issue = (code: string, path: string) => issues.push({ code, path, severity: 'error' });
  const keys = (record: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(record)) if (!allowed.includes(key)) issue('unknown-field', `${path}.${key}`);
  };
  if (!Array.isArray(value)) return [{ code: 'invalid-array', path: basePath, severity: 'error' }];
  if (value.length > MAX_ANNOTATIONS) issue('count-limit', basePath);
  const ids = new Set<string>();
  const validateAnchor = (anchor: unknown, path: string): void => {
    if (!isRecord(anchor)) { issue('invalid-annotation-anchor', path); return; }
    keys(anchor, ['target', 'element', 'localUm'], path);
    const target = anchor.target;
    const element = anchor.element;
    let valid = true;
    if (!isRecord(target)) valid = false;
    else {
      keys(target, ['kind', 'id'], `${path}.target`);
      if (target.kind !== 'instance' && target.kind !== 'loose') valid = false;
      else if (typeof target.id !== 'string' || !(target.kind === 'instance' ? instanceIds : looseIds).has(target.id)) issue('dangling-annotation-target', `${path}.target.id`);
    }
    if (!isRecord(element)) valid = false;
    else {
      keys(element, ['type', 'id', 'edgeTPpm'], `${path}.element`);
      if (!['vertex', 'edge', 'face'].includes(String(element.type)) || typeof element.id !== 'string' || element.id.length < 1 || element.id.length > 300) valid = false;
      if (element.type === 'edge') {
        if (!Object.prototype.hasOwnProperty.call(element, 'edgeTPpm') || !isIntegerIn(element.edgeTPpm, 0, 1_000_000)) valid = false;
      } else if (Object.prototype.hasOwnProperty.call(element, 'edgeTPpm')) valid = false;
    }
    if (!valid) issue('invalid-annotation-anchor', path);
    if (!vector(anchor.localUm)) issue('invalid-annotation-vector', `${path}.localUm`);
  };
  value.forEach((entry, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(entry)) { issue('invalid-annotation', path); return; }
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 128 || ids.has(entry.id)) issue('invalid-or-duplicate-id', `${path}.id`);
    else ids.add(entry.id);
    if (entry.kind !== 'text' && entry.kind !== 'dimension') { issue('invalid-annotation-kind', `${path}.kind`); return; }
    keys(entry, entry.kind === 'text' ? ['id', 'kind', 'anchor', 'text', 'labelLocalUm'] : ['id', 'kind', 'start', 'end', 'measure', 'offsetUm'], path);
    if (entry.kind === 'text') {
      validateAnchor(entry.anchor, `${path}.anchor`);
      if (typeof entry.text !== 'string' || entry.text.length < 1 || entry.text.length > MAX_ANNOTATION_TEXT || !entry.text.trim()) issue('invalid-annotation-text', `${path}.text`);
      if (!vector(entry.labelLocalUm)) issue('invalid-annotation-vector', `${path}.labelLocalUm`);
    } else {
      validateAnchor(entry.start, `${path}.start`);
      validateAnchor(entry.end, `${path}.end`);
      if (!['x', 'y', 'z', 'direct'].includes(String(entry.measure))) issue('invalid-dimension-measure', `${path}.measure`);
      if (!vector(entry.offsetUm)) issue('invalid-annotation-vector', `${path}.offsetUm`);
    }
  });
  return issues;
}

function anchorTargets(annotation: Annotation): AnnotationTarget[] {
  return annotation.kind === 'text' ? [annotation.anchor.target] : [annotation.start.target, annotation.end.target];
}

export function pruneAnnotations(d: DesignDocumentV1): DesignDocumentV1 {
  if (d.annotations === undefined) return d;
  const instances = new Set(d.instances.map(instance => instance.id));
  const loose = new Set(d.looseObjects.map(object => object.id));
  const annotations = d.annotations.filter(annotation => anchorTargets(annotation).every(target => target.kind === 'instance' ? instances.has(target.id) : loose.has(target.id)));
  return annotations.length === d.annotations.length ? d : { ...d, annotations };
}

export function addAnnotation(d: DesignDocumentV1, annotation: Annotation): DesignDocumentV1 {
  const annotations = d.annotations ?? [];
  if (annotations.length >= MAX_ANNOTATIONS) throw new Error('annotation-limit');
  if (annotations.some(existing => existing.id === annotation.id)) throw new Error('duplicate-annotation-id');
  return { ...d, annotations: [...annotations, structuredClone(annotation)] };
}

export function updateAnnotation(d: DesignDocumentV1, annotation: Annotation): DesignDocumentV1 {
  const annotations = d.annotations ?? [];
  const index = annotations.findIndex(existing => existing.id === annotation.id);
  if (index < 0) throw new Error('annotation-not-found');
  if (annotations[index].kind !== annotation.kind) throw new Error('annotation-kind-mismatch');
  return { ...d, annotations: annotations.map((existing, current) => current === index ? structuredClone(annotation) : existing) };
}

export function deleteAnnotation(d: DesignDocumentV1, annotationId: string): DesignDocumentV1 {
  const annotations = d.annotations ?? [];
  if (!annotations.some(annotation => annotation.id === annotationId)) throw new Error('annotation-not-found');
  return { ...d, annotations: annotations.filter(annotation => annotation.id !== annotationId) };
}

export function retargetAnnotationsForComponent(d: DesignDocumentV1, sources: LooseObject[], instanceId: string): DesignDocumentV1 {
  if (!d.annotations?.length) return d;
  const byId = new Map(sources.map(source => [source.id, source]));
  const annotations: Annotation[] = [];
  for (const annotation of d.annotations) {
    try {
      const retarget = (anchor: AnnotationAnchor): AnnotationAnchor => {
        if (anchor.target.kind !== 'loose') return anchor;
        const source = byId.get(anchor.target.id);
        if (!source) return anchor;
        return { ...anchor, target: { kind: 'instance', id: instanceId }, localUm: transformLocalPoint(anchor.localUm, source.pose, source.scalePpm) };
      };
      if (annotation.kind === 'text') {
        const source = annotation.anchor.target.kind === 'loose' ? byId.get(annotation.anchor.target.id) : undefined;
        const updated = { ...annotation, anchor: retarget(annotation.anchor), ...(source ? { labelLocalUm: transformLocalPoint(annotation.labelLocalUm, source.pose, source.scalePpm) } : {}) };
        annotations.push(updated);
      } else annotations.push({ ...annotation, start: retarget(annotation.start), end: retarget(annotation.end) });
    } catch {
      // An out-of-bounds rebase cannot be represented in the destination component frame.
    }
  }
  return { ...d, annotations };
}
