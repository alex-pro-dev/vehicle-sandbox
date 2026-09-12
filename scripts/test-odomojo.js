import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const path = process.argv[2] ?? process.env.ODOMOJO_DIR;
if (!path || !existsSync(resolve(path, 'backend/artisan'))) throw new Error('Usage: npm run test:odomojo -- /path/to/odoMojo');
execFileSync('docker', ['compose', 'run', '--rm', '--no-deps', '-v', `${process.cwd()}:/sandbox:ro`, 'backend', 'php', 'artisan', 'test', '--compact', '/sandbox/examples/odomojo/VehicleSandboxTest.php'], { cwd:resolve(path), stdio:'inherit' });
