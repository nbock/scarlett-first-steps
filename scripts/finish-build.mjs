import {mkdir,copyFile,writeFile} from 'node:fs/promises';
for(const route of ['host','invite']){await mkdir('docs/'+route,{recursive:true});await copyFile('docs/index.html',`docs/${route}/index.html`);}
await writeFile('docs/.nojekyll','');
