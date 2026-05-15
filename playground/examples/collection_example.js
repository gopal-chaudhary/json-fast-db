import JsonDB from '../../dist/index.js'
import Table from '../../dist/model/table.js'
import fs from 'node:fs/promises'
import path from 'node:path'

class Post extends Table {}

async function main(){
  const outDir = path.join(process.cwd(), 'playground', 'examples_tmp', 'collection_example')
  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})

  const db = new JsonDB('blog', outDir)
  const posts = db.registerTable(Post)

  await posts.insert({ title: 'Hello', body: 'First post' })
  console.log('Files in collection dir:', await fs.readdir(outDir).catch(()=>[]))

  // delete the Post table file
  const del = await db.getCollection().deleteTable('Post')
  console.log('deleteTable result:', del)

  // drop the whole collection
  const drop = await db.getCollection().drop()
  console.log('drop result:', drop)

  await fs.rm(outDir, { recursive: true, force: true }).catch(()=>{})
}

main().catch(err=>{ console.error(err); process.exit(1) })
