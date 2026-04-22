---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
upstream:
  source: null
  last_synced: "2026-04-22"
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:

- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Project Integration

When building components in a typed monorepo, prefer generated code for data fetching and shared packages for UI primitives.

### Generated Code for Data Fetching

Many projects use code-generators (GraphQL codegen, OpenAPI generators, or schema-engine variants) to produce typed hooks, fragments, and query-key utilities. Prefer generated hooks over writing custom queries:

```typescript
// Example: generated GraphQL hooks (TanStack Query-based)
import { useGetProjectsListQuery } from '~/generated/graphql/hooks/default'
import { useGetOrganizationsListQuery } from '~/generated/graphql/hooks/organization'

// Types generated from schema/entity definitions
import type { Organization, Project } from '~/generated/types'

// Reusable fragments and query-key utilities
import type { ProjectsListFragment } from '~/generated/graphql'
import { listQueryKeyBase } from '~/generated/query-keys'
```

**Fragment Composition Pattern**: Entities can define reusable fragments that generators compose into typed hooks. Prefer entity-specific hooks (e.g., `useGetProjectsListQuery`) over hand-rolled queries.

**GraphQL Client**: Always pass the client instance to generated hooks:

```typescript
import { client } from '~/lib/graphql-client'

const { data, isLoading, error } = useGetProjectsListQuery(
  client,
  { where: { org_id: { _eq: orgId } } },
  { enabled: !!orgId },
)
```

### Monorepo Component Imports

Typical shared-package import patterns:

```typescript
// Shared UI primitives
import { Button, Card, Modal } from '@myorg/ui'

// Route error boundaries
import { RouteErrorBoundary } from '@myorg/ui'

// Database schemas (for backend/integration tests)
import * as schema from '~/generated/drizzle/schemas'

// Test utilities (integration testing only)
import { createIntegrationContext } from '@myorg/test-utils'
import { projectsFactory } from '~/generated/factories'
```

**Cross-Package Reference**: See the `monorepo-navigation` skill for your project's package structure and import patterns.

## React Router v7 Patterns

For React Router v7 projects, follow these data loading patterns:

### Data Loading via Loaders

For route-level data that must be available on render, use loaders (NOT TanStack Query):

```typescript
import type { Route } from '../+types/home'

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const cookieSource = request.headers.get('cookie')

  return {
    hasPlatformSession: hasPlatformSessionCookie(cookieSource),
    features: getEnvironmentFeatures(),
  }
}

export default function Home() {
  const { hasPlatformSession, features } = useLoaderData<typeof loader>()
  // Loader data is immediately available, no loading states needed
}
```

**When to use loaders**: Initial route data, authentication checks, feature flags, URL parsing. Loaders run server-side (or during prerendering) and block navigation until complete.

### Client-Side Mutations

For mutations and dynamic client-side data, use generated mutation hooks:

```typescript
import { useCreateProjectMutation } from '~/generated/graphql/hooks/default'
import { client } from '~/lib/graphql-client'

function CreateProjectForm() {
  const mutation = useCreateProjectMutation(client)

  const handleSubmit = async (formData: ProjectInput) => {
    await mutation.mutateAsync({ input: formData })
  }
}
```

### Navigation Patterns

```typescript
import { useNavigate, useParams } from 'react-router'

function ProjectDetail() {
  const navigate = useNavigate()
  const { projectSlug, orgSlug } = useParams<{ projectSlug: string; orgSlug: string }>()

  // Navigate programmatically
  const goToSettings = () => {
    navigate(`/organizations/${orgSlug}/projects/${projectSlug}/settings`)
  }
}
```

**Error Boundaries**: Always export an `ErrorBoundary` for routes:

```typescript
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorBoundary error={error} />
}
```

## Development Workflow

Use your project's task runner (e.g., `just`, `make`, `nx`, `turbo`, or npm scripts) for repository operations rather than calling package managers directly. Refer to your project's `AGENTS.md` or top-level docs for the canonical commands.

**Long-Running Commands**: Full-repo `qa`, `test`, and `build` tasks often take several minutes. Run them once at start, use scoped commands for iteration, then run once at end for final verification.
