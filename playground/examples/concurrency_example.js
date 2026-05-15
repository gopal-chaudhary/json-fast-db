import JsonDB from '../../dist/index.js'
import Table from '../../dist/model/table.js'
import fs from 'node:fs/promises'
import path from 'node:path'

class CUser extends Table {}

async function main(){
  const outDir = path.join(process.cwd(), 'playground', 'examples_tmp', 'concurrency')
  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})

  const db = new JsonDB('concurrent', outDir)
  const users = db.registerTable(CUser)

  // perform many concurrent inserts
  const count = 200
  await Promise.all(Array.from({ length: count }).map((_, i) => users.insert({ i })))

  const rows = await users.findAll()
  console.log(`Inserted ${rows.length} rows (expected ${count})`)

  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
}

main().catch(err=>{ console.error(err); process.exit(1) })
