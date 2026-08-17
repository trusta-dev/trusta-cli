import type { TrustCenterData, TrustProfile } from './types';

/**
 * Reading published trust data.
 *
 * Anonymous by construction: no credentials, no cookies, no session. The
 * published artifact is the same bytes for everyone, and an embed that could
 * send credentials would be a component asking a stranger's users to
 * authenticate against Trusta on a page that is not Trusta's.
 */

export const defaultBaseUrl = 'https://api.trusta.dev';
export const defaultRevalidateSeconds = 300;
export const canonicalHost = 'https://trust.trusta.dev';

export function canonicalOrgUrl(org: string): string {
  return `${canonicalHost}/${encodeURIComponent(org)}`;
}

export function canonicalProjectUrl(org: string, project: string): string {
  return `${canonicalOrgUrl(org)}/${encodeURIComponent(project)}`;
}

/**
 * A read that never throws.
 *
 * These components render on other people's marketing pages. An exception
 * escaping into a host application's render is not an acceptable failure mode
 * for a status readout, so unreachable is a value the components handle rather
 * than an error they propagate.
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
    // is the point: on Next it gives the host a cached copy to serve when
    // Trusta is unreachable, and everywhere else it is inert rather than an
    // error.
    const response = await fetch(new URL(path, base).toString(), {
      headers: { accept: 'application/json' },
      ...(options.signal ? { signal: options.signal } : {}),
      next: { revalidate },
    } as RequestInit);

    if (response.status === 404) return { ok: false, reason: 'not_found' };
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
  return readJson<TrustCenterData>(
    `/public/trust/${encodeURIComponent(org)}`,
    options,
  );
}

export async function fetchTrustProfile(
  org: string,
  project: string,
  options: FetchOptions = {},
): Promise<TrustFetchResult<TrustProfile>> {
  const result = await readJson<{ profile: TrustProfile }>(
    `/public/trust/${encodeURIComponent(org)}/${encodeURIComponent(project)}`,
    options,
  );
  return result.ok
    ? { ok: true, data: result.data.profile }
    : { ok: false, reason: result.reason };
}
