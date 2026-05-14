import fs from "fs"
import path from "path"

class File{
	static async create(filePath: string): Promise<{ created: boolean; path: string }>{
		try{
			const exists = await fs.promises.stat(filePath).then(()=>true).catch(()=>false)
			if(exists) return { created: false, path: filePath }

			await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
			await fs.promises.writeFile(filePath, "")
			return { created: true, path: filePath }
		}catch(err: any){
			throw new Error(`Failed to create file '${filePath}': ${err?.message ?? err}`)
		}
	}

	static async delete(filePath: string): Promise<{ deleted: boolean; path: string }>{
		try{
			const exists = await fs.promises.stat(filePath).then(()=>true).catch(()=>false)
			if(!exists) return { deleted: false, path: filePath }

			await fs.promises.unlink(filePath)
			return { deleted: true, path: filePath }
		}catch(err: any){
			throw new Error(`Failed to delete file '${filePath}': ${err?.message ?? err}`)
		}
	}
}

export default File