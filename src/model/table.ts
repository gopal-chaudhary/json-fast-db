import fs from "fs"
import path from "path"
import { atomicWrite, queueOperation } from "../fileManager/atomic_writer.js"
import WalEngine from "../engine/wal_engine.js"

export type JSONObject = { [k: string]: any }

export default class Table {
    protected filePath: string
    protected tableName: string
    protected engine?: import("../engine/wal_engine.js").default

    constructor(tableName: string, filePath: string){
        this.tableName = tableName
        this.filePath = filePath
        // ensure directory exists
        fs.promises.mkdir(path.dirname(this.filePath), { recursive: true }).catch(()=>{})
        // initialize WAL engine (default storage backend)
        try{
            this.engine = new WalEngine(`${this.filePath}.wal`)
            this.engine.init().catch(()=>{})
        }catch(err){
            // if WAL engine fails, fall back to file-based JSON storage
            this.engine = undefined as any
            fs.promises.stat(this.filePath)
                .then(()=>{})
                .catch(()=> atomicWrite(this.filePath, JSON.stringify([])).catch(()=>{}))
        }
    }

    protected async readAll(): Promise<JSONObject[]>{
        if(this.engine){
            const ids = Object.keys(this.engine.index)
            const rows: JSONObject[] = []
            for(const id of ids){
                const rec = await this.engine.getById(id).catch(()=>null)
                if(rec) rows.push(rec)
            }
            return rows
        }
        const raw = await fs.promises.readFile(this.filePath, { encoding: "utf8" }).catch(()=>"[]")
        try{
            const parsed = JSON.parse(raw as string)
            return Array.isArray(parsed) ? parsed : []
        }catch{ return [] }
    }

    protected async writeAll(rows: JSONObject[]): Promise<void>{
        if(this.engine){
            // replace current state by appending puts for each row
            for(const r of rows){
                await this.engine.appendPut(r)
            }
            return
        }
        const data = JSON.stringify(rows, null, 2)
        await atomicWrite(this.filePath, data)
    }

    async insert(obj: JSONObject): Promise<JSONObject>{
        return queueOperation(this.filePath, async ()=>{
            const id = obj.id ?? `${Date.now()}-${Math.floor(Math.random()*10000)}`
            const record = { ...obj, id }
            if(this.engine){
                await this.engine.appendPut(record)
                return record
            }
            const rows = await this.readAll()
            rows.push(record)
            await this.writeAll(rows)
            return record
        })
    }

    async findAll(): Promise<JSONObject[]>{
        return this.readAll()
    }

    async findBy(predicate: (r: JSONObject)=>boolean): Promise<JSONObject[]>{
        const rows = await this.readAll()
        return rows.filter(predicate)
    }

    async findOne(predicate: (r: JSONObject)=>boolean): Promise<JSONObject | null>{
        const rows = await this.readAll()
        return rows.find(predicate) ?? null
    }

    async findById(id: string): Promise<JSONObject | null>{
        return this.findOne(r=>r.id === id)
    }

    async update(id: string, patch: Partial<JSONObject>): Promise<JSONObject | null>{
        return queueOperation(this.filePath, async ()=>{
            if(this.engine){
                const cur = await this.engine.getById(id)
                if(!cur) return null
                const updated = { ...cur, ...patch }
                await this.engine.appendPut(updated)
                return updated
            }
            const rows = await this.readAll()
            const idx = rows.findIndex(r=>r.id === id)
            if(idx === -1) return null
            rows[idx] = { ...rows[idx], ...patch }
            await this.writeAll(rows)
            return rows[idx]
        })
    }

    async deleteById(id: string): Promise<boolean>{
        return queueOperation(this.filePath, async ()=>{
            if(this.engine){
                const cur = await this.engine.getById(id)
                if(!cur) return false
                await this.engine.appendDel(id)
                return true
            }
            const rows = await this.readAll()
            const filtered = rows.filter(r=>r.id !== id)
            if(filtered.length === rows.length) return false
            await this.writeAll(filtered)
            return true
        })
    }
}
