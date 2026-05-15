import JsonDB from '../../dist/index.js'
import Table from '../../dist/model/table.js'
import fs from 'node:fs/promises'
import path from 'node:path'

class User extends Table {}

async function main(){
  const outDir = path.join(process.cwd(), 'playground', 'examples_tmp', 'table_crud')
  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})

  const db = new JsonDB('users', outDir)
  const users = db.registerTable(User)

  const alice = await users.insert({ name: 'Alice', email: 'alice@example.com' })
  console.log('Inserted:', alice)

  const all = await users.findAll()
  console.log('All records:', all)

  const found = await users.findBy(r => r.email === 'alice@example.com')
  console.log('FindBy:', found)

  const byId = await users.findById(alice.id)
  console.log('FindById:', byId)

  const updated = await users.update(alice.id, { email: 'alice@new.com' })
  console.log('Updated:', updated)

  const removed = await users.deleteById(alice.id)
  console.log('Deleted:', removed)

  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
}

main().catch(err=>{ console.error(err); process.exit(1) })
