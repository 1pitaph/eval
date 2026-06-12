# Design QA

Reference: user-provided Eval Studio layout screenshot.

Scope:
- Move the workflow pipeline into a top horizontal React Flow strip.
- Render the top pipeline as an unframed fixed strip without canvas background, inner border, or card frame.
- Remove the visible Pipeline Map label/header so only the fixed node strip remains.
- Render the page command bar as an unframed information row without background card, border, shadow, or rounded container.
- Widen the expanded workflow dialog and fit the full DAG inside the canvas.
- Show the selected node inspector below the pipeline on the left.
- Keep Run Status below the pipeline on the right.
- Preserve the full canvas in the expand dialog.
- Keep the local dev URL stable and support Vite hot updates on the fixed web port.
- Pin local dev ports to web `8455` and API `8456`; `84555` is not usable because TCP ports must be 0-65535.
- Align sidebar navigation icons to a fixed left edge across active and inactive items.
- Remove the Inspector outer frame in pipeline layout and align its content with the top Setup title.

Checks:
- Desktop layout: passed. Pipeline spans the top; Inspector and Run Status render as left/right panels with no horizontal overflow.
- Unframed pipeline: passed. Pipeline container and React Flow shell render transparent with no border, no shadow, and no dot-grid background.
- Pipeline header removal: passed. The page no longer contains visible Pipeline Map text and the pipeline header row is not rendered.
- Unframed command bar: passed. Command bar computed styles are transparent background, 0px border, no shadow, and 0px radius.
- Node interaction: passed. Clicking Model Fanout in the pipeline updates the Inspector to Model Fanout and highlights the selected node.
- Node interaction after unframing: passed. Clicking Auto Metrics updates the Inspector to Auto Image Metrics.
- Results layout: passed. Eval Results keeps the top pipeline and right-side Run Status.
- Narrow layout: passed. Panels stack as pipeline, content, Run Status with no horizontal overflow.
- Expanded workflow dialog: passed. Dialog width increased from the default 512px cap to the available viewport width; all 8 nodes fit inside the canvas shell.
- Dev server stability: passed. `http://localhost:8455/` remains reachable, Vite client is loaded, and browser console has no HMR errors.
- API dev server: passed. `http://localhost:8456/health` returns healthy JSON.
- Sidebar icon alignment: passed. Sidebar nav links compute `justify-content: flex-start`; all three icon left edges measured at the same x-coordinate.
- Inspector unframed layout: passed. Inspector panel computes transparent background, 0px border, no shadow, and 0px radius; Setup title, Inspector title, and Inspector content all measure at the same left x-coordinate.
- Build: passed with existing Vite chunk-size warning only.

Final result: passed.
