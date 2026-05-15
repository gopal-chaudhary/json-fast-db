import fs from 'fs'
import path from 'path'
import { atomicWrite } from '../fileManager/atomic_writer.js'

type IndexMap = Record<string, number>

export default class WalEngine {
  walPath: string
  idxPath: string
  index: IndexMap = {}

  constructor(walPath: string){
    this.walPath = walPath
    this.idxPath = `${walPath}.idx`
    fs.mkdirSync(path.dirname(this.walPath), { recursive: true })
  }

  async init(){
    const exists = await fs.promises.stat(this.walPath).then(()=>true).catch(()=>false)
    if(!exists){
      await fs.promises.writeFile(this.walPath, '')
    }
    // try load index from file, otherwise rebuild
    const idxExists = await fs.promises.stat(this.idxPath).then(()=>true).catch(()=>false)
    if(idxExists){
      try{
        const raw = await fs.promises.readFile(this.idxPath, 'utf8')
        this.index = JSON.parse(raw || '{}')
        return
      }catch{}
    }
    await this.rebuildIndex()
  }

  // record format: <len>\n<json>\n  where json = { op: 'put'|'del', doc: JSONObject }
  private async appendBuffer(buf: Buffer): Promise<number>{
    const fh = await fs.promises.open(this.walPath, 'a+')
    try{
      const stBefore = await fh.stat()
      const pos = stBefore.size
      await fh.write(buf, 0, buf.length, pos)
      await fh.sync()
      return pos
    }finally{
      await fh.close()
    }
  }

  async appendPut(doc: any): Promise<number>{
    const json = JSON.stringify({ op: 'put', doc })
    const bjson = Buffer.from(json, 'utf8')
    const header = Buffer.from(`${bjson.length}\n`, 'utf8')
    const tail = Buffer.from('\n')
    const buf = Buffer.concat([header, bjson, tail])
    const offset = await this.appendBuffer(buf)
    const id = doc.id
    if(id) this.index[id] = offset
    await atomicWrite(this.idxPath, JSON.stringify(this.index))
    return offset
  }

  async appendDel(id: string): Promise<number>{
    const json = JSON.stringify({ op: 'del', id })
    const bjson = Buffer.from(json, 'utf8')
    const header = Buffer.from(`${bjson.length}\n`, 'utf8')
    const tail = Buffer.from('\n')
    const buf = Buffer.concat([header, bjson, tail])
    const offset = await this.appendBuffer(buf)
    delete this.index[id]
    await atomicWrite(this.idxPath, JSON.stringify(this.index))
    return offset
  }

  async readAt(offset: number): Promise<any | null>{
    const fh = await fs.promises.open(this.walPath, 'r')
    try{
      // read header until newline to get length
      const headerBuf: Buffer = Buffer.alloc(64)
      let header = ''
      let pos = offset
      while(true){
        const { bytesRead } = await fh.read(headerBuf, 0, 1, pos)
        if(bytesRead === 0) return null
        const ch = headerBuf.toString('utf8', 0, 1)
        pos += 1
        if(ch === '\n') break
        header += ch
      }
      const len = parseInt(header, 10)
      if(Number.isNaN(len)) return null
      const buf = Buffer.alloc(len)
      await fh.read(buf, 0, len, pos)
      const json = buf.toString('utf8')
      return JSON.parse(json)
    }finally{
      await fh.close()
    }
  }

  async getById(id: string): Promise<any | null>{
    const off = this.index[id]
    if(off === undefined) return null
    const rec = await this.readAt(off)
    if(!rec) return null
    if(rec.op === 'put') return rec.doc
    return null
  }

  async rebuildIndex(){
    this.index = {}
    const fh = await fs.promises.open(this.walPath, 'r')
    try{
      let pos = 0
      const stat = await fh.stat()
      const size = stat.size
      while(pos < size){
        // read header
        const headerBuf: Buffer = Buffer.alloc(64)
        let header = ''
        while(true){
          const { bytesRead } = await fh.read(headerBuf, 0, 1, pos)
          if(bytesRead === 0) return
          const ch = headerBuf.toString('utf8', 0, 1)
          pos += 1
          if(ch === '\n') break
          header += ch
        }
        const len = parseInt(header, 10)
        if(Number.isNaN(len)) break
        const buf = Buffer.alloc(len)
        await fh.read(buf, 0, len, pos)
        const json = buf.toString('utf8')
        try{
          const rec = JSON.parse(json)
          if(rec && rec.op === 'put' && rec.doc && rec.doc.id) this.index[rec.doc.id] = pos - (header.length + 1)
          if(rec && rec.op === 'del' && rec.id) delete this.index[rec.id]
        }catch{}
        pos += len + 1
      }
    }finally{
      await fh.close()
      // persist index
      await atomicWrite(this.idxPath, JSON.stringify(this.index))
    }
  }
}
