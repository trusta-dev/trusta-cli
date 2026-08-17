import type { TrustCenterData, TrustProfile } from './types';

/**
 * Reading published trust data.
 *
 * These fetch **static JSON objects**, not an API. Every publish writes the
 * organisation's trust data to object storage, and this reads those objects
 * straight off the CDN — no application server between a customer's homepage
 * and their status.
 *
 * That is a deliberate property rather than an optimisation. An embed runs at
 * the customer's traffic, not ours: routing it through an API would put their
 * homepage load on our compute and, behind it, our database. A static object
 * has no such failure mode, and there is nothing for a traffic spike to knock
 * over.
 *
 * Anonymous by construction: no credentials, no cookies, no session. The
 * published data is the same bytes for everyone, and a component that could
 * send credentials would be asking a stranger's visitors to authenticate
 * against Trusta on a page that is not Trusta's.
 */

/** Where the published objects live. Also serves the human-readable pages. */
export const defaultBaseUrl = 'https://trust.trusta.dev';
export const defaultRevalidateSeconds = 300;
export const canonicalHost = 'https://trust.trusta.dev';

/**
 * Object keys, which are also the public URLs.
 *
 * `public/` is a reserved organisation slug, so these can never collide with a
 * real trust page path.
 */
export const trustObjectPaths = {
  organization: (org: string) => `/public/o/${encodeURIComponent(org)}.json`,
  project: (org: string, project: string) =>
    `/public/o/${encodeURIComponent(org)}/${encodeURIComponent(project)}.json`,
} as const;

export function canonicalOrgUrl(org: string): string {
  return `${canonicalHost}/${encodeURIComponent(org)}`;
}

export function canonicalProjectUrl(org: string, project: string): string {
  return `${canonicalOrgUrl(org)}/${encodeURIComponent(project)}`;
}

/**
 * A read that never throws.
 *
 * These render on other people's marketing pages. An exception escaping into a
 * host application's render is not an acceptable failure mode for a status
 * readout, so unreachable is a value the components handle rather than an error
 * they propagate.
 */
export type TrustFetchResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly reason: 'not_found' | 'unreachable' };

interface FetchOptions {
  readonly baseUrl?: string | undefined;
  readonly revalidateSeconds?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

async function readJson<T>(
  path: string,
  options: FetchOptions,
): Promise<TrustFetchResult<T>> {
  const base = options.baseUrl ?? defaultBaseUrl;
  const revalidate = options.revalidateSeconds ?? defaultRevalidateSeconds;

  try {
    // `next.revalidate` is ignored by runtimes that do not understand it, which
    // is the point: on Next it gives the host a cached copy to serve when the
    // object cannot be reached, and everywhere else it is inert rather than an
    // error.
    const response = await fetch(new URL(path, base).toString(), {
      headers: { accept: 'application/json' },
      ...(options.signal ? { signal: options.signal } : {}),
      next: { revalidate },
    } as RequestInit);

    // 403 is in here because an object-storage origin answers a missing key
    // that way when listing is denied, which is the correct configuration.
    if (response.status === 404 || response.status === 403) {
      return { ok: false, reason: 'not_found' };
    }
    if (!response.ok) return { ok: false, reason: 'unreachable' };

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

export function fetchTrustCenter(
  org: string,
  options: FetchOptions = {},
): Promise<TrustFetchResult<TrustCenterData>> {
  return readJson<TrustCenterData>(trustObjectPaths.organization(org), options);
}

export async function fetchTrustProfile(
  org: string,
  project: string,
  options: FetchOptions = {},
): Promise<TrustFetchResult<TrustProfile>> {
  const result = await readJson<{ profile: TrustProfile }>(
    trustObjectPaths.project(org, project),
    options,
  );
  return result.ok
    ? { ok: true, data: result.data.profile }
    : { ok: false, reason: result.reason };
}
