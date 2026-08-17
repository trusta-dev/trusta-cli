# @trusta/react

Live trust status, rendered on your own site.

```tsx
import { TrustCenter, TrustCard, TrustStrip, TrustBadge } from '@trusta/react';

<TrustCenter org="northbound" />
<TrustCard org="northbound" project="payments-svc" />
<TrustStrip org="northbound" project="payments-svc" />
<TrustBadge org="northbound" project="payments-svc" />
```

These are React Server Components. They fetch on your server, so there is no
client-side key, no request from your visitor's browser, and no layout shift.
For a SPA or any page without a server render, import the same four components
from `@trusta/react/client`.

## Props

| | |
|---|---|
| `org` | Your organisation slug. Required. |
| `project` | System slug. Required for everything except `TrustCenter`. |
| `theme` | `light` (default) or `dark`. |
| `className` | Passed through to the outer element. |
| `baseUrl` | Override the API host. For self-hosting. |
| `revalidateSeconds` | How long your framework may cache the reading. Default 300. |

There is no state prop, and there will not be one. See below.

## What these will never do

**Take state as a prop.** There is no `passing={24}`. A component that accepted
one would let anyone render a perfect score, with no evidence behind it, on
their own domain, wearing Trusta's mark — which refutes the product's entire
claim in one line of JSX.

**Hide a failing control.** There is no `hideFailing`, no embed-only visibility
setting, and the card sorts failures to the top. A trust page that omits the
failing system is worse than no trust page, because it looks complete.

**Render your documents.** Documents are gated, cookie-bound and served live.
Nothing about them belongs in a component that renders on a page Trusta does
not control.

## When Trusta is down

Your component is on your homepage, so this is your brand event, not ours.

The fetch is cached by your framework for `revalidateSeconds`. When a
revalidation fails, Next serves the last good copy — and because every variant
carries its own computation time, your reader sees a real reading that is
visibly old ("computed 3 hours ago") rather than a spinner.

With nothing cached at all — a first render during an outage — the components
render a bordered line reading *"Live status unavailable"* with a link to your
canonical trust page. Never a hole in your layout, and never a pass.

## Dependencies

None at runtime. React is a peer dependency; everything else is inlined,
including the styles, which are inline attributes rather than a stylesheet you
would have to wire into your build.

## Allowed origins

Published trust data is public by definition, and this package reads it without
credentials. Any origin allowlist offered in the dashboard is there so you can
see where your embeds are used — it is **not** a security control, and nothing
in this package treats it as one.
