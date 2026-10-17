// Vercel paketi .vercelignore ile data/, test/, docs/ klasörlerini dışarıda bırakır (adı geçen her derinlikte).
// Sunucu kodunun bu klasörlerden dosya require etmesi dağıtımı bozar; burada statik olarak engellenir.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/)
  .map((line) => line.trim()).filter((line) => /^[\w.-]+\/$/.test(line)).map((line) => line.slice(0, -1));
assert.ok(ignored.includes('data') && ignored.includes('test'));

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}
const offenders = [];
for (const file of [...files(path.join(root, 'api')), ...files(path.join(root, 'src'))]) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const target = path.relative(root, path.resolve(path.dirname(file), match[1]));
    if (target.split(path.sep).some((segment) => ignored.includes(segment))) offenders.push(path.relative(root, file) + ' → ' + target);
  }
}
assert.deepStrictEqual(offenders, [], 'Dağıtım paketinden dışlanan dosya require ediliyor');
console.log('Deploy bundle: server code requires nothing from .vercelignore folders');
