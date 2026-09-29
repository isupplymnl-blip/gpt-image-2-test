const SLOT_MIN_WORDS = Object.freeze({
  'Scene/background': 5,
  Subject: 5,
  'Key details': 12,
  Constraints: 6,
});

const GENERIC_WORDS = new Set([
  'a', 'an', 'and', 'any', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with',
  'beautiful', 'cinematic', 'clean', 'elevated', 'high', 'image', 'luxury', 'nice', 'premium', 'professional', 'quality', 'scene',
  'stunning', 'subject', 'visual',
]);
const REFERENCE_ROLE = /\b(?:base|target|source|subject|model|person|face|hair|product|packaging|label|setting|location|background|scene|logo|wordmark|texture|material|mask|garment|outfit|pose|style|lighting|color)\b/i;
const REFERENCE_USE = /\b(?:use|maintain|preserve|keep|match|retain|same|from|as[- ]is|exact(?:ly)?|source of truth)\b/i;
const AS_IS_REFERENCE = /\b(?:as[- ]is|as shown|exactly as (?:shown|supplied)|exact source object|keep the complete supplied|preserve exactly the supplied|source of truth|do not change (?:the )?(?:product|person|object|subject|reference) itself)\b/i;
const APPEARANCE_RECONSTRUCTION_TERMS = /\b(?:silhouette|proportions?|construction|anatomy|shape|contours?|seams?|edges?|hardware|components?|materials?|finish|colorway|markings?|labels?|reflections?|transparency|refraction|vents?|sensors?|tips?|cord|routing|loops?|clips?|grommets?|attachments?)\b/gi;
const PLACEHOLDER = /(?:<[^>\n]+>|\[[^\]\n]+\]|\b(?:tbd|tbc|todo|n\/a|insert|placeholder)\b)/i;
const SETTING = /\b(?:background|studio|room|kitchen|bedroom|bathroom|office|street|park|beach|table|surface|floor|wall|outdoor|indoor|interior|exterior|environment|setting|location|scene|solid|seamless|gradient)\b/i;
const PRESERVE = /\b(?:preserve|maintain|keep|retain|unchanged|as[- ]is|do not (?:change|alter|modify)|without changing|same as)\b/i;
const CONTROL = /\b(?:no|do not|don't|avoid|never|without|only|unchanged|as[- ]is|preserve|maintain|keep)\b/i;
const TYPOGRAPHY_NONE = /\b(?:none|no (?:new |baked )?text|no text overlays?|no captions?|no badges?|preserve (?:any |existing )?text(?: as[- ]is)?)\b/i;
const CHANGE = /\b(?:change|alter|modify|replace|remove|add|recompose|restyle|shift|adjust|correct|edit|convert|recolor|recolour|fix|move|rotate|reframe|resize|desaturate|saturate|brighten|darken|soften|sharpen)\b/i;
const STRICT_REPLICATION_MODE = 'strict';
const STRICT_REFERENCE_MODES = new Set(['attached-to-model', 'analyzed-locally-only', 'not-applicable']);
const STRICT_INVENTORY_FIELDS = Object.freeze([
  'canvas', 'background', 'layout', 'subject', 'camera', 'lighting', 'palette', 'typography', 'hierarchy',
]);
const STRICT_AUDIT_CATEGORIES = Object.freeze([
  { name: 'canvas/aspect', pattern: /\b(?:canvas|aspect|ratio|dimension|orientation)\b/i },
  { name: 'geometry/layout', pattern: /\b(?:geometry|layout|box|position|placement|alignment|spacing|z[- ]?order)\b/i },
  { name: 'subject identity', pattern: /\b(?:subject|hero|product|silhouette|proportion|material)\b/i },
  { name: 'typography', pattern: /\b(?:typography|text|copy|font|glyph|line break)\b/i },
  { name: 'camera', pattern: /\b(?:camera|perspective|lens|angle|distortion|crop)\b/i },
  { name: 'lighting', pattern: /\b(?:lighting|shadow|highlight|temperature|white balance)\b/i },
  { name: 'constraints', pattern: /\b(?:constraint|exclude|preserve|change|do not|without)\b/i },
]);

const COMPOSITION_SIGNALS = Object.freeze([
  { name: 'shot scale', pattern: /\b(?:close[- ]up|medium(?:[- ]shot)?|wide(?:[- ]shot)?|full[- ]body|macro|packshot|portrait|hero[- ]shot|detail[- ]shot|establishing[- ]shot)\b/i },
  { name: 'camera angle or perspective', pattern: /\b(?:eye[- ]level|overhead|top[- ]down|low[- ]angle|high[- ]angle|three[- ]quarter|front(?:[- ]facing)?|side(?:[- ]on)?|profile|off[- ]axis|point[- ]of[- ]view|pov|perspective|camera angle)\b/i },
  { name: 'lens or focal length', pattern: /\b(?:\d{2,3}\s*mm|lens|telephoto|wide[- ]angle|normal lens)\b/i },
  { name: 'framing or layout', pattern: /\b(?:composition|framing|frame|crop|center(?:ed|ing)?|rule of thirds|negative space|foreground|background|left of|right of|above|below|occup(?:y|ied)|scale)\b/i },
]);

const LIGHTING_SIGNALS = Object.freeze([
  { name: 'source or direction', pattern: /\b(?:daylight|sunlight|window light|studio light(?:ing)?|ambient light|backlit|side[- ]lit|rim light|key light|fill light|upper[- ]left|upper[- ]right|from the left|from the right|from behind)\b/i },
  { name: 'light quality', pattern: /\b(?:soft|diffuse|diffused|hard|even|directional|non[- ]directional|overcast|dappled|dramatic)\b/i },
  { name: 'white balance or temperature', pattern: /\b(?:white balance|color temperature|colour temperature|kelvin|warm neutral|cool neutral|warmth localized|true colors|true colours)\b/i },
  { name: 'exposure or tonal behavior', pattern: /\b(?:shadow(?:s)?|highlight(?:s)?|contrast|exposure|lifted shadows|restrained highlights|dynamic range)\b/i },
]);

const CONFLICT_CATEGORIES = Object.freeze([
  { name: 'composition/camera', pattern: /\b(?:composition|camera angle|framing|crop|perspective|layout)\b/i },
  { name: 'lighting/color grade', pattern: /\b(?:lighting|white balance|color grading|colour grading|color balance|colour balance)\b/i },
  { name: 'background/setting', pattern: /\b(?:background|setting|location|room|environment)\b/i },
  { name: 'text/typography', pattern: /\b(?:text|typography|caption|headline|badge|watermark|wordmark)\b/i },
]);

function words(text) {
  return String(text || '').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || [];
}

function semanticWordCount(text) {
  return words(text).filter((word) => !GENERIC_WORDS.has(word.toLowerCase())).length;
}

function slotContents(prompt, slots) {
  const ordered = [...slots].sort((left, right) => left.index - right.index);
  const contents = {};
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    contents[current.name] = prompt.slice(current.index + current.markerLength, next ? next.index : prompt.length).trim();
  }
  return contents;
}

function referenceSegment(prompt, imageIndex) {
  const label = new RegExp(`\\bImage\\s+${imageIndex}\\s*:\\s*`, 'i');
  const match = label.exec(prompt);
  if (!match) return '';
  const nextMarker = /\b(?:Image\s+\d+\s*:|Subject\s*:|Key\s+details\s*:|Typography\s*:|Constraints\s*:)/ig;
  nextMarker.lastIndex = match.index + match[0].length;
  const next = nextMarker.exec(prompt);
  return prompt.slice(match.index, next ? next.index : prompt.length).trim();
}

function referenceUseIsDefined(segment) {
  return REFERENCE_USE.test(segment);
}

function appearanceReconstructionTerms(text) {
  return [...new Set((String(text || '').match(APPEARANCE_RECONSTRUCTION_TERMS) || []).map((term) => term.toLowerCase()))];
}

function signalNames(text, groups) {
  return groups.filter((group) => group.pattern.test(text)).map((group) => group.name);
}

function categoryState(text, category) {
  let preserve = false;
  let change = false;
  const instructions = String(text || '').split(/[\r\n]+|(?<=[.!?;])\s+/).map((clause) => clause.trim()).filter(Boolean);
  for (const instruction of instructions) {
    if (!category.test(instruction)) continue;
    if (PRESERVE.test(instruction)) preserve = true;
    const isNegativeChange = /\b(?:do not|don't|without)\b/i.test(instruction)
      || /\b(?:add|remove|change|alter|modify)\s+(?:no|nothing)\b/i.test(instruction);
    if (CHANGE.test(instruction) && !isNegativeChange) change = true;
  }
  return { preserve, change };
}

function typographyMissingControls(text) {
  const missing = [];
  if (!/(?:"[^"\n]+")/.test(text)) missing.push('exact quoted text');
  if (!/\b(?:top[- ](?:left|center|right)|center[- ](?:left|right)|bottom[- ](?:left|center|right)|upper|lower|above|below|left of|right of|inside|centered|margin|offset|edge)\b/i.test(text)) missing.push('placement');
  if (!/\b(?:\d+(?:\.\d+)?\s*(?:pt|px|%|percent)|(?:small|large)\s+type)\b/i.test(text)) missing.push('size');
  if (!/(?:#[0-9a-f]{3,8}\b|\b(?:white|black|gray|grey|red|orange|yellow|green|blue|purple|pink|cream|beige|brown|navy|teal|gold|silver|brand[- ]color|brand[- ]colour)\b)/i.test(text)) missing.push('color');
  if (!/\b(?:font|sans[- ]serif|serif|script|display|monospace|handwritten|Helvetica|Arial|Garamond|Futura|SF Pro)\b/i.test(text)) missing.push('font style');
  if (!/\b(?:thin|light|regular|medium|semibold|bold|black|heavy)\b/i.test(text)) missing.push('weight');
  if (!/\b(?:all[- ]caps|uppercase|lowercase|title[- ]case|single[- ]line|two[- ]line|tracking|letter[- ]spacing|shadow|stroke|alignment|aligned|centered|outline|background shape)\b/i.test(text)) missing.push('design structure');
  return missing;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasDescriptiveText(value, minimumWords = 1) {
  return typeof value === 'string' && value.trim().length > 0 && words(value).length >= minimumWords;
}

function isDimensions(value) {
  return typeof value === 'string' && /^\d{3,5}x\d{3,5}$/i.test(value.trim());
}

function strictReplicationReport(req, { prompt, referenceCount }) {
  if (req.replicationMode === undefined || req.replicationMode === null || req.replicationMode === '') return null;

  const errors = [];
  const warnings = [];
  const sourceAnalysis = req.sourceAnalysis;
  const inventory = req.visualInventory;
  const ledger = req.preservationChangeLedger;
  const metrics = {};

  if (req.replicationMode !== STRICT_REPLICATION_MODE) {
    errors.push('replicationMode must be "strict" when provided; omit it for ordinary prompt authoring');
    return { ok: false, errors, warnings, metrics };
  }

  if (!isRecord(sourceAnalysis)) {
    errors.push('strict replication requires sourceAnalysis with dimensions, reference handling, and per-reference roles');
  } else {
    if (!isDimensions(sourceAnalysis.sourceCanvas)) errors.push('sourceAnalysis.sourceCanvas is required in WIDTHxHEIGHT form');
    if (!STRICT_REFERENCE_MODES.has(sourceAnalysis.sourceReferenceMode)) {
      errors.push('sourceAnalysis.sourceReferenceMode must be attached-to-model, analyzed-locally-only, or not-applicable');
    }
    if (!hasDescriptiveText(sourceAnalysis.analysisMethod, 4)) errors.push('sourceAnalysis.analysisMethod must describe how the source was visually analyzed');
    if (sourceAnalysis.sourceReferenceMode === 'attached-to-model' && referenceCount === 0) {
      errors.push('sourceAnalysis says the source is attached-to-model, but the artifact has no image references');
    }
    if (sourceAnalysis.sourceReferenceMode === 'not-applicable' && referenceCount > 0) {
      errors.push('sourceAnalysis cannot be not-applicable when image references are attached');
    }

    const sourceReferences = sourceAnalysis.references;
    if (!Array.isArray(sourceReferences) || sourceReferences.length === 0) {
      errors.push('strict replication requires sourceAnalysis.references with one measured role entry per relevant reference');
    } else {
      const imageIndexes = new Set();
      sourceReferences.forEach((reference, index) => {
        const label = `sourceAnalysis.references[${index}]`;
        if (!isRecord(reference)) {
          errors.push(`${label} must be an object`);
          return;
        }
        if (reference.imageIndex !== null && reference.imageIndex !== undefined) {
          if (!Number.isInteger(reference.imageIndex) || reference.imageIndex < 1 || reference.imageIndex > referenceCount) {
            errors.push(`${label}.imageIndex must identify an attached Image N reference`);
          } else {
            imageIndexes.add(reference.imageIndex);
          }
        }
        if (!isDimensions(reference.dimensions)) errors.push(`${label}.dimensions is required in WIDTHxHEIGHT form`);
        if (!hasDescriptiveText(reference.role, 4)) errors.push(`${label}.role must be a concrete visual role, not a generic label`);
        if (!hasDescriptiveText(reference.preserve, 5)) errors.push(`${label}.preserve must state as-is preservation or the scoped properties to preserve`);
        if (!hasDescriptiveText(reference.changeBoundary, 5)) errors.push(`${label}.changeBoundary must state what this reference must not control`);
        if (AS_IS_REFERENCE.test(reference.preserve)) {
          const reconstructionTerms = appearanceReconstructionTerms(reference.preserve);
          if (words(reference.preserve).length > 45 || reconstructionTerms.length >= 4) {
            warnings.push(`${label}.preserve overdefines an as-is reference; keep the complete attachment as shown instead of inventorying its appearance`);
          }
        }
      });
      for (let imageIndex = 1; imageIndex <= referenceCount; imageIndex += 1) {
        if (!imageIndexes.has(imageIndex)) errors.push(`strict replication is missing measured sourceAnalysis for Image ${imageIndex}`);
      }
      metrics.measuredReferenceCount = sourceReferences.length;
    }
  }

  if (!isRecord(inventory)) {
    errors.push('strict replication requires visualInventory with measured canvas, layout, subject, camera, lighting, palette, typography, and hierarchy');
  } else {
    if (!hasDescriptiveText(inventory.coordinateSystem, 6) || !/\b(?:normalized|percent|percentage|relative)\b/i.test(inventory.coordinateSystem)) {
      errors.push('visualInventory.coordinateSystem must explicitly define normalized relative coordinates');
    }
    for (const field of STRICT_INVENTORY_FIELDS) {
      if (!hasDescriptiveText(inventory[field], 4)) errors.push(`visualInventory.${field} must contain measured visual observations`);
    }
    const elementBoxes = inventory.elementBoxes;
    if (!Array.isArray(elementBoxes) || elementBoxes.length < 3) {
      errors.push('visualInventory.elementBoxes must contain at least three major elements with normalized geometry and z-order');
    } else {
      elementBoxes.forEach((box, index) => {
        const label = `visualInventory.elementBoxes[${index}]`;
        if (!isRecord(box) || !hasDescriptiveText(box.id, 1)) errors.push(`${label}.id is required`);
        if (!isRecord(box)) return;
        for (const field of ['x', 'y', 'w', 'h']) {
          if (typeof box[field] !== 'number' || !Number.isFinite(box[field])) errors.push(`${label}.${field} must be a finite number`);
        }
        if (['x', 'y', 'w', 'h'].every((field) => typeof box[field] === 'number' && Number.isFinite(box[field]))) {
          if (box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 100 || box.y + box.h > 100) {
            errors.push(`${label} must stay inside normalized 0-100 canvas bounds`);
          }
        }
        if (!Number.isInteger(box.zOrder) || box.zOrder < 0) errors.push(`${label}.zOrder must be a non-negative integer`);
        if (!hasDescriptiveText(box.description, 4)) errors.push(`${label}.description must explain the element and its relation to the composition`);
      });
      metrics.elementBoxCount = elementBoxes.length;
    }
  }

  if (!isRecord(ledger)) {
    errors.push('strict replication requires preservationChangeLedger with separate preserve, change, and exclude lists');
  } else {
    for (const field of ['preserve', 'change', 'exclude']) {
      if (!Array.isArray(ledger[field]) || ledger[field].length === 0 || ledger[field].some((item) => !hasDescriptiveText(item, 3))) {
        errors.push(`preservationChangeLedger.${field} must be a non-empty list of concrete instructions`);
      }
    }
    if (Array.isArray(ledger.preserve) && ledger.preserve.length < 4) errors.push('preservationChangeLedger.preserve needs at least four high-risk preserved categories');
    if (Array.isArray(ledger.exclude) && ledger.exclude.length < 3) errors.push('preservationChangeLedger.exclude needs at least three explicit exclusions');
    const preserveItems = new Set((ledger.preserve || []).map((item) => String(item).trim().toLowerCase()));
    const changeItems = new Set((ledger.change || []).map((item) => String(item).trim().toLowerCase()));
    const overlap = [...preserveItems].filter((item) => changeItems.has(item));
    if (overlap.length) errors.push('preservationChangeLedger has the same instruction in preserve and change; scope the exception or remove the contradiction');
  }

  if (!Array.isArray(req.fidelityPriorities) || req.fidelityPriorities.length < 4 || req.fidelityPriorities.some((item) => !hasDescriptiveText(item, 3))) {
    errors.push('strict replication requires at least four concrete fidelityPriorities');
  }
  if (!Array.isArray(req.finalSelfAudit) || req.finalSelfAudit.length < 7 || req.finalSelfAudit.some((item) => !hasDescriptiveText(item, 3))) {
    errors.push('strict replication requires a finalSelfAudit covering the major visual-risk categories');
  } else {
    const auditText = req.finalSelfAudit.join(' ');
    for (const category of STRICT_AUDIT_CATEGORIES) {
      if (!category.pattern.test(auditText)) errors.push(`finalSelfAudit is missing a ${category.name} check`);
    }
  }

  const geometrySignals = ['x', 'y', 'w', 'h'].filter((axis) => new RegExp(`\\b${axis}\\s*=\\s*\\d+(?:\\.\\d+)?%`, 'i').test(prompt));
  metrics.normalizedGeometrySignals = geometrySignals;
  if (geometrySignals.length < 3) errors.push('strict replication prompt must repeat normalized x, y, w, and h geometry for major elements');
  if (!/\b(?:normalized|relative to (?:the )?source|source canvas)\b/i.test(prompt)) errors.push('strict replication prompt must identify the coordinate system or source-canvas relationship');
  if (!/\b(?:z[- ]?order|reading order|hierarchy|layer(?:ing)?)\b/i.test(prompt)) errors.push('strict replication prompt must state visual hierarchy or z-order');
  if (!/\b(?:preserve|retain|keep)\b/i.test(prompt) || !/\b(?:change|replace|adapt|substitute)\b/i.test(prompt)) errors.push('strict replication prompt must state both what is preserved and what intentionally changes');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

export function openAiPromptSemanticReport(req, { slots, referenceCount }) {
  const prompt = String(req.prompt || '').trim();
  const operation = String(req.operation || 'generate').trim().toLowerCase();
  const contents = slotContents(prompt, slots);
  const errors = [];
  const warnings = [];
  const metrics = {};

  for (const [name, minimum] of Object.entries(SLOT_MIN_WORDS)) {
    const text = contents[name] || '';
    const wordCount = words(text).length;
    const meaningfulWords = semanticWordCount(text);
    metrics[name] = { wordCount, meaningfulWords };
    if (wordCount < minimum) errors.push(`${name}: is too short for a production prompt; provide at least ${minimum} words of instruction`);
    if (meaningfulWords < 3) errors.push(`${name}: is vague; replace generic mood language with concrete visual instruction`);
    if (PLACEHOLDER.test(text)) errors.push(`${name}: contains an unresolved placeholder`);
  }

  const references = [];
  for (let imageIndex = 1; imageIndex <= referenceCount; imageIndex += 1) {
    const segment = referenceSegment(prompt, imageIndex);
    const roleDefined = REFERENCE_ROLE.test(segment);
    const useDefined = referenceUseIsDefined(segment);
    references.push({ index: imageIndex, roleDefined, useDefined });
    if (!roleDefined) errors.push(`Image ${imageIndex}: reference label must name a concrete role, such as product, model, setting, base photo, or logo`);
    if (!useDefined) errors.push(`Image ${imageIndex}: reference label must state what to use, preserve, or match from that reference`);
    if (AS_IS_REFERENCE.test(segment)) {
      const reconstructionTerms = appearanceReconstructionTerms(segment);
      if (words(segment).length > 65 || reconstructionTerms.length >= 4) {
        warnings.push(`Image ${imageIndex}: as-is reference appears overdefined; let the attached image supply appearance and keep the declaration to role plus allowed changes`);
      }
    }
  }

  const scene = contents['Scene/background'] || '';
  const subject = contents.Subject || '';
  const keyDetails = contents['Key details'] || '';
  const typography = contents.Typography || '';
  const constraints = contents.Constraints || '';
  const strictReplication = strictReplicationReport(req, { prompt, referenceCount });
  if (strictReplication) {
    errors.push(...strictReplication.errors);
    warnings.push(...strictReplication.warnings);
  }
  const visualInstruction = [scene, subject, keyDetails].join('\n');
  const referenceBackdrop = references.some((reference) => reference.roleDefined && reference.useDefined
    && /\b(?:base|target|setting|location|background|scene)\b/i.test(referenceSegment(prompt, reference.index)));

  if (!referenceBackdrop && !SETTING.test(scene)) {
    errors.push('Scene/background: must identify a concrete setting, background treatment, or role-labeled setting reference');
  }

  const compositionSignals = signalNames(visualInstruction, COMPOSITION_SIGNALS);
  const hasShotOrLayout = compositionSignals.includes('shot scale') || compositionSignals.includes('framing or layout');
  const hasCameraOrLens = compositionSignals.includes('camera angle or perspective') || compositionSignals.includes('lens or focal length');
  const compositionState = categoryState(prompt, CONFLICT_CATEGORIES[0].pattern);
  const isEdit = operation === 'edit' || operation === 'mask-edit';
  if (isEdit) {
    if (!compositionState.preserve && !(hasShotOrLayout && hasCameraOrLens)) {
      errors.push('camera/composition is under-specified for this edit; explicitly preserve framing, crop, and camera perspective or define the intended camera result');
    }
  } else if (!compositionState.preserve && !(hasShotOrLayout && hasCameraOrLens)) {
    errors.push('camera/composition is under-specified; include a shot or framing decision plus a camera angle, perspective, or lens decision');
  }

  const lightingSignals = signalNames(visualInstruction, LIGHTING_SIGNALS);
  const lightingState = categoryState(prompt, CONFLICT_CATEGORIES[1].pattern);
  if (isEdit) {
    if (!lightingState.preserve && !lightingState.change) {
      errors.push('lighting is under-specified for this edit; state whether lighting is preserved or describe the controlled lighting change');
    } else if (lightingState.change && lightingSignals.length < 2) {
      errors.push('lighting change is too vague; specify at least two of source/direction, quality, white balance, or tonal behavior');
    }
  } else if (!lightingState.preserve && lightingSignals.length < 2) {
    errors.push('lighting is under-specified; specify at least two of source/direction, quality, white balance, or tonal behavior');
  }

  for (const category of CONFLICT_CATEGORIES) {
    const state = categoryState(prompt, category.pattern);
    if (state.preserve && state.change && !/\b(?:except|other than|while preserving|only change|change only)\b/i.test(prompt)) {
      errors.push(`conflicting preserve/change instructions for ${category.name}; choose one outcome or state a clear exception`);
    }
  }

  if (!TYPOGRAPHY_NONE.test(typography)) {
    const missingControls = typographyMissingControls(typography);
    if (missingControls.length) errors.push(`Typography: baked text is under-specified; add ${missingControls.join(', ')}`);
  }

  if (!CONTROL.test(constraints)) {
    errors.push('Constraints: must state a concrete preserve, exclusion, or scope boundary');
  }
  if (words(constraints).length > 120) {
    warnings.push('Constraints: is unusually long; keep it to concise reference, scope, claim, text, and unwanted-addition guardrails without re-describing supplied objects');
  }
  const constraintReconstructionTerms = appearanceReconstructionTerms(constraints);
  if (referenceCount > 0 && constraintReconstructionTerms.length >= 6) {
    warnings.push('Constraints: repeats too much supplied-object anatomy; let attached references define appearance and keep only preserve/change/exclusion boundaries');
  }

  const vagueTerms = [...new Set((visualInstruction.match(/\b(?:beautiful|stunning|amazing|nice|premium|luxury|clean|high[- ]quality|professional|cinematic|aesthetic|elevated)\b/gi) || []).map((term) => term.toLowerCase()))];
  if (vagueTerms.length) warnings.push(`replace vague style labels where possible: ${vagueTerms.join(', ')}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    operation,
    metrics,
    references,
    compositionSignals,
    lightingSignals,
    strictReplication,
  };
}
