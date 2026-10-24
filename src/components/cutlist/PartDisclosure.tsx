import { useState, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';

export function PartDisclosure({ partId, partName, sheetPart, handle, main, details, actions }: {
  partId: string; partName: string; sheetPart: boolean; handle: ReactNode; main: ReactNode; details: ReactNode; actions: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = `${expanded ? 'Collapse' : 'Expand'} details for ${partName}`;
  return <>
    <div className={`part-main-row ${sheetPart ? 'is-sheet' : ''}`}>
      {handle}{main}
      <Tooltip content={label} side="bottom"><button type="button" className="part-expand" aria-label={label} aria-expanded={expanded} aria-controls={`part-details-${partId}`} onClick={() => setExpanded(value => !value)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></button></Tooltip>
      {actions}
    </div>
    <div id={`part-details-${partId}`} className={`part-details ${expanded ? 'is-expanded' : ''}`} inert={!expanded} aria-hidden={!expanded}>
      <div className="part-details-clip"><div className="part-details-fields">{details}</div></div>
    </div>
  </>;
}
