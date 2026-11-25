import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '../..');

export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://pulse:pulse@127.0.0.1:5432/pulse',
    PULSE_API_KEY: process.env.PULSE_API_KEY ?? 'pulse_live_demo_northstar',
  };
  if (env.CI && !env.SEED_PROFILE) env.SEED_PROFILE = 'small';
  execFileSync('npm', ['run', 'db:migrate'], { cwd: root, stdio: 'inherit', env });
  execFileSync('npm', ['run', 'db:seed'], { cwd: root, stdio: 'inherit', env });
}
