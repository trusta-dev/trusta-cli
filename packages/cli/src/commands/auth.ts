import { resolveToken } from '../auth';
import { getMe } from '../api';
import { printSuccess } from '../output';

const API_URL = process.env['TRUSTA_API_URL'] ?? 'https://api.trusta.dev';

export async function auth() {
  const token = await resolveToken();
  const me = await getMe({ baseUrl: API_URL, token });
  printSuccess(`Authenticated as ${me.user.name}`);
}
