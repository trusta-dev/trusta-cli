#!/usr/bin/env node
import { init } from './commands/init';

const [, , command = 'init'] = process.argv;

if (command === 'init') {
  init().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null;
    process.stderr.write(`\nError: ${message}${cause ? `\nCause: ${cause}` : ''}\n`);
    process.exit(1);
  });
} else {
  process.stderr.write(`Unknown command: ${command}\nUsage: npx trusta init\n`);
  process.exit(1);
}
