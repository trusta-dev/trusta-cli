const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

export function printBanner() {
  process.stdout.write(`\n${BOLD}${CYAN}  trusta${RESET}  — generate your trust page in minutes\n\n`);
}

export function printStep(step: string) {
  process.stdout.write(`${DIM}→${RESET} ${step}\n`);
}

export function printSuccess(message: string) {
  process.stdout.write(`${GREEN}✓${RESET} ${message}\n`);
}

export function printWarning(message: string) {
  process.stdout.write(`${YELLOW}⚠${RESET}  ${message}\n`);
}

export function printInfo(label: string, value: string) {
  process.stdout.write(`  ${DIM}${label}${RESET}  ${BOLD}${value}${RESET}\n`);
}

export function printCode(code: string) {
  const lines = code.split('\n');
  process.stdout.write(`\n${DIM}${'─'.repeat(60)}${RESET}\n`);
  for (const line of lines) {
    process.stdout.write(`  ${BLUE}${line}${RESET}\n`);
  }
  process.stdout.write(`${DIM}${'─'.repeat(60)}${RESET}\n\n`);
}

export function printDivider() {
  process.stdout.write(`\n${DIM}${'─'.repeat(60)}${RESET}\n\n`);
}
