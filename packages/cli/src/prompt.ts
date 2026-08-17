import { createInterface } from 'node:readline';

export function createPrompter() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function ask(question: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    return new Promise((resolve) => {
      rl.question(`  ${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  }

  function close() {
    rl.close();
  }

  return { ask, close };
}
