import File from "./fileManager/manage_file_creation.js";
import type { DB_NAME,DB_PATH } from "./interfaces/collections_interface";
import Collection from "./collection.js"

class JsonDB{
    collection: Collection

    constructor(collectionName: DB_NAME, dirPath: DB_PATH){
        this.collection = new Collection(collectionName, dirPath)
    }

    // Register a Table model (class should extend the base Table)
    registerTable<T extends import("./model/table.js").default>(ModelClass: new(tableName: string, filePath: string)=>T): T{
        return this.collection.registerTable(ModelClass)
    }

    getCollection(): Collection{
        return this.collection
    }

    async drop(): Promise<{ dropped: boolean; path: string }>{
        return this.collection.drop()
    }

    async deleteTable(tableName: string){
        return this.collection.deleteTable(tableName)
    }
}

export default JsonDB