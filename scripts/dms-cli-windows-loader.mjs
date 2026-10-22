export async function load(url,context,nextLoad) {
  const result=await nextLoad(url,context);
  if(process.platform!=='win32'||!url.endsWith('/base-database-cli/dist/app-builder/core.mjs'))return result;
  const original="import { resolve, join, relative, isAbsolute, dirname } from 'node:path';";
  const source=String(result.source);
  if(!source.includes(original))throw Error('DMS CLI compatibility adapter no longer matches this CLI; review before use.');
  const replacement="import { resolve, join, relative as nativeRelative, isAbsolute, dirname } from 'node:path';\nconst relative = (...args) => nativeRelative(...args).replaceAll('\\\\', '/');";
  // Only normalize node:path.relative's generated output. safePath still rejects
  // absolute paths, traversal, symlinks and all noncanonical external inputs.
  return {...result,source:source.replace(original,replacement)};
}
