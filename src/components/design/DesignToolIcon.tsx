import select from '@/assets/design-tools/select.svg?raw';
import line from '@/assets/design-tools/line.svg?raw';
import rectangle from '@/assets/design-tools/rectangle.svg?raw';
import pushPull from '@/assets/design-tools/push-pull.svg?raw';
import erase from '@/assets/design-tools/erase.svg?raw';
import move from '@/assets/design-tools/move.svg?raw';
import rotate from '@/assets/design-tools/rotate.svg?raw';
import scale from '@/assets/design-tools/scale.svg?raw';
import paint from '@/assets/design-tools/paint.svg?raw';
import orbit from '@/assets/design-tools/orbit.svg?raw';
import pan from '@/assets/design-tools/pan.svg?raw';
import measure from '@/assets/design-tools/measure.svg?raw';

const iconMarkup = {
  select, line, rectangle, 'push-pull': pushPull, erase, move, rotate, scale, paint, orbit, pan, measure,
} satisfies Record<string, string>;

export type DesignToolIconName = keyof typeof iconMarkup;

export function DesignToolIcon({ name }: { name: DesignToolIconName }) {
  return <span className="design-tool-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup[name] }} />;
}
