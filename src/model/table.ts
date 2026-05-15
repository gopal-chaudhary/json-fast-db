import fs from "fs"
import path from "path"
import { atomicWrite, queueOperation } from "../fileManager/atomic_writer.js"

export type JSONObject = { [k: string]: any }

export default class Table {
    protected filePath: string
    protected tableName: string

    constructor(tableName: string, filePath: string){
        this.tableName = tableName
        this.filePath = filePath
        // ensure file exists
        fs.promises.mkdir(path.dirname(this.filePath), { recursive: true }).catch(()=>{})
        fs.promises.stat(this.filePath)
            .then(()=>{})
            .catch(()=> atomicWrite(this.filePath, JSON.stringify([])).catch(()=>{}))
    }

    protected async readAll(): Promise<JSONObject[]>{
        const raw = await fs.promises.readFile(this.filePath, { encoding: "utf8" }).catch(()=>"[]")
        try{
            const parsed = JSON.parse(raw as string)
            return Array.isArray(parsed) ? parsed : []
        }catch{ return [] }
    }

    protected async writeAll(rows: JSONObject[]): Promise<void>{
        const data = JSON.stringify(rows, null, 2)
        await atomicWrite(this.filePath, data)
    }

    async insert(obj: JSONObject): Promise<JSONObject>{
        return queueOperation(this.filePath, async ()=>{
            const rows = await this.readAll()
            const id = obj.id ?? `${Date.now()}-${Math.floor(Math.random()*10000)}`
            const record = { ...obj, id }
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
            const rows = await this.readAll()
            const filtered = rows.filter(r=>r.id !== id)
            if(filtered.length === rows.length) return false
            await this.writeAll(filtered)
            return true
        })
    }
}
