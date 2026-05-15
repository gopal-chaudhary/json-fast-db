import fs from "fs"
import path from "path"

const writeQueues: Map<string, Promise<void>> = new Map()
const opQueues: Map<string, Promise<any>> = new Map()

async function _doAtomicWrite(filePath: string, data: string): Promise<void>{
    const dir = path.dirname(filePath)
    await fs.promises.mkdir(dir, { recursive: true }).catch(()=>{})
    const tmp = `${filePath}.tmp.${process.pid}-${Math.floor(Math.random()*1e6)}`
    await fs.promises.writeFile(tmp, data, { encoding: "utf8" })
    // rename is atomic on same filesystem
    await fs.promises.rename(tmp, filePath)
}

export function atomicWrite(filePath: string, data: string): Promise<void>{
    const prev = writeQueues.get(filePath) ?? Promise.resolve()
    const next = prev.then(()=> _doAtomicWrite(filePath, data))
    // swallow errors in queue to avoid blocking subsequent writes, but rethrow to caller
    // keep chain consistent by catching here and rethrowing after
    const guarded = next.catch(err=>{ throw err })
    writeQueues.set(filePath, guarded.then(()=>{}).catch(()=>{}))
    return guarded
}

export async function drainWrites(filePath: string): Promise<void>{
    const p = writeQueues.get(filePath)
    if(p) await p
}

export function queueOperation<T>(filePath: string, op: ()=>Promise<T>): Promise<T>{
    const prev = opQueues.get(filePath) ?? Promise.resolve()
    const next = prev.then(()=> op())
    const guarded = next.catch(err=>{ throw err })
    // keep queue alive but swallow errors for queue continuity
    opQueues.set(filePath, guarded.then(()=>{}).catch(()=>{}))
    return guarded
}
