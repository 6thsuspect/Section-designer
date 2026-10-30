import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CAD_COMMANDS, findCadCommand } from '../src/engine/cad.ts';

// Run against a real source checkout, never fetch or execute upstream application code.
const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'crates/engine/src/cmd.rs'))) {
  console.error('Usage: npm run inventory:cadcraft -- /path/to/cadcraft-checkout');
  process.exit(1);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const rows = new Map<
  string,
  {
    command: string;
    label: string;
    source: string;
    line: number;
    nativeEquivalent: string | null;
    status: string;
  }
>();
function visit(directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.rs')) {
      const text = fs.readFileSync(file, 'utf8').split('#[cfg(test)]')[0];
      for (const match of text.matchAll(/CommandSpec::new\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)) {
        const command = match[1].toUpperCase(),
          native = findCadCommand(command);
        if (!rows.has(command))
          rows.set(command, {
            command,
            label: match[2],
            source: path.relative(root, file).replaceAll(path.sep, '/'),
            line: text.slice(0, match.index).split('\n').length,
            nativeEquivalent: native?.name ?? null,
            status: native ? 'native-command-with-documented-limits' : 'not-ported',
          });
      }
    }
  }
}
visit(path.join(root, 'crates/engine/src/cmd'));
const result = {
  repository: 'https://github.com/storytold/cadcraft',
  revision,
  note: 'Static inventory of literal CommandSpec::new registrations before Rust test modules, not a runtime registry or proof of upstream functionality. Macro/dynamically generated entries may be absent. Matching native names do not imply full upstream option parity. See CADCRAFT_INTEGRATION.md.',
  nativeCommands: CAD_COMMANDS.map((c) => ({
    command: c.name,
    aliases: c.aliases,
    supportedBehavior: c.help,
  })),
  upstreamCommands: [...rows.values()].sort((a, b) => a.command.localeCompare(b.command)),
};
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/cadcraft-command-inventory.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  `Recorded ${rows.size} upstream literal registrations; ${CAD_COMMANDS.length} native commands are registered. Full parity is not claimed.`,
);
