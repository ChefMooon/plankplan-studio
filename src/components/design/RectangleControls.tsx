import { Select } from '@/components/ui/select';
import { rectanglePlaneAxes, type RectangleAxis, type RectangleDirection } from './rectangle-plane';

type Props = { axis: RectangleAxis; direction: RectangleDirection; onAxisChange: (axis: RectangleAxis) => void; onDirectionChange: (direction: RectangleDirection) => void };
export function RectangleControls({ axis, direction, onAxisChange, onDirectionChange }: Props) {
  const [widthAxis, heightAxis] = rectanglePlaneAxes(axis);
  return <div className="rectangle-controls">
    <div role="group" aria-label="Rectangle drawing plane" className="rectangle-plane-controls">
      <span>Plane</span>
      {([['x', 'X · YZ'], ['y', 'Y · XZ'], ['z', 'Z · XY']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={axis === value} aria-keyshortcuts={value.toUpperCase()} title={`Press ${value.toUpperCase()} to change plane`} onClick={() => onAxisChange(value)}>{label}</button>)}
    </div>
    <label className="rectangle-direction-control"><span>Direction</span><Select aria-label="Rectangle direction" value={direction} onValueChange={value => onDirectionChange(value as RectangleDirection)} options={[
      { value: 'pointer', label: 'Follow pointer' },
      ...(['++', '-+', '+-', '--'] as const).map(value => ({ value, label: `${value[0]}${widthAxis}, ${value[1]}${heightAxis}` })),
    ]} /></label>
    <span className="rectangle-plane-hint">X / Y / Z changes plane</span>
  </div>;
}
