// CLI 1.5.0 has two Windows incompatibilities: use Node 22 and normalize
// compiler-produced artifact names to POSIX before the existing strict checks.
// The installed CLI and its path/identity validation remain unchanged on disk.
import {register} from 'node:module';
register('./dms-cli-windows-loader.mjs',import.meta.url);
