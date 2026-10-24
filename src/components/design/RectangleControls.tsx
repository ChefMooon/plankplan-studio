import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { rectanglePlaneAxes, type RectangleAxis, type RectangleDirection } from './rectangle-plane';

type Props = { axis: RectangleAxis; direction: RectangleDirection; onAxisChange: (axis: RectangleAxis) => void; onDirectionChange: (direction: RectangleDirection) => void };
export function RectangleControls({ axis, direction, onAxisChange, onDirectionChange }: Props) {
  const [widthAxis, heightAxis] = rectanglePlaneAxes(axis);
  return <div className="rectangle-controls">
    <div className="rectangle-plane-controls">
      <span>Plane</span>
      <SegmentedControl<RectangleAxis> aria-label="Rectangle drawing plane" value={axis} onValueChange={onAxisChange} options={([
        ['x', 'X · YZ'], ['y', 'Y · XZ'], ['z', 'Z · XY'],
      ] as const).map(([value, label]) => ({ value, label, keyShortcuts: value.toUpperCase() }))}/>
    </div>
    <label className="rectangle-direction-control"><span>Direction</span><Select aria-label="Rectangle direction" value={direction} onValueChange={value => onDirectionChange(value as RectangleDirection)} options={[
      { value: 'pointer', label: 'Follow pointer' },
      ...(['++', '-+', '+-', '--'] as const).map(value => ({ value, label: `${value[0]}${widthAxis}, ${value[1]}${heightAxis}` })),
    ]} /></label>
    <span className="rectangle-plane-hint">X / Y / Z changes plane</span>
  </div>;
}
