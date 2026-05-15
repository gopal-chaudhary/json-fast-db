import assert from 'node:assert/strict';
import JsonDB from '../dist/index.js';

async function main(){
  assert(JsonDB, 'expected default export to exist');
  // Basic smoke: creating an instance should not throw
  const db = new JsonDB('test_collection', './test/tmp');
  assert(typeof db.getCollection === 'function', 'db.getCollection should be a function');
  console.log('smoke-test: OK');
}

main().catch((err)=>{
  console.error(err);
  process.exit(1);
});
