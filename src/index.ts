#!/usr/bin/env node
import { init } from './commands/init';
import { whoami } from './commands/whoami';
import { auth } from './commands/auth';
import { projectResolve } from './commands/project';
import { scanList, scanLatest } from './commands/scan';
import { status } from './commands/status';

const args = process.argv.slice(2);
const [command = 'init', subcommand, ...rest] = args;

function die(message: string) {
  process.stderr.write(`\nError: ${message}\n`);
  process.exit(1);
}

function run(promise: Promise<void>) {
  promise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null;
    process.stderr.write(`\nError: ${message}${cause ? `\nCause: ${cause}` : ''}\n`);
    process.exit(1);
  });
}

if (command === 'init') {
  run(init());
} else if (command === 'auth') {
  run(auth());
} else if (command === 'whoami') {
  run(whoami(args.slice(1)));
} else if (command === 'status') {
  run(status(args.slice(1)));
} else if (command === 'project') {
  if (subcommand === 'resolve') {
    run(projectResolve([...rest, ...args.filter((a) => a === '--json')]));
  } else {
    die(`Unknown subcommand: project ${subcommand ?? ''}\nUsage: trusta project resolve [--json]`);
  }
} else if (command === 'scan') {
  if (subcommand === 'list') {
    run(scanList([...rest, ...args.filter((a) => a === '--json')]));
  } else if (subcommand === 'latest') {
    run(scanLatest([...rest, ...args.filter((a) => a === '--json')]));
  } else {
    die(`Unknown subcommand: scan ${subcommand ?? ''}\nUsage: trusta scan list|latest [--json]`);
  }
} else {
  process.stderr.write(
    `Unknown command: ${command}\n\nUsage:\n` +
    `  trusta init                    Set up Trusta for this project\n` +
    `  trusta auth                    Log in to Trusta\n` +
    `  trusta whoami [--json]         Show current user\n` +
    `  trusta status [--json]         Show trust score and scan summary\n` +
    `  trusta project resolve [--json] Resolve the Trusta project for this repo\n` +
    `  trusta scan list [--json]      List scans for this project\n` +
    `  trusta scan latest [--json]    Show latest scan with findings\n`,
  );
  process.exit(1);
}
