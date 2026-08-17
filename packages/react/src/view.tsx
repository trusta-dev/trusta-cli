import type {
  TrustCenterData,
  TrustProfile,
  TrustState,
  TrustSummary,
} from './types';
import { canonicalOrgUrl, canonicalProjectUrl } from './fetch';

/**
 * Every pixel these components draw.
 *
 * Pure presentation over already-fetched data: the server and client entry
 * points differ only in how they get the data, then hand it to the same
 * functions here. Two rendering implementations would diverge, and ADR 0015 is
 * blunt about where that divergence gets discovered — publicly.
 *
 * Styling is inline. A component whose job is a status readout has no business
 * shipping a stylesheet a stranger has to wire into their build, and inline
 * styles cannot leak into or be overridden by the host page by accident.
 */

type Theme = 'light' | 'dark' | 'auto';

interface Palette {
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly line: string;
  readonly ink: string;
  readonly muted: string;
  readonly dim: string;
  readonly ok: string;
  readonly bad: string;
  readonly warn: string;
  readonly brand: string;
}

const light: Palette = {
  surface: '#ffffff',
  surfaceAlt: '#f7f9fc',
  line: '#e3e8ef',
  ink: '#0d1526',
  muted: '#5f6b7e',
  dim: '#8792a4',
  ok: '#12805a',
  bad: '#b3312c',
  warn: '#9a6207',
  brand: '#4530e0',
};

const dark: Palette = {
  surface: '#111827',
  surfaceAlt: '#1f2937',
  line: '#374151',
  ink: '#e5e7eb',
  muted: '#94a3b8',
  dim: '#7c8698',
  ok: '#22c55e',
  bad: '#ef4444',
  warn: '#f59e0b',
  brand: '#8b82ff',
};

/**
 * `auto` resolves to light.
 *
 * A component cannot read the host page's colour scheme without either a
 * stylesheet or a client-side media query, and this package ships neither. A
 * host that wants dark passes `theme="dark"` — a wrong guess on someone else's
 * homepage is worse than a documented default.
 */
export function paletteFor(theme: Theme | undefined): Palette {
  return theme === 'dark' ? dark : light;
}

const sans =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const mono =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export function stateColor(state: TrustState, palette: Palette): string {
  if (state === 'pass') return palette.ok;
  if (state === 'fail') return palette.bad;
  if (state === 'stale' || state === 'degraded') return palette.warn;
  return palette.dim;
}

export function stateLabel(state: TrustState): string {
  if (state === 'pass') return 'Passing';
  if (state === 'fail') return 'Failing';
  if (state === 'stale') return 'Stale';
  if (state === 'degraded') return 'Degraded';
  return 'No data';
}

/**
 * "computed 4 minutes ago".
 *
 * Invariant 3: every variant carries this. A trust widget without a
 * computation time is a badge, and a badge is decoration.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function Dot({ color }: { readonly color: string }) {
  return (
    <span
      aria-hidden='true'
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: 2,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function HomeLink({
  href,
  palette,
  children,
}: {
  readonly href: string;
  readonly palette: Palette;
  readonly children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      style={{
        color: palette.brand,
        fontFamily: mono,
        fontSize: 11,
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}

/**
 * What renders when Trusta cannot be reached and the host has nothing cached.
 *
 * Not a spinner, not a hole, and above all not a pass. It says the status could
 * not be read and links to the canonical page, so the reader can go and check
 * for themselves — which is the whole proposition.
 */
export function Unavailable({
  href,
  palette,
  className,
}: {
  readonly href: string;
  readonly palette: Palette;
  readonly className?: string | undefined;
}) {
  return (
    <div
      className={className}
      style={{
        fontFamily: sans,
        border: `1px solid ${palette.line}`,
        borderRadius: 9,
        background: palette.surface,
        color: palette.muted,
        padding: '11px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 12.5,
      }}
    >
      <Dot color={palette.dim} />
      <span>Live status unavailable</span>
      <span style={{ marginLeft: 'auto' }}>
        <HomeLink href={href} palette={palette}>
          View trust page →
        </HomeLink>
      </span>
    </div>
  );
}

function summaryLine(summary: TrustSummary): string {
  return `${summary.passCount}/${summary.totalControls} checks passing`;
}

export function BadgeView({
  org,
  project,
  profile,
  palette,
  className,
  now,
}: {
  readonly org: string;
  readonly project: string;
  readonly profile: TrustProfile;
  readonly palette: Palette;
  readonly className?: string | undefined;
  readonly now?: number | undefined;
}) {
  const color = stateColor(profile.summary.overallState, palette);
  return (
    <a
      className={className}
      href={canonicalProjectUrl(org, project)}
      target='_blank'
      rel='noopener noreferrer'
      style={{
        fontFamily: sans,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${palette.line}`,
        borderRadius: 7,
        background: palette.surface,
        padding: '6px 11px',
        fontSize: 12,
        color: palette.ink,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 11.5 }}>Trusta</span>
      <span
        aria-hidden='true'
        style={{ width: 1, height: 13, background: palette.line }}
      />
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color }}
      >
        <Dot color={color} />
        {stateLabel(profile.summary.overallState)}
      </span>
      <span style={{ fontFamily: mono, fontSize: 10, color: palette.dim }}>
        {relativeTime(profile.publishedAt, now)}
      </span>
    </a>
  );
}

export function StripView({
  org,
  project,
  profile,
  palette,
  className,
  now,
}: {
  readonly org: string;
  readonly project: string;
  readonly profile: TrustProfile;
  readonly palette: Palette;
  readonly className?: string | undefined;
  readonly now?: number | undefined;
}) {
  const color = stateColor(profile.summary.overallState, palette);
  return (
    <div
      className={className}
      style={{
        fontFamily: sans,
        border: `1px solid ${palette.line}`,
        borderRadius: 9,
        background: palette.surface,
        padding: '11px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 12.5, color: palette.ink, fontWeight: 500 }}>
        {profile.project.name}
      </span>
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}
      >
        <Dot color={color} />
        <span style={{ fontSize: 12 }}>
          {stateLabel(profile.summary.overallState)}
        </span>
      </span>
      <span style={{ fontFamily: mono, fontSize: 11, color: palette.muted }}>
        {summaryLine(profile.summary)}
      </span>
      <span style={{ fontFamily: mono, fontSize: 11, color: palette.dim }}>
        computed {relativeTime(profile.publishedAt, now)}
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <HomeLink href={canonicalProjectUrl(org, project)} palette={palette}>
          trust.trusta.dev →
        </HomeLink>
      </span>
    </div>
  );
}

export function CardView({
  org,
  project,
  profile,
  palette,
  className,
  now,
}: {
  readonly org: string;
  readonly project: string;
  readonly profile: TrustProfile;
  readonly palette: Palette;
  readonly className?: string | undefined;
  readonly now?: number | undefined;
}) {
  // Worst first, so a card cannot open with the reassuring half of the list.
  const order: Record<TrustState, number> = {
    fail: 0,
    degraded: 1,
    stale: 2,
    unknown: 3,
    pass: 4,
  };
  const controls = [...profile.controls]
    .sort(
      (a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name),
    )
    .slice(0, 8);

  return (
    <div
      className={className}
      style={{
        fontFamily: sans,
        border: `1px solid ${palette.line}`,
        borderRadius: 11,
        background: palette.surface,
        overflow: 'hidden',
        maxWidth: 380,
      }}
    >
      <div
        style={{
          padding: '13px 16px',
          borderBottom: `1px solid ${palette.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: palette.ink }}>
          {profile.project.name}
        </span>
        <span
          style={{
            fontFamily: mono,
            fontSize: 11,
            color: stateColor(profile.summary.overallState, palette),
          }}
        >
          {summaryLine(profile.summary)}
        </span>
      </div>

      <div style={{ padding: '13px 16px', display: 'grid', gap: 9 }}>
        {controls.map((control) => (
          <span
            key={control.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontSize: 12.5,
              color: palette.muted,
            }}
          >
            <Dot color={stateColor(control.state, palette)} />
            <span style={{ color: palette.ink }}>{control.name}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: mono,
                fontSize: 10,
                color: palette.dim,
              }}
            >
              {stateLabel(control.state)}
            </span>
          </span>
        ))}
      </div>

      <div
        style={{
          padding: '9px 16px',
          borderTop: `1px solid ${palette.line}`,
          background: palette.surfaceAlt,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontFamily: mono, fontSize: 11, color: palette.muted }}>
          computed {relativeTime(profile.publishedAt, now)}
        </span>
        <HomeLink href={canonicalProjectUrl(org, project)} palette={palette}>
          Verify on trust.trusta.dev →
        </HomeLink>
      </div>
    </div>
  );
}

export function CenterView({
  org,
  data,
  palette,
  className,
  now,
}: {
  readonly org: string;
  readonly data: TrustCenterData;
  readonly palette: Palette;
  readonly className?: string | undefined;
  readonly now?: number | undefined;
}) {
  const newest = data.systems.reduce<string | null>(
    (latest, system) =>
      latest === null || system.publishedAt > latest
        ? system.publishedAt
        : latest,
    null,
  );

  return (
    <div
      className={className}
      style={{
        fontFamily: sans,
        border: `1px solid ${palette.line}`,
        borderRadius: 11,
        background: palette.surface,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '13px 16px',
          borderBottom: `1px solid ${palette.line}`,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: palette.ink }}>
          {data.organization.name}
        </span>
        <span style={{ fontFamily: mono, fontSize: 11, color: palette.muted }}>
          {data.systems.length} system{data.systems.length === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ display: 'grid' }}>
        {data.systems.map((system) => (
          <a
            key={system.slug}
            href={canonicalProjectUrl(org, system.slug)}
            target='_blank'
            rel='noopener noreferrer'
            style={{
              padding: '11px 16px',
              borderBottom: `1px solid ${palette.line}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              textDecoration: 'none',
            }}
          >
            <Dot color={stateColor(system.summary.overallState, palette)} />
            <span style={{ fontSize: 12.5, color: palette.ink }}>
              {system.name}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: mono,
                fontSize: 11,
                color: palette.muted,
              }}
            >
              {summaryLine(system.summary)}
            </span>
          </a>
        ))}
      </div>

      <div
        style={{
          padding: '9px 16px',
          background: palette.surfaceAlt,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontFamily: mono, fontSize: 11, color: palette.muted }}>
          {newest
            ? `computed ${relativeTime(newest, now)}`
            : 'nothing published'}
        </span>
        <HomeLink href={canonicalOrgUrl(org)} palette={palette}>
          Verify on trust.trusta.dev →
        </HomeLink>
      </div>
    </div>
  );
}
