import { cp, mkdir, writeFile } from 'node:fs/promises';

const destination = new URL('../dist/server/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../src/', import.meta.url), destination, { recursive: true });
await writeFile(new URL('index.js', destination), "export { default } from './worker.mjs';\n");
console.log('Built offline mock Worker at dist/server/index.js. No deployment performed.');
