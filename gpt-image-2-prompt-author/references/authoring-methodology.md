# GPT Image 2 Prompt Authoring Methodology

This methodology creates prompt-only GPT Image 2 packages. It may inspect supplied local files, write a `lintOnly: true` artifact, and run the local prompt checker. It must not generate, upload, route, inspect, or approve images.

## Contents

1. Evidence and operation
2. Reference handling: image first, prose second
3. Preserve/change ledger
4. Strict visual-forensics pass
5. Five-slot prompt
6. Operation-specific rules
7. Claims and brand safety
8. Strict artifact metadata
9. Self-audit and lint
10. Handoff

## 1. Evidence and operation

Use evidence in this order:

1. approved brief, copy, prices, and claims;
2. approved brand and product facts;
3. user-supplied references and instructions;
4. prompt-authoring heuristics.

Never invent a product fact, model name, price, logo, claim, warranty, review, or visible source detail.

Before drafting, create a compact approved-copy ledger for every visible word: model labels, prices, footer labels, logo text, claims, and any other copy. Repeat approved strings exactly in the Typography slot. If a user requests footer typography, the footer must be written as icon-plus-label units with exact quoted labels; do not write icon-only or `no other visible words`. If the user has not approved the footer strings and no explicitly approved layout reference supplies them, report the missing copy rather than guessing.

Choose the operation before drafting:

- `generate`: text only;
- `reference-generate`: one or more attached references, each with a named role;
- `edit`: preserve a base image except for a specified change;
- `mask-edit`: change only a masked region.

Record aspect ratio and mapped dimensions. Default mappings are `1:1 = 2880x2880`, `3:4 = 2448x3264`, `4:5 = 2560x3200`, and `16:9 = 3840x2160` unless the user approves another valid mapping.

## 2. Reference handling: image first, prose second

For attached identity references, the image is the source of truth for appearance. The prompt should identify what the image is, where it belongs, and what may change. It should not reconstruct the visible object in prose.

Create the reference map in attachment order before drafting:

```text
Image 1: Pro 2 product reference. Keep the complete supplied product as is. Only remove its original background, resize it uniformly, place it in the center position, and add an external contact shadow. Do not change the product itself.
```

This minimal pattern is the default for products, people, outfits, packaging, logos, and accessories whose supplied view should remain unchanged.

### Why minimal declarations matter

A long list of visible features can be interpreted as a request to synthesize those features into a new object. Avoid enumerating silhouette details, seams, edges, hardware, component anatomy, colors, materials, reflections, transparency, cords, loops, labels, or markings when the attached image already shows them and no such property is being changed.

Prefer:

```text
Image 4: Free clear case and lanyard product reference. Keep the complete supplied product as is. Only remove its original background, resize it uniformly, place it in the lower freebie position, and add an external contact shadow. Do not change the product itself.
```

Avoid:

```text
Image 4: Preserve its exact shell contour, lid seam, attachment, braided cord route, loop proportions, clips, hardware, reflections, and edge refraction...
```

The second form may encourage reconstruction even though it sounds more precise.

### When appearance description is justified

Describe visible reference properties only when necessary:

- the image was analyzed locally but will not be attached;
- the user requests a specific visible change;
- a new angle, pose, expression, view, lighting setup, or material treatment requires re-rendering;
- a layout/style reference controls visual organization rather than identity;
- references are ambiguous and need a short distinguishing label.

Keep even these descriptions scoped to the requested decision. Do not inventory all unchanged features.

### New angle or deliberate re-rendering

Do not combine `keep as is` with a new-angle request. Write:

```text
Image 1: Pro 2 product-identity reference. Match the supplied product identity. Render it from the overhead angle specified in Subject. Do not use its source background or layout.
```

The reference anchors identity; `Subject:` defines the new view.

### Layout/style references

A layout reference may control canvas hierarchy, alignment, spacing, typography behavior, palette, lighting mood, or graphic devices. State those categories explicitly and exclude identity categories:

```text
Image 1: layout reference. Use it only for hierarchy, spacing, alignment, and graphic treatment. Do not copy its products, logos, text, or claims.
```

### Unattached local references

If the model will not receive the image, do not write a fake `Image N:` declaration. Record `sourceReferenceMode: "analyzed-locally-only"` and transcribe only the observations needed to execute the prompt.

## 3. Preserve/change ledger

Write the ledger before prose:

```json
{
  "preserve": [
    "Keep each complete attached product exactly as shown.",
    "Preserve the current view, angle, crop, and component arrangement.",
    "Preserve the supplied lighting, colors, reflections, and internal shading.",
    "Preserve the approved target layout and typography hierarchy."
  ],
  "change": [
    "Remove source backgrounds, resize uniformly, place on the target canvas, and add external contact shadows."
  ],
  "exclude": [
    "Do not redraw or regenerate attached products.",
    "Do not add or remove product parts.",
    "Do not add unapproved text, objects, logos, or claims."
  ]
}
```

The ledger must answer what stays, what changes, and what is forbidden. It does not need to describe an attached product's visible anatomy.

For a requested re-render, narrowly replace the as-is rule with the approved exception, such as `change only the camera view to overhead while preserving identity`.

## 4. Strict visual-forensics pass

Use `replicationMode: "strict"` when the user says replicate, recreate, match, clone, or asks for close source fidelity.

Measure the target composition, not the already attached identity object:

- source canvas dimensions, orientation, and aspect ratio;
- background color and treatment;
- normalized element boxes with `x`, `y`, `w`, `h`, z-order, alignment, and relationships;
- product placement, display scale, crop, and baseline;
- target camera and perspective, or an explicit instruction to preserve each supplied view;
- target lighting, or an explicit instruction to preserve product lighting and add only external shadows;
- palette and visual reading order;
- exact typography inventory.

For prominent secondary graphics, measure geometry rather than relying on semantic names. Record wave or line paths/origins, extents, count or spacing, stroke width, opacity, fill policy, and clipping; panel or footer bounds, fill, corner radii, edge behavior, and z-order; pictogram boxes, silhouette identity, internal color blocks or ribbons, and icon-to-label gaps; and separate bounds, baselines, and gutters for repeated labels or cards. Carry these controls into the prompt, using approximate ranges when evidence is limited. Avoid vague descriptions such as “wave pattern,” “rounded footer,” or “delivery icon.”

For a footer with text, record separate normalized icon and label boxes for each service unit, the exact label string, icon-to-label gap, baseline, font size, color, weight, and alignment. The prompt must repeat those controls in Key details and Typography.

For an as-is identity reference, the subject inventory may say:

```text
Use the complete product from Image 1 as shown; place it in the center box without changing its internal appearance.
```

Do not convert strict replication into a written reconstruction of attached products.

## 5. Five-slot prompt

Use each marker exactly once and in this order:

```text
Scene/background: ...
Subject: ...
Key details: ...
Typography: ...
Constraints: ...
```

### Scene/background

Define the target canvas, background, layout, negative space, coordinate system, camera treatment, and lighting policy. Put every `Image N:` role declaration here before `Subject:`. Keep as-is declarations minimal.

### Subject

Place and scale the referenced objects. State whether each supplied view stays as is or receives a specific approved change. Avoid repeating product anatomy.

### Key details

Define z-order, alignment, spacing, hierarchy, shadows, safe areas, and high-risk relationships. Do not use this slot to redescribe attached products.

### Typography

Treat text as immutable glyph data. Quote exact copy and specify line breaks, placement, size, color, font class, weight, alignment, tracking, leading, and structure. If no text is wanted, write `Typography: none` and protect any overlay area. If footer typography is requested, quote each footer label and place it immediately beside its corresponding icon; `icon-only` is invalid for that brief.

### Constraints

Keep this slot. The OpenAI API does not require the heading, but the skill uses it as a compact production guardrail and lint contract. It protects reference fidelity, copy scope, claims, and unwanted additions.

Do not repeat product appearance. Prefer one to three concise sentences:

```text
Constraints: Images 1-4 are the sources of truth for product appearance. Change only background removal, uniform scale, placement, and external shadows. Add no extra products, claims, logos, or text.
```

Use additional exclusions only when the brief has a real high-risk failure mode. Avoid long boilerplate lists that dilute the main instruction.

## 6. Operation-specific rules

For `edit` and `mask-edit`, state:

1. what remains unchanged;
2. the exact intended change;
3. what must not move, disappear, or be reinterpreted.

For typography-only repair, preserve image content, composition, camera, lighting, shadows, and background while specifying only the text correction.

For identity repair, preserve framing, pose, gaze, setting, wardrobe, lighting, and color unless one is the requested change.

## 7. Claims and brand safety

Use only approved prices, features, comparisons, product names, logos, reviews, testimonials, and offers. A reference image does not approve text or claims visible in that image unless the user explicitly approves them for the new output.

Keep claim exclusions in `Constraints:` concise and relevant. Do not invent authenticity, certification, warranty, shipping, stock, urgency, scarcity, or performance claims.

## 8. Strict artifact metadata

A strict package includes:

- `sourceAnalysis` with source dimensions, reference mode, analysis method, and one record per reference;
- `visualInventory` with coordinate system, canvas, background, layout, subject placement, camera, lighting, palette, typography, hierarchy, and element boxes;
- `preservationChangeLedger` with preserve/change/exclude lists;
- at least four concrete `fidelityPriorities`;
- `finalSelfAudit` covering canvas, geometry, reference identity, typography, camera, lighting, and constraints.

For an attached as-is identity reference, this metadata is sufficient:

```json
{
  "imageIndex": 1,
  "dimensions": "1280x1280",
  "role": "Pro 2 product reference for the center position.",
  "preserve": "Keep the complete supplied product exactly as shown.",
  "changeBoundary": "Change only background removal, uniform scale, canvas placement, and an external contact shadow."
}
```

Do not force detailed visible-property inventories for attached as-is references.

## 9. Self-audit and lint

Before linting, confirm:

- every attachment number maps to the correct role;
- as-is identity declarations are short and do not reconstruct product anatomy;
- any new angle or re-render request is explicit and does not say `keep as is`;
- target canvas, geometry, hierarchy, camera, lighting, and typography are executable;
- `Constraints:` is concise and protects only real scope boundaries;
- preserve/change instructions do not conflict.

Run only:

```powershell
node "$env:USERPROFILE\.codex\skills\gpt-image-2-prompt-author\scripts\gpt-image-2-prompt-lint.mjs" --check-prompt .\asset-id.lint.json
```

Resolve all issues. Review every warning. An overdefined-reference warning should normally be fixed by deleting redundant appearance description, not by adding more wording.

A passing lint report validates prompt structure and declared controls. It does not prove visual fidelity or guarantee pixel-exact preservation.

## 10. Handoff

Return status, asset ID, operation, aspect ratio, mapped dimensions, reference map, strict inventory when applicable, ledger, complete five-slot prompt, lint result, and approval blockers. Keep the prompt inline and copy-ready when requested.
