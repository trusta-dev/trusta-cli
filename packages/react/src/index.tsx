import {
  canonicalOrgUrl,
  canonicalProjectUrl,
  fetchTrustCenter,
  fetchTrustProfile,
} from './fetch';
import {
  BadgeView,
  CardView,
  CenterView,
  StripView,
  Unavailable,
  paletteFor,
} from './view';
import type { TrustEmbedProps, TrustProjectEmbedProps } from './types';

/**
 * `@trusta/react` — live trust status, on your own site.
 *
 * These are React Server Components: they fetch on the host's server, so there
 * is no client-side key, no layout shift and no request from the visitor's
 * browser to Trusta. Customers are Next.js developers and this is the shape
 * that costs them nothing.
 *
 * For client-side rendering — a SPA, or a page that must not block on the
 * fetch — import the same four components from `@trusta/react/client`.
 *
 * ## What happens when Trusta is down
 *
 * The fetch is cached by the host framework for `revalidateSeconds`. When a
 * revalidation fails, Next serves the last good copy, and every variant carries
 * its own computation timestamp — so a reader sees a real reading that is
 * visibly old rather than a spinner. With nothing cached at all, the components
 * render an explicit "Live status unavailable" with a link to the canonical
 * page. Never a hole in the layout, and never a pass.
 *
 * ## What these will never do
 *
 * Take state as a prop, hide a failing control, or render the documents
 * section. The first two are ADR 0015 invariants; the third is a boundary —
 * documents are gated, cookie-bound and served live, and nothing about them
 * belongs in a component that renders on a stranger's domain.
 */

export type {
  TrustCenterData,
  TrustControl,
  TrustControlCategory,
  TrustEmbedProps,
  TrustProfile,
  TrustProject,
  TrustProjectEmbedProps,
  TrustState,
  TrustSummary,
  TrustSystem,
} from './types';
export { canonicalOrgUrl, canonicalProjectUrl } from './fetch';

/** Every published system in an organisation. */
export async function TrustCenter(props: TrustEmbedProps) {
  const palette = paletteFor(props.theme);
  const result = await fetchTrustCenter(props.org, {
    baseUrl: props.baseUrl,
    revalidateSeconds: props.revalidateSeconds,
  });

  if (!result.ok) {
    return (
      <Unavailable
        href={canonicalOrgUrl(props.org)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <CenterView
      org={props.org}
      data={result.data}
      palette={palette}
      className={props.className}
    />
  );
}

/** One system, with its controls. */
export async function TrustCard(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const result = await fetchTrustProfile(props.org, props.project, {
    baseUrl: props.baseUrl,
    revalidateSeconds: props.revalidateSeconds,
  });

  if (!result.ok) {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <CardView
      org={props.org}
      project={props.project}
      profile={result.data}
      palette={palette}
      className={props.className}
    />
  );
}

/** One system, on one line. */
export async function TrustStrip(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const result = await fetchTrustProfile(props.org, props.project, {
    baseUrl: props.baseUrl,
    revalidateSeconds: props.revalidateSeconds,
  });

  if (!result.ok) {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <StripView
      org={props.org}
      project={props.project}
      profile={result.data}
      palette={palette}
      className={props.className}
    />
  );
}

/** The smallest honest readout: state, and when it was computed. */
export async function TrustBadge(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const result = await fetchTrustProfile(props.org, props.project, {
    baseUrl: props.baseUrl,
    revalidateSeconds: props.revalidateSeconds,
  });

  if (!result.ok) {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <BadgeView
      org={props.org}
      project={props.project}
      profile={result.data}
      palette={palette}
      className={props.className}
    />
  );
}
