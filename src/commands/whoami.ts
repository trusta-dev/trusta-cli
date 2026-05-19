import { resolveToken } from '../auth';
import { getMe } from '../api';
import { printSuccess } from '../output';

const API_URL = process.env['TRUSTA_API_URL'] ?? 'https://api.trusta.dev';

export async function whoami(args: string[]) {
  const json = args.includes('--json');
  const token = await resolveToken();
  const me = await getMe({ baseUrl: API_URL, token });

  if (json) {
    process.stdout.write(JSON.stringify(me, null, 2) + '\n');
    return;
  }

  printSuccess(`Logged in as ${me.user.name}`);
  for (const org of me.organizations) {
    process.stdout.write(`  Workspace: ${org.name} (${org.slug})\n`);
  }
}
