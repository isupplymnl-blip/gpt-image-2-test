import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasGeminiKey  = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAIKey  = Boolean(process.env.OPENAI_API_KEY);

  // Default provider: openai if only that key present, otherwise gemini
  const provider = hasGeminiKey ? 'gemini' : hasOpenAIKey ? 'openai' : null;

  return NextResponse.json({ hasGeminiKey, hasOpenAIKey, provider });
}
