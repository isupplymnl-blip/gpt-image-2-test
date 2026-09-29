---
name: gpt-image-2-prompt-author
description: Create, revise, and semantically lint prompt-only GPT Image 2 prompt packages, including strict visual replication, minimal source-of-truth reference labeling, measured geometry, typography controls, and preserve/change boundaries. Use only when explicitly invoked as $gpt-image-2-prompt-author; never generate, edit, upload, route, or review images.
---

# GPT Image 2 Prompt Author

## Explicit invocation

Use this skill only when the request explicitly invokes $gpt-image-2-prompt-author. Write and validate prompts only. Do not choose a provider, inspect credentials, upload references, call an image API, generate an image, inspect generated output, or claim that an output exists.

Read `references/authoring-methodology.md` before drafting.

## Core reference rule

Treat every attached identity reference as the visual source of truth. The image supplies the product, person, outfit, logo, package, or accessory appearance; the prompt supplies the reference role, permitted changes, composition, and surrounding design.

For an attached product or identity that should remain unchanged, use a minimal declaration:

```text
Image 1: Pro 2 product reference. Keep the complete supplied product as is. Only remove its original background, resize it uniformly, place it in the requested position, and add an external contact shadow. Do not change the product itself.
```

Do not transcribe or enumerate visible anatomy, construction, materials, seams, edges, hardware, colors, reflections, or component details when the attached image already shows them and those details are not being changed. Such lists can cause the model to reconstruct a new approximation instead of using the supplied object faithfully.

Describe reference appearance only when one of these exceptions applies:

- the reference will not be attached to the image model and must be transcribed from local analysis;
- the user explicitly asks to change a specific visible property;
- a new angle, pose, view, lighting setup, or material treatment requires deliberate re-rendering;
- a layout or style reference controls composition rather than an identity object;
- two references are genuinely ambiguous and a short distinction is needed to map them correctly.

When a new angle or other re-rendering change is requested, do not say `keep as is`. Use the attachment only to anchor identity and state the requested change concisely:

```text
Image 1: Pro 2 product-identity reference. Match the supplied product identity. Render it from the overhead angle specified in Subject. Do not use its original background or layout.
```

## Constraints decision

Keep the `Constraints:` slot. GPT Image 2 does not require that literal heading at the API level, but this skill requires it as a production guardrail and lint contract. The slot prevents unwanted additions, claim drift, text drift, and accidental changes to attached references.

Keep it concise. Do not use `Constraints:` to describe the product again. For an as-is reference, it may be only one to three sentences:

```text
Constraints: Image 1 is the source of truth for product appearance. Change only background removal, uniform scale, placement, and the external shadow. Add no extra products or text.
```

## Required workflow

1. Classify the operation as `generate`, `reference-generate`, `edit`, or `mask-edit`; record aspect ratio and mapped dimensions.
2. Separate confirmed facts, observed reference facts, inferences, proposals, approval needs, and approved copy. Never invent product facts, logos, claims, prices, or source details.
3. Map every attached reference by attachment order and classify its behavior as `as-is identity`, `identity with explicit change`, `layout/style`, `setting`, `logo/packaging`, or `base edit image`.
4. Write the preservation/change ledger before prose. For as-is identity references, preserve the complete supplied object rather than listing its visible parts.
5. For strict replication, inventory the target canvas, layout, camera, lighting, typography, hierarchy, and normalized element boxes. Do not turn an attached as-is identity object into a text reconstruction.
6. Draft exactly `Scene/background:`, `Subject:`, `Key details:`, `Typography:`, and `Constraints:` in that order. Put every `Image N:` declaration before `Subject:`.
7. Create a `lintOnly: true` artifact and run only the prompt checker. Resolve every issue and deliberately review every warning.

### Fast path and copy ledger

For a single prompt package, read the methodology once, inspect each supplied reference once, write one artifact, and run the checker once. For a copy-only revision, edit the existing artifact and rerun only the checker; do not repeat unchanged source analysis or rebuild the strict inventory.

Persist an `approvedCopy` ledger whenever the image contains visible words. Keep model labels, prices, footer labels, logo text, claims, and other copy in separate lists, and repeat every approved string exactly in `Typography:`. Never use `icon-only`, `no other visible words`, or an equivalent exclusion when the brief requests footer typography. A footer with requested icons and labels must be specified as icon-plus-label units with a label box, exact quoted text, placement, size, color, font class, weight, alignment, and icon-to-label gap. If footer typography is requested but the exact strings are not approved or visible in an explicitly approved layout reference, stop and report the missing copy instead of inventing it.

## Reference patterns

### As-is identity reference

```text
Image N: [name] [product/model/accessory] reference. Keep the complete supplied [object/person] as is. Only [allowed transformations]. Do not change the [object/person] itself.
```

Use this by default when the current view and appearance should remain unchanged. Allowed transformations commonly include background removal, uniform resizing, canvas placement, crop only when explicitly approved, and an external contact shadow.

### Identity reference with an explicit change

```text
Image N: [name] identity reference. Match the supplied identity. Apply only [requested change] as specified in Subject. Do not use the source background or layout.
```

Use this when the output needs a new angle, pose, expression, lighting treatment, colorway, or other deliberate re-rendering. State only the requested change; do not inventory unchanged appearance.

### Layout or style reference

```text
Image N: layout reference. Use it only for canvas hierarchy, spacing, alignment, and graphic treatment. Do not copy its products, logos, or claims.
```

Layout and style references require measured composition instructions because the reference controls how the image is organized, not which product identity to preserve.

### Locally analyzed but unattached image

Do not write a fake `Image N:` label. Set `sourceReferenceMode: "analyzed-locally-only"` and transcribe only the observations needed by the model.

## Strict replication protocol

For `replicationMode: "strict"`, require:

- `sourceAnalysis` with source dimensions, reference mode, analysis method, and one role/preserve/change-boundary record per reference;
- `visualInventory` covering canvas, background, layout, subject placement, camera, lighting, palette, typography, hierarchy, and normalized element boxes;
- `preservationChangeLedger` with separate `preserve`, `change`, and `exclude` lists;
- `fidelityPriorities` identifying the highest-risk visual details and reference mappings;
- `finalSelfAudit` checking canvas, geometry, reference identity, typography, camera, lighting, hierarchy, and constraints;
- measurable normalized `x`, `y`, `w`, and `h` geometry in the prompt for major elements.

For attached as-is identity references, metadata may say `Keep the complete supplied product exactly as shown.` It does not need to enumerate visible product features. Measure and describe the target composition around the object, not the object already supplied by the attachment.

For a true source-layout match, prefer `reference-generate` and attach the layout source. A layout reference is not a product-identity reference, and a product reference is not permission to import its source background, typography, price, branding, or claims.

### Secondary graphic geometry

For strict replication, quantify prominent non-subject graphics instead of naming them semantically. For wave or line motifs, record path/origin, extent, count or spacing, stroke width, opacity, fill policy, and edge clipping. For panels or footers, record normalized bounds, fill color, corner radii, edge behavior, and z-order. For pictograms, record icon boxes, silhouette identity, internal color blocks or ribbons, and the icon-to-label gap. For repeated labels or cards, record each separate `x`, `y`, `w`, and `h`, baseline, and gutters. Put these measurements in the inventory and prompt; use approximate ranges when the source does not support exact values, and avoid vague descriptions such as “wave pattern,” “rounded footer,” or “delivery icon.”

When a footer includes both pictograms and typography, measure separate icon and label boxes for every unit and carry the exact approved label strings into the inventory, prompt, and `approvedCopy` ledger. Treat the icon and its label as one aligned unit; do not collapse it to an icon-only instruction.

## Semantic quality gate

Require concrete target-image instructions rather than mood adjectives:

- Composition: framing plus camera angle, perspective, or lens behavior, unless these are explicitly preserved from a base or as-is reference.
- Lighting: preserve attached-product lighting or define at least two of source/direction, quality, temperature, and tonal behavior.
- Typography: write `Typography: none` with protected overlay space only when no visible words are requested, or specify exact quoted copy, placement, size, color, font class, weight, alignment, line breaks, and structure. Footer labels are visible words and must be specified when the brief requests footer typography.
- Constraints: use a concise preserve/exclude/scope boundary; do not repeat reference anatomy.
- References: label every attachment by role and allowed change; do not overdefine an as-is identity reference.
- Replication: measure layout, z-order, camera, lighting, palette, typography, hierarchy, and element bounds without verbally rebuilding attached identity objects.

The checker warns when an as-is reference declaration appears overdefined. A warning is not proof of failure, but the author must shorten the declaration unless a documented exception requires the detail.

## Required artifact fields

Every persisted package must include:

```json
{
  "lintOnly": true,
  "assetId": "descriptive-asset-id",
  "operation": "generate | reference-generate | edit | mask-edit",
  "aspectRatio": "4:5",
  "mappedDimensions": "2560x3200",
  "images": [],
  "prompt": "Scene/background: ...\\nSubject: ...\\nKey details: ...\\nTypography: ...\\nConstraints: ..."
}
```

For strict replication, also include the full `sourceAnalysis`, `visualInventory`, `preservationChangeLedger`, `fidelityPriorities`, and `finalSelfAudit` structures described in `references/authoring-methodology.md`. A minimal attached-reference record is valid:

```json
{
  "imageIndex": 1,
  "dimensions": "1280x1280",
  "role": "Pro 2 product reference for the center position.",
  "preserve": "Keep the complete supplied product exactly as shown.",
  "changeBoundary": "Change only background removal, uniform scale, canvas placement, and an external contact shadow."
}
```

## Fidelity promise

`replicationMode: "strict"` means the author creates the highest-fidelity prompt possible from the supplied evidence. It does not promise pixel-perfect reproduction. A prompt and passing lint cannot guarantee that a generative model will preserve every pixel, glyph, proportion, or reflection. Never call a prompt visually validated unless a separate approved operator has reviewed an output.

## Validation

Run only:

```powershell
node "$env:USERPROFILE\\.codex\\skills\\gpt-image-2-prompt-author\\scripts\\gpt-image-2-prompt-lint.mjs" --check-prompt .\\asset-id.lint.json
```

Do not run a generation entry point. Resolve all `issues`; review every `warning`. If evidence, copy approval, or a product claim is missing, report the blocker instead of inventing it.

## Handoff

Return status, asset ID, operation, aspect ratio, mapped dimensions, reference map, strict inventory when applicable, preservation/change ledger, lint result, and approval blockers.

Always end the final response with the complete final five-slot prompt in a fenced `text` code block so it is immediately copy-ready. Do this for every successful prompt-authoring or prompt-revision handoff, even when the user does not explicitly ask to see the prompt. When multiple prompt packages are delivered, end with every complete prompt in clearly labeled, separate fenced `text` code blocks. Do not truncate, summarize, replace with a file link, or place commentary after the final prompt block. If a blocker prevents a valid final prompt, report the blocker instead of presenting an incomplete prompt as final.
