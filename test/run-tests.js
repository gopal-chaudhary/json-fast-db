import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JsonDB from '../dist/index.js';

const TMP_DIR = path.join(process.cwd(), 'test', 'tmp_data')

async function cleanup(){
  await fs.rm(TMP_DIR, { recursive: true, force: true }).catch(()=>{})
}

class User extends (await import('../dist/model/table.js')).default {}

async function runCrudFlow(){
  const db = new JsonDB('users', TMP_DIR)
  const users = db.registerTable(User)

  // insert
  const a = await users.insert({ name: 'Alice' })
  assert(a && a.id && a.name === 'Alice')

  // findAll
  const all = await users.findAll()
  assert(Array.isArray(all) && all.length === 1)

  // findBy
  const found = await users.findBy(r=>r.name === 'Alice')
  assert(found.length === 1)

  // findOne / findById
  const one = await users.findOne(r=>r.id === a.id)
  assert(one && one.id === a.id)
  const byId = await users.findById(a.id)
  assert(byId && byId.id === a.id)

  // update
  const updated = await users.update(a.id, { email: 'alice@example.com' })
  assert(updated && updated.email === 'alice@example.com')

  // delete
  const removed = await users.deleteById(a.id)
  assert(removed === true)

  // cleanup produced file via collection.deleteTable
  const res = await db.getCollection().deleteTable('User')
  assert(typeof res.deleted === 'boolean')
}

async function runConcurrentInserts(){
  const db = new JsonDB('concurrent', TMP_DIR)
  const TableClass = (await import('../dist/model/table.js')).default
  const Users = db.registerTable(class ConcurrentUser extends TableClass {})

  // do many concurrent inserts to exercise the atomic write queue
  const inserts = 50
  await Promise.all(Array.from({ length: inserts }).map((_,i)=>Users.insert({ i })))
  const rows = await Users.findAll()
  assert(rows.length === inserts)
}

async function runCollectionDrop(){
  const db = new JsonDB('toDrop', TMP_DIR)
  const res = await db.getCollection().drop()
  // drop returns an object with dropped boolean
  assert(typeof res.dropped === 'boolean')
}

async function main(){
  await cleanup()
  await runCrudFlow()
  await runConcurrentInserts()
  await runCollectionDrop()
  // WAL backend checks
  const WalTable = (await import('../dist/engine/wal_table.js')).default

  async function runWalCrud(){
    const outDir = path.join(TMP_DIR, 'wal_users')
    await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
    const table = new WalTable('User', path.join(outDir, 'User.json'))
    const a = await table.insert({ name: 'Bob' })
    assert(a && a.id)
    const byId = await table.findById(a.id)
    assert(byId && byId.name === 'Bob')
    const updated = await table.update(a.id, { x: 1 })
    assert(updated && updated.x === 1)
    const all = await table.findAll()
    assert(Array.isArray(all) && all.length === 1)
    const removed = await table.deleteById(a.id)
    assert(removed === true)
    await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
  }

  async function runWalConcurrent(){
    const outDir = path.join(TMP_DIR, 'wal_concurrent')
    await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
    const table = new WalTable('Concurrent', path.join(outDir, 'Concurrent.json'))
    const inserts = 100
    await Promise.all(Array.from({ length: inserts }).map((_,i)=>table.insert({ i })))
    const rows = await table.findAll()
    assert(rows.length === inserts)
    await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
  }

  await runWalCrud()
  await runWalConcurrent()
  await cleanup()
  console.log('All tests passed')
}

main().catch(err=>{
  console.error('Test failed:', err)
  process.exit(1)
})
