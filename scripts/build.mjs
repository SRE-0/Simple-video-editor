import { cp, mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
for (const dir of ['src', 'public']) await cp(dir, `dist/${dir}`, { recursive: true });
console.log('Build estático generado en dist/');
