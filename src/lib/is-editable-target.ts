/** True when keyboard shortcuts should leave the user's current editing surface alone. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]');
}
