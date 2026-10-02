'use strict';
// Independent source/forecast records share the existing optimistic revision contract.
const clone = (value) => JSON.parse(JSON.stringify(value));
const { isDeepStrictEqual } = require('node:util');
async function readStore(key, initial, database = require('./db')) {
  const row = await database.getCache(key, { strict: true });
  if (!row) return { value: clone(initial), revision: null };
  if (!row.value || row.value.schemaVersion !== initial.schemaVersion) throw new Error('Unsupported intelligence record');
  return { value: clone(row.value), revision: row.revision };
}
async function updateStore(key, initial, transform, database = require('./db')) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { value, revision } = await readStore(key, initial, database);
    const next = transform(clone(value));
    if (isDeepStrictEqual(next, value)) return value;
    try {
      await database.compareAndSetCache(key, next, revision);
      // Re-read: successful transport alone is not proof of a committed record.
      const committed = await readStore(key, initial, database);
      if (!isDeepStrictEqual(committed.value, next) && !isDeepStrictEqual(transform(clone(committed.value)), committed.value)) throw new Error('Intelligence write could not be verified');
      return committed.value;
    } catch (error) {
      if (error.statusCode !== 409 || attempt === 2) throw error;
    }
  }
}
module.exports = { readStore, updateStore };
