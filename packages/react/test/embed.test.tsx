import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BadgeView,
  CardView,
  CenterView,
  StripView,
  Unavailable,
  paletteFor,
  relativeTime,
} from '../src/view';
import type { TrustCenterData, TrustProfile } from '../src/types';
const palette = paletteFor('light');
const now = Date.parse('2026-08-17T12:00:00.000Z');

const profile: TrustProfile = {
  project: { slug: 'payments-svc', name: 'Payments' },
  version: 4,
  publishedAt: '2026-08-17T11:56:00.000Z',
  summary: {
    overallState: 'fail',
    totalControls: 10,
    passCount: 7,
    failCount: 2,
    staleCount: 0,
    degradedCount: 0,
    unknownCount: 1,
  },
  controls: [
    {
      key: 'security.hsts_enforced',
      category: 'security',
      name: 'HSTS enforced',
      state: 'pass',
      latestEvidenceAt: null,
    },
    {
      key: 'security.csp_configured',
      category: 'security',
      name: 'Content-Security-Policy configured',
      state: 'fail',
      latestEvidenceAt: null,
    },
  ],
  description: null,
};

const center: TrustCenterData = {
  organization: { slug: 'northbound', name: 'Northbound' },
  systems: [
    {
      slug: 'payments-svc',
      name: 'Payments',
      version: 4,
      publishedAt: '2026-08-17T11:56:00.000Z',
      summary: profile.summary,
      description: null,
    },
  ],
};

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('embed invariant: always a way home', () => {
  it('every variant carries a computation time and a link to the canonical page', () => {
    // ADR 0015 invariant 3. A trust widget without "computed 4 minutes ago" is
    // a badge, and a badge is decoration.
    const variants = [
      render(
        <BadgeView
          org='northbound'
          project='payments-svc'
          profile={profile}
          palette={palette}
          now={now}
        />,
      ),
      render(
        <StripView
          org='northbound'
          project='payments-svc'
          profile={profile}
          palette={palette}
          now={now}
        />,
      ),
      render(
        <CardView
          org='northbound'
          project='payments-svc'
          profile={profile}
          palette={palette}
          now={now}
        />,
      ),
      render(
        <CenterView
          org='northbound'
          data={center}
          palette={palette}
          now={now}
        />,
      ),
    ];

    for (const html of variants) {
      expect(html).toContain('trust.trusta.dev/northbound');
      expect(html).toContain('4 minutes ago');
    }
  });

  it('links home even when the status could not be read', () => {
    const html = render(
      <Unavailable
        href='https://trust.trusta.dev/northbound'
        palette={palette}
      />,
    );

    expect(html).toContain('trust.trusta.dev/northbound');
    expect(html).toContain('unavailable');
  });
});

describe('embed invariant: one publish, many views', () => {
  it('shows a failing control rather than the passing ones only', () => {
    // Invariant 2 is the one that will be argued with: a customer with an
    // embarrassing system will ask to hide it. A card that opened with the
    // reassuring half of the list would do it for them by default.
    const html = render(
      <CardView
        org='northbound'
        project='payments-svc'
        profile={profile}
        palette={palette}
        now={now}
      />,
    );

    const failingAt = html.indexOf('Content-Security-Policy configured');
    const passingAt = html.indexOf('HSTS enforced');
    expect(failingAt).toBeGreaterThan(-1);
    expect(failingAt).toBeLessThan(passingAt);
  });

  it('never renders anything from the gated documents section', () => {
    // Documents are cookie-bound and served live. The embed's type surface has
    // no field for them, so this asserts the boundary holds in the output too.
    const html = render(
      <CardView
        org='northbound'
        project='payments-svc'
        profile={profile}
        palette={palette}
        now={now}
      />,
    );

    expect(html.toLowerCase()).not.toContain('document');
    expect(html.toLowerCase()).not.toContain('download');
    expect(html.toLowerCase()).not.toContain('nda');
  });

  it('reports the real counts, including the ones nobody wants to publish', () => {
    const html = render(
      <StripView
        org='northbound'
        project='payments-svc'
        profile={profile}
        palette={palette}
        now={now}
      />,
    );

    expect(html).toContain('7/10 checks passing');
    expect(html).toContain('Failing');
  });
});

describe('relative time', () => {
  it('reads in the units a person would use', () => {
    expect(relativeTime('2026-08-17T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-08-17T11:45:00.000Z', now)).toBe(
      '15 minutes ago',
    );
    expect(relativeTime('2026-08-17T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-08-15T12:00:00.000Z', now)).toBe('2 days ago');
  });

  it('degrades to a word rather than throwing on a bad timestamp', () => {
    // This renders on someone else's homepage. Nothing here gets to throw.
    expect(relativeTime('not-a-date', now)).toBe('recently');
  });
});
