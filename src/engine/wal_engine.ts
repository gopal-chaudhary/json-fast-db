import fs from 'fs'
import path from 'path'
import { atomicWrite, queueOperation } from '../fileManager/atomic_writer.js'

type Logger = (level: 'debug'|'info'|'warn'|'error', msg: string, meta?: any) => void

type IndexMap = Record<string, number>

export default class WalEngine {
  walPath: string
  idxPath: string
  index: IndexMap = {}
  // compaction/config
  private compactionIntervalMs: number
  private compactionThreshold: number
  private compactionTimer?: NodeJS.Timeout
  private compacting: boolean = false
  private logger: Logger
  private lockfilePath: string
  public stats: {
    compactionCount: number
    lastCompactionDurationMs: number | null
    lastCompactionSavedBytes: number | null
  } = { compactionCount: 0, lastCompactionDurationMs: null, lastCompactionSavedBytes: null }
  

  constructor(walPath: string, options?: { compactionIntervalMs?: number, compactionThreshold?: number, logger?: Logger, lockfilePath?: string }){
    this.walPath = walPath
    this.idxPath = `${walPath}.idx`
    fs.mkdirSync(path.dirname(this.walPath), { recursive: true })
    this.compactionIntervalMs = options?.compactionIntervalMs ?? 30_000
    this.compactionThreshold = options?.compactionThreshold ?? (1 << 20)
    this.logger = options?.logger ?? ((lvl,msg)=>{ /* default no-op to avoid noisy logs */ })
    this.lockfilePath = options?.lockfilePath ?? `${this.walPath}.lock`
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
    // start background compaction checker
    this.compactionTimer = setInterval(()=>{
      this.checkAndCompact().catch(()=>{})
    }, this.compactionIntervalMs)
  }

  async checkAndCompact(){
    try{
      if(this.compacting) return
      const st = await fs.promises.stat(this.walPath).then(s=>s).catch(()=>null)
      if(!st) return
      if(st.size >= this.compactionThreshold) await this.compact()
    }catch(err){
      this.logger('warn', 'checkAndCompact error', { err })
    }
  }

  // inter-process lock using exclusive create of a lockfile
  private async acquireLock(retries = 50, delayMs = 100): Promise<() => Promise<void>>{
    const lockfile = this.lockfilePath
    for(let attempt=0; attempt<retries; attempt++){
      try{
        const fh = await fs.promises.open(lockfile, 'wx')
        try{
          await fh.write(`${process.pid}\n${Date.now()}\n`)
        }finally{
          await fh.close()
        }
        // acquired
        return async ()=>{ await fs.promises.unlink(lockfile).catch(()=>{}) }
      }catch(err:any){
        // already exists — check if stale
        try{
          const raw = await fs.promises.readFile(lockfile, 'utf8')
          const pid = parseInt(raw.split('\n')[0], 10)
          if(Number.isFinite(pid)){
            try{ process.kill(pid, 0); /* alive */ }
            catch(e){
              // process not alive — remove stale lock and retry immediate
              await fs.promises.unlink(lockfile).catch(()=>{})
              continue
            }
          }
        }catch(e){ /* ignore */ }
        await new Promise(r=>setTimeout(r, delayMs))
        continue
      }
    }
    throw new Error('Failed to acquire WAL lock')
  }

  async compact(): Promise<void>{
    // ensure compaction executes serialized with writes
    return queueOperation(this.walPath, async ()=>{
      if(this.compacting) return
      this.compacting = true
      const start = Date.now()
      const tmpNew = `${this.walPath}.new`
      const backup = `${this.walPath}.bak`
      try{
        // acquire inter-process lock for rotation
        const release = await this.acquireLock().catch(()=>null)
        try{
          // write new WAL file sequentially
          const fh = await fs.promises.open(tmpNew, 'w')
          try{
            let pos = 0
            const ids = Object.keys(this.index)
            for(const id of ids){
              const rec = await this.getById(id)
              if(!rec) continue
              const json = JSON.stringify({ op: 'put', doc: rec })
              const bjson = Buffer.from(json, 'utf8')
              const header = Buffer.from(`${bjson.length}\n`, 'utf8')
              const tail = Buffer.from('\n')
              const buf = Buffer.concat([header, bjson, tail])
              await fh.write(buf, 0, buf.length, pos)
              pos += buf.length
            }
            await fh.sync()
          }finally{
            await fh.close()
          }

          // rotate files: move current wal to backup, replace with new
          await fs.promises.rename(this.walPath, backup).catch(()=>{})
          await fs.promises.rename(tmpNew, this.walPath)

          // rebuild index offsets from new WAL
          const beforeSize = (await fs.promises.stat(backup).then(s=>s.size).catch(()=>0))
          await this.rebuildIndex()
          const afterSize = (await fs.promises.stat(this.walPath).then(s=>s.size).catch(()=>0))

          // remove backup
          await fs.promises.unlink(backup).catch(()=>{})
          this.stats.compactionCount += 1
          this.stats.lastCompactionDurationMs = Date.now() - start
          this.stats.lastCompactionSavedBytes = beforeSize - afterSize
          this.logger('info', 'compaction completed', { beforeSize, afterSize, durationMs: this.stats.lastCompactionDurationMs })
        }finally{
          if(release) await release().catch(()=>{})
        }
      }catch(err){
        this.logger('error', 'compaction failed', { err })
        // on error, try to clean tmp
        await fs.promises.unlink(tmpNew).catch(()=>{})
      }finally{
        this.compacting = false
      }
    })
  }

  // gracefully stop background compaction timer and wait for any running compaction
  async close(): Promise<void>{
    if(this.compactionTimer) clearInterval(this.compactionTimer)
    // wait for compaction to finish
    while(this.compacting){
      await new Promise(r=>setTimeout(r, 100))
    }
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
