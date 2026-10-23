# Design tool icons

The Design workspace tool rail uses small original SVGs in `src/assets/design-tools/`. Each file has a `24 × 24` viewBox and is drawn to remain clear at the rendered `20 × 20` size.

| Tool | Asset | Motif |
| --- | --- | --- |
| Select | [`select.svg`](../src/assets/design-tools/select.svg) | Pointer with a distinct grip point |
| Line | [`line.svg`](../src/assets/design-tools/line.svg) | Diagonal segment with endpoint nodes |
| Rectangle | [`rectangle.svg`](../src/assets/design-tools/rectangle.svg) | Clean rectangular outline |
| Push / Pull | [`push-pull.svg`](../src/assets/design-tools/push-pull.svg) | Extruded profile and upward pull arrow |
| Eraser | [`erase.svg`](../src/assets/design-tools/erase.svg) | Tilted eraser block |
| Move | [`move.svg`](../src/assets/design-tools/move.svg) | Four-way directional arrows |
| Rotate | [`rotate.svg`](../src/assets/design-tools/rotate.svg) | Circular arrow around a pivot dot |
| Scale | [`scale.svg`](../src/assets/design-tools/scale.svg) | Expanding diagonal with axis corners |
| Paint | [`paint.svg`](../src/assets/design-tools/paint.svg) | Palette with paint wells |
| Orbit | [`orbit.svg`](../src/assets/design-tools/orbit.svg) | Elliptical path around a center |
| Pan | [`pan.svg`](../src/assets/design-tools/pan.svg) | Open hand |
| Tape Measure | [`measure.svg`](../src/assets/design-tools/measure.svg) | Housing with an extended, ticked tape |

## Style and use

Use a `24 × 24` viewBox, no filled shapes, `currentColor` strokes, rounded caps and joins, and a fixed stroke width of `1.8`. Keep the main silhouette recognizable at `20px`; use only enough detail to distinguish neighboring tools. Keep geometry centered with consistent optical padding of about `2–4` units from the viewBox edges; allow intentional arrow tips or hand shapes to approach the edges when needed. Do not add embedded colors, text, or dependencies.

`DesignToolIcon.tsx` imports the trusted local SVG strings with Vite's `?raw` query and maps each tool name explicitly. Keep markup limited to these reviewed assets; the component renders the SVG inside an `aria-hidden` wrapper. The surrounding buttons own accessible names, keyboard shortcuts, tooltips, and pressed state. `currentColor` follows the active or hover button color in both themes.

The Board and Help controls intentionally retain their existing text glyphs and are outside this asset set. Update this inventory and `DesignToolIcon.tsx` together when adding a tool icon.

## Review checklist

- Inspect every icon at its actual `20px` rail size and at `24px` in a close view; confirm details remain distinct without visual noise.
- Check both light and dark themes, including active and hover colors. Strokes must follow `currentColor` with enough contrast from the button surface.
- Confirm each SVG remains decorative and non-focusable, while its button keeps the existing accessible name, shortcut, tooltip, pressed state, and keyboard behavior.
- Check optical centering and edge padding beside neighboring icons; compare apparent weight as well as nominal stroke width.
