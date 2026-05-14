import fs from "fs"
import path from "path"
import Table from "./model/table.js"

export default class Collection {
    name: string
    dir: string

    constructor(name: string, dir: string){
        this.name = name
        this.dir = dir
        // ensure directory exists
        fs.promises.mkdir(this.dir, { recursive: true }).catch(()=>{})
    }

    // register a Model class (should extend Table)
    registerTable<T extends Table>(ModelClass: new(tableName: string, filePath: string)=>T): T{
        const tableName = (ModelClass as any).name || "Table"
        const filePath = path.join(this.dir, `${tableName}.json`)
        return new ModelClass(tableName, filePath)
    }

    async deleteTable(tableName: string): Promise<{ deleted: boolean; path: string }>{
        const filePath = path.join(this.dir, `${tableName}.json`)
        const exists = await fs.promises.stat(filePath).then(()=>true).catch(()=>false)
        if(!exists) return { deleted: false, path: filePath }
        await fs.promises.unlink(filePath)
        return { deleted: true, path: filePath }
    }

    async drop(): Promise<{ dropped: boolean; path: string }>{
        const exists = await fs.promises.stat(this.dir).then(()=>true).catch(()=>false)
        if(!exists) return { dropped: false, path: this.dir }
        await fs.promises.rm(this.dir, { recursive: true, force: true })
        return { dropped: true, path: this.dir }
    }
}
