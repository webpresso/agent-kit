---
type: skill
slug: vercel-react-best-practices
title: Vercel React Best Practices
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.
license: MIT
metadata: 
  author: vercel
  version: '1.0.0'
upstream: 
  source: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
  last_synced: "2026-05-28"
---

# Vercel React Best Practices

> **⚠️ SCOPE NOTICE: This skill covers React patterns from Vercel Engineering that originated in Next.js.**
>
> **If your project does not use Next.js** (e.g., you use React Router v7, Remix, Vite SPA, etc.), apply these patterns selectively:
>
> - ✅ **Universal React patterns**: Component composition, hooks best practices, bundle optimization, re-render optimization, JavaScript performance
> - ⚠️ **Adapt**: Data fetching patterns (use your router's loader equivalent instead of Next.js patterns)
> - ❌ **Next.js-specific**: Server Components, Server Actions, `next/dynamic`, `next/image`, RSC boundaries, `after()` API
>
> See the "Non-Next.js Equivalents" section below for alternatives.

Comprehensive performance optimization guide for React and Next.js applications, maintained by Vercel. Contains 45 rules across 8 categories, prioritized by impact to guide automated refactoring and code generation.

## Non-Next.js Equivalents

When applying Next.js patterns to a React Router v7 (or similar non-Next.js) stack:

| Next.js Pattern                 | React Router v7 Equivalent            | Applicability                  |
| ------------------------------- | ------------------------------------- | ------------------------------ |
| `getServerSideProps`            | Route `loader` function               | ✅ Direct equivalent           |
| `getStaticProps`                | Static data in `loader` with caching  | ✅ Direct equivalent           |
| Server Components (RSC)         | Loader + client component split       | ⚠️ Architecture differs        |
| `next/dynamic`                  | `React.lazy()` + `<Suspense>`         | ✅ Standard React pattern      |
| `next/image`                    | Standard `<img>` + optimization layer | ⚠️ Manual optimization         |
| Server Actions (`"use server"`) | RR7 `action` functions                | ✅ Similar pattern             |
| `React.cache()` (per-request)   | Module-level caching in loaders       | ⚠️ Manual implementation       |
| `after()` API                   | Not available                         | ❌ Use standard async patterns |
| RSC serialization boundaries    | JSON serialization in loaders         | ⚠️ Different constraints       |

**Key Differences:**

- **Data Fetching**: RR7 uses `loader` functions (run server-side) instead of `getServerSideProps`
- **Mutations**: RR7 uses `action` functions instead of Server Actions
- **Component Model**: RR7 doesn't have Server Components - all components are client components, but loaders run server-side
- **Code Splitting**: Use standard React patterns (`React.lazy`, `Suspense`) instead of Next.js-specific APIs

## When to Apply

Reference these guidelines when:

- Writing new React components or React Router v7 routes
- Implementing data fetching (use RR7 loaders, not Next.js patterns)
- Reviewing code for performance issues
- Refactoring existing React code
- Optimizing bundle size or load times

**When NOT to apply:**

- Server Component patterns (sections 3.2, 3.4, 3.6) - RR7 doesn't use RSC
- `next/dynamic`, `next/image` APIs - use React.lazy and standard HTML
- `after()` API (section 3.7) - Not available in RR7

## Rule Categories by Priority

| Priority | Category                  | Impact      | Prefix       | Non-Next.js Applicability      |
| -------- | ------------------------- | ----------- | ------------ | ------------------------------ |
| 1        | Eliminating Waterfalls    | CRITICAL    | `async-`     | ✅ Universal                   |
| 2        | Bundle Size Optimization  | CRITICAL    | `bundle-`    | ✅ Adapt (use React.lazy)      |
| 3        | Server-Side Performance   | HIGH        | `server-`    | ⚠️ Partial (skip RSC-specific) |
| 4        | Client-Side Data Fetching | MEDIUM-HIGH | `client-`    | ✅ Universal                   |
| 5        | Re-render Optimization    | MEDIUM      | `rerender-`  | ✅ Universal                   |
| 6        | Rendering Performance     | MEDIUM      | `rendering-` | ✅ Universal                   |
| 7        | JavaScript Performance    | LOW-MEDIUM  | `js-`        | ✅ Universal                   |
| 8        | Advanced Patterns         | LOW         | `advanced-`  | ✅ Universal                   |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files ✅
- `bundle-dynamic-imports` - ⚠️ **RR7**: Use `React.lazy()` instead of `next/dynamic`
- `bundle-defer-third-party` - Load analytics/logging after hydration ✅
- `bundle-conditional` - Load modules only when feature is activated ✅
- `bundle-preload` - Preload on hover/focus for perceived speed ✅

### 3. Server-Side Performance (HIGH)

- `server-cache-react` - ❌ **RR7**: Use module-level caching in loaders instead
- `server-cache-lru` - Use LRU cache for cross-request caching ✅
- `server-serialization` - ⚠️ **RR7**: Apply to loader return values (not RSC props)
- `server-parallel-fetching` - ⚠️ **RR7**: Parallelize fetches within loaders
- `server-after-nonblocking` - ❌ **RR7**: Not available, use standard async patterns

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners

### 5. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-transitions` - Use startTransition for non-urgent updates

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache localStorage/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-use-latest` - useLatest for stable callback refs

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
rules/_sections.md
```

Each rule file contains:

- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`

**Note**: The full document contains Next.js-specific examples. When reading:

1. Focus on the "why" and general principles
2. Adapt implementation details for React Router v7
3. Skip sections explicitly about Server Components, RSC boundaries, or Next.js APIs

## Recommendations for Non-Next.js Usage

**High-Value Patterns (Apply directly):**

- All async/waterfall elimination patterns (Section 1)
- Component re-render optimization (Section 5)
- Rendering performance patterns (Section 6)
- JavaScript performance micro-optimizations (Section 7)
- Bundle optimization strategies (Section 2) - adapt `next/dynamic` to `React.lazy()`

**Adapt for React Router v7:**

- Data fetching: Translate to loader functions
- Server Actions: Translate to action functions
- Dynamic imports: Use `React.lazy()` + `<Suspense>`

**Skip for non-Next.js projects:**

- Server Component-specific patterns (RSC boundaries, serialization)
- `React.cache()` (use module-level caching)
- `after()` API (not available)
- Next.js-specific image/font optimization APIs

**Cross-reference:**

- For generic frontend design patterns, see the `frontend-design` skill
- For React Router v7 data patterns, see project documentation and route examples
