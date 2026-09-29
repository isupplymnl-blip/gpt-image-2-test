#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openAiPromptSemanticReport } from './gpt-image-2-prompt-semantics.mjs';

const SLOT_DEFINITIONS = [
  { name: 'Scene/background', marker: 'Scene/background:' },
  { name: 'Subject', marker: 'Subject:' },
  { name: 'Key details', marker: 'Key details:' },
  { name: 'Typography', marker: 'Typography:' },
  { name: 'Constraints', marker: 'Constraints:' },
];
const VALID_OPERATIONS = new Set(['generate', 'reference-generate', 'edit', 'mask-edit']);
const FORBIDDEN_FLAGS = [/(?:^|\s)--ar(?:\s|$)/i, /(?:^|\s)--v(?:\s|$)/i, /(?:^|\s)--stylize(?:\s|$)/i, /(?:^|\s)--chaos(?:\s|$)/i, /(?:^|\s)--seed(?:\s|$)/i, /(?:^|\s)--iw(?:\s|$)/i, /(?:^|\s)--sref(?:\s|$)/i];
const EXECUTION_FIELDS = ['output', 'outputPath', 'output_path', 'out', 'outDir', 'out_dir', 'metadataOutput', 'metadata_output', 'apiKey', 'api_key', 'baseUrl', 'base_url', 'provider', 'envPath', 'env_path', 'upload', 'uploadFile', 'upload_file'];

function countReferences(request) {
  if (Array.isArray(request.images)) return request.images.filter(Boolean).length;
  return request.image ? 1 : 0;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function reportFor(request) {
  const issues = [];
  const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
  const referenceCount = countReferences(request);
  if (request.lintOnly !== true) issues.push('lint artifact must set lintOnly: true');
  for (const field of EXECUTION_FIELDS) {
    if (request[field] !== undefined && request[field] !== null && request[field] !== '') issues.push('lint artifact must not include ' + field + '; this skill is prompt-only');
  }
  if (!VALID_OPERATIONS.has(request.operation)) issues.push('operation must be one of generate, reference-generate, edit, or mask-edit');
  if (typeof request.assetId !== 'string' || !request.assetId.trim()) issues.push('assetId is required');
  if (typeof request.aspectRatio !== 'string' || !request.aspectRatio.trim()) issues.push('aspectRatio is required');
  if (typeof request.mappedDimensions !== 'string' || !/^\d{3,5}x\d{3,5}$/i.test(request.mappedDimensions.trim())) issues.push('mappedDimensions is required in WIDTHxHEIGHT form, for example 1024x1536');
  if (!prompt) return { ok: false, issues: [...issues, 'prompt is required'], warnings: [], referenceCount, requiredSlots: SLOT_DEFINITIONS.map((slot) => slot.name), semantic: null };

  const slots = SLOT_DEFINITIONS.map((slot) => ({ ...slot, index: prompt.indexOf(slot.marker), markerLength: slot.marker.length }));
  for (const slot of slots) {
    if (slot.index < 0) issues.push('missing ' + slot.name + ': slot');
    else if (countOccurrences(prompt, slot.marker) !== 1) issues.push(slot.name + ': slot must appear exactly once');
  }
  if (slots.every((slot) => slot.index >= 0)) {
    if (slots[0].index !== 0) issues.push('Scene/background: must start the prompt body');
    for (let index = 1; index < slots.length; index += 1) {
      if (slots[index].index <= slots[index - 1].index) { issues.push('slot order must be Scene/background -> Subject -> Key details -> Typography -> Constraints'); break; }
    }
  }
  for (let index = 1; index <= referenceCount; index += 1) {
    const label = new RegExp('\\bImage\\s+' + index + '\\s*:', 'i');
    const match = label.exec(prompt);
    if (!match) issues.push('missing Image ' + index + ': reference label');
    else if (slots[1].index >= 0 && match.index > slots[1].index) issues.push('Image ' + index + ': reference label must appear before Subject: composition instructions');
  }
  if (FORBIDDEN_FLAGS.some((pattern) => pattern.test(prompt))) issues.push('Midjourney flags are not allowed in GPT Image 2 prompts');
  const semantic = issues.length === 0 && slots.every((slot) => slot.index >= 0)
    ? openAiPromptSemanticReport(request, { slots, referenceCount })
    : null;
  if (semantic) issues.push(...semantic.errors);
  return { ok: issues.length === 0, issues, warnings: semantic?.warnings || [], referenceCount, requiredSlots: SLOT_DEFINITIONS.map((slot) => slot.name), semantic };
}

const [command, artifactPath] = process.argv.slice(2);
if (command !== '--check-prompt' || !artifactPath) {
  process.stderr.write('Usage: node gpt-image-2-prompt-lint.mjs --check-prompt <lint-artifact.json>\n');
  process.exitCode = 2;
} else {
  try {
    const request = JSON.parse(readFileSync(resolve(artifactPath), 'utf8'));
    const report = reportFor(request);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, issues: [error.message], warnings: [] }, null, 2) + '\n');
    process.exitCode = 2;
  }
}
