---
name: gpt-image-2-fast-prompt
description: Create a copy-ready GPT Image 2 text prompt with the same reference-fidelity standards as the GPT Image 2 Prompt Author skill, while omitting its JSON artifact, ledger, and lint-report deliverables.
---

# GPT Image 2 Fast Prompt

Use only when explicitly invoked as `$gpt-image-2-fast-prompt`. Produce a prompt for GPT Image 2; do not generate, edit, upload, or inspect an image-model output.

## Goal

Create a copy-ready prompt with the same visual accuracy standard as the GPT Image 2 Prompt Author skill. The speed improvement comes from suppressing administrative artifacts and report text, not from skipping reference analysis or removing important prompt controls. "Accurate" means faithful to the supplied evidence; it does not promise pixel-perfect generation or perfect glyph rendering.

## Fast workflow

1. Classify the request internally as generate, reference-generate, edit, or mask-edit. Record aspect ratio and usable dimensions when known.
2. When a reference image is supplied, default to strict visual replication. Inspect it once deliberately and record its dimensions, canvas, background, layout, objects, copy, palette, lighting, camera, hierarchy, and layering.
3. Treat each attached identity reference as the source of truth. Map every image by attachment order and role. Preserve an as-is object instead of reconstructing its anatomy in prose; describe visible details only when a requested change, new view, ambiguity, or unattached reference requires it.
4. Internally separate confirmed facts, observed reference facts, inferences, proposed changes, approval needs, and approved copy. Never invent product facts, claims, prices, logos, labels, or text.
5. Preserve exact visible copy. Quote every readable word exactly, including capitalization, punctuation, ordinal/superscript text, line breaks, logo text, claims, model labels, and footer labels. If required text is unreadable or unapproved, ask or identify the blocker instead of guessing.
6. For strict replication, measure high-value geometry with normalized `x`, `y`, `w`, and `h` values from 0 to 1: major objects, logo, text blocks, panels, footer, repeated cards, icons, and distinctive line or wave graphics. Include camera, lighting, z-order, spacing, and hierarchy in the prompt.
7. Internally check reference mapping, preservation/change boundaries, copy fidelity, geometry, camera, lighting, typography, and unwanted additions. Do not create a JSON artifact, ledger file, lint report, or validation handoff.
8. Return one prompt with exactly these slots, in order: `Scene/background:`, `Subject:`, `Key details:`, `Typography:`, `Constraints:`.

## What the prompt must cover

- Canvas dimensions/aspect ratio and background treatment.
- Composition, object positions, relative scale, crop, alignment, spacing, camera/perspective, and visual hierarchy.
- Distinctive secondary graphics: paths, waves, panels, icons, shadows, borders, and clipping behavior.
- Lighting and tonal behavior when visible; otherwise preserve the reference lighting.
- Exact typography: quoted copy, line breaks, placement, approximate size, weight, alignment, color, and any logo or superscript treatment.
- A concise boundary: preserve reference identity and layout; change only what the user asks to change; add no unapproved objects, claims, logos, or text.

## Reference handling

For an attached identity or composition reference, use a short declaration such as:

`Image 1: supplied reference image. Match the complete composition, object identities, visible copy, and graphic treatment shown. Preserve all unchanged elements.`

If the user requests a new angle, pose, color, lighting treatment, or other deliberate change, state that change explicitly and do not claim the image stays unchanged. If the image will not be supplied to the image model, describe only the visual facts needed to recreate it. For multiple references, label every `Image N:` declaration before `Subject:` and define each reference's role and allowed change.

## Output

Return only the complete prompt in one fenced `text` block so it can be copied directly into an image-generation tool. Do not return JSON, an asset ID, source-analysis metadata, a preservation ledger, lint output, a long explanation, or a formal handoff package unless the user explicitly requests those items. Do not claim the result is pixel-perfect or visually validated.
