export const TOOL_NAMES = [
  'list_canvas',
  'list_uploaded_refs',
  'read_brand_context',
  'create_model_node',
  'create_setting_node',
  'create_prompt_node',
  'create_carousel_node',
  'connect_nodes',
  'generate_node',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_DISPLAY: Record<ToolName, { label: string; emoji: string }> = {
  list_canvas:         { label: 'Scanning canvas',       emoji: '🧭' },
  list_uploaded_refs:  { label: 'Checking references',   emoji: '🗂️' },
  read_brand_context:  { label: 'Reading brand context', emoji: '🎨' },
  create_model_node:   { label: 'Creating model node',   emoji: '🧍' },
  create_setting_node: { label: 'Creating setting node', emoji: '🏖️' },
  create_prompt_node:  { label: 'Creating prompt node',  emoji: '🎬' },
  create_carousel_node:{ label: 'Creating carousel',     emoji: '🎞️' },
  connect_nodes:       { label: 'Connecting nodes',      emoji: '🔗' },
  generate_node:       { label: 'Generating',            emoji: '✨' },
};

export interface ListCanvasInput {
  // no args
  [k: string]: never;
}

export interface ListUploadedRefsInput {
  [k: string]: never;
}

export interface ReadBrandContextInput {
  [k: string]: never;
}

export interface CreateModelNodeInput {
  description: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  model?: string;
}

export interface CreateSettingNodeInput {
  description: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  model?: string;
  compositeMode?: 'single' | 'multi-angle';
  compositeAngles?: string[];
}

export interface CreatePromptNodeInput {
  prompt: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  model?: string;
  connectFrom?: string[];
}

export interface CreateCarouselSlideInput {
  prompt: string;
  plateFlag?: boolean;
}

export interface CreateCarouselNodeInput {
  slides: CreateCarouselSlideInput[];
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  model?: string;
  connectFrom?: string[];
}

export interface ConnectNodesInput {
  sourceId: string;
  targetId: string;
}

export interface GenerateNodeInput {
  nodeId: string;
}

export type ToolInput =
  | ({ name: 'list_canvas' } & ListCanvasInput)
  | ({ name: 'list_uploaded_refs' } & ListUploadedRefsInput)
  | ({ name: 'read_brand_context' } & ReadBrandContextInput)
  | ({ name: 'create_model_node' } & CreateModelNodeInput)
  | ({ name: 'create_setting_node' } & CreateSettingNodeInput)
  | ({ name: 'create_prompt_node' } & CreatePromptNodeInput)
  | ({ name: 'create_carousel_node' } & CreateCarouselNodeInput)
  | ({ name: 'connect_nodes' } & ConnectNodesInput)
  | ({ name: 'generate_node' } & GenerateNodeInput);

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  nodeId?: string;
}
