# Gemini vs Pudding Configuration Differences

## Overview
- **Gemini**: Direct Google Gemini API (official)
- **Pudding**: Chinese proxy for Gemini API (cheaper alternative)

## Key Differences

### 1. API Endpoint
| Provider | Endpoint | API Version |
|----------|----------|-------------|
| **Gemini** | `https://generativelanguage.googleapis.com` | `v1beta` |
| **Pudding** | `https://new.apipudding.com` (configurable via `PUDDING_BASE_URL`) | `v1beta` |

### 2. Authentication
| Provider | Env Var | Key Format |
|----------|---------|------------|
| **Gemini** | `GEMINI_API_KEY` | `AIzaSy...` |
| **Pudding** | `PUDDING_API_KEY` | `sk-...` |

### 3. Model Names
| Provider | Flash Model | Pro Model |
|----------|-------------|-----------|
| **Gemini** | `gemini-3.1-flash-image-preview` | `gemini-3-pro-image-preview` |
| **Pudding** | `[官逆C]Nano banana 2` (URL-encoded) | `[官逆C]Nano banana pro(大香蕉)` (URL-encoded) |

**Pudding model resolution:**
```typescript
// Pudding uses Chinese model names with resolution suffix
'flash-1k' → '[官逆C]Nano banana 2'
'flash-2k' → '[官逆C]Nano banana 2-2k'
'pro-1k'   → '[官逆C]Nano banana pro(大香蕉)'
'pro-2k'   → '[官逆C]Nano banana pro-2k'
```

**Gemini model resolution:**
```typescript
// Gemini uses standard Google model IDs
'Flash'    → 'gemini-3.1-flash-image-preview'
'Pro'      → 'gemini-3-pro-image-preview'
'Standard' → 'gemini-2.5-flash-image'
```

### 4. Error Handling
| Provider | 503 Fallback | Retry Logic |
|----------|--------------|-------------|
| **Gemini** | ✅ Auto-fallback to Pro model on 503 | 1.5s delay + retry |
| **Pudding** | ❌ No auto-fallback | Standard retry |

### 5. Pricing
| Provider | Cost | Billing |
|----------|------|---------|
| **Gemini** | Official Google pricing | Per-request |
| **Pudding** | ~50-70% cheaper | Per-resolution tier |

### 6. Configuration Code

**Gemini (`/api/generate/route.ts`):**
```typescript
function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey });
}

function resolveModel(label?: string): string {
  const MODEL_MAP = {
    'Flash': 'gemini-3.1-flash-image-preview',
    'Pro': 'gemini-3-pro-image-preview',
    'Standard': 'gemini-2.5-flash-image',
  };
  return MODEL_MAP[label] ?? 'gemini-3.1-flash-image-preview';
}
```

**Pudding (`/api/pudding/generate/route.ts`):**
```typescript
function getAI(): GoogleGenAI {
  const apiKey = process.env.PUDDING_API_KEY;
  const baseUrl = process.env.PUDDING_BASE_URL ?? 'https://new.apipudding.com';
  return new GoogleGenAI({
    apiKey,
    httpOptions: { baseUrl, apiVersion: 'v1beta' },
  });
}

function resolvePuddingModel(model: string, imageSize: string): string {
  const tier = model.toLowerCase().startsWith('pro') ? 'pro' : 'flash';
  const res = imageSize === '2K' ? '2k' : '1k';
  const map = {
    'flash-1k': '[官逆C]Nano banana 2',
    'flash-2k': '[官逆C]Nano banana 2-2k',
    'pro-1k': '[官逆C]Nano banana pro(大香蕉)',
    'pro-2k': '[官逆C]Nano banana pro-2k',
  };
  return encodeURIComponent(map[`${tier}-${res}`]);
}
```

### 7. Shared Features (Identical)
- ✅ Same API interface (GoogleGenAI SDK)
- ✅ Same safety settings
- ✅ Same image size options (1K, 2K, 4K)
- ✅ Same reference image handling (sharp resize to 1024px)
- ✅ Same response parsing logic
- ✅ Same streaming support

## When to Use Which?

| Use Case | Recommended |
|----------|-------------|
| **Production (US/EU)** | Gemini (official, reliable) |
| **Cost-sensitive** | Pudding (cheaper) |
| **China-based** | Pudding (better latency) |
| **High availability** | Gemini (auto-fallback to Pro) |
| **Testing/dev** | Either (both work identically) |

## Summary
**Pudding = Gemini proxy with Chinese model names + cheaper pricing**. Same underlying Gemini models, just routed through a different endpoint with localized naming.
