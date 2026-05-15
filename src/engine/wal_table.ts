import WalEngine from './wal_engine.js'
import path from 'path'
import fs from 'fs'

export default class WalTable {
  protected engine: WalEngine
  protected tableName: string
  protected filePath: string

  constructor(tableName: string, filePath: string){
    this.tableName = tableName
    this.filePath = filePath
    const walPath = `${filePath}.wal`
    this.engine = new WalEngine(walPath)
    // initialize async but don't block constructor
    this.engine.init().catch(()=>{})
  }

  async insert(obj: any){
    const id = obj.id ?? `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const record = { ...obj, id }
    await this.engine.appendPut(record)
    return record
  }

  async findById(id: string){
    return this.engine.getById(id)
  }

  async findAll(){
    // fallback: read index and then read each record
    const ids = Object.keys(this.engine.index)
    const results: any[] = []
    for(const id of ids){
      const r = await this.findById(id)
      if(r) results.push(r)
    }
    return results
  }

  async findBy(predicate: (r: any)=>boolean){
    const all = await this.findAll()
    return all.filter(predicate)
  }

  async findOne(predicate: (r: any)=>boolean){
    const all = await this.findAll()
    return all.find(predicate) ?? null
  }

  async update(id: string, patch: any){
    const cur = await this.findById(id)
    if(!cur) return null
    const updated = { ...cur, ...patch }
    await this.engine.appendPut(updated)
    return updated
  }

  async deleteById(id: string){
    const cur = await this.findById(id)
    if(!cur) return false
    await this.engine.appendDel(id)
    return true
  }
}
