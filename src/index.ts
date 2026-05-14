import File from "./fileManager/manage_file_ceation.js";
import type { DB_NAME,DB_PATH } from "./interfaces/collections_interface";

class JsonDB{
    collections: Map<DB_NAME,DB_PATH > = new Map<DB_NAME, DB_PATH>();

    constructor(db_name: DB_NAME, db_path: DB_PATH){
        File.create(db_path)
        .then(data =>{
                this.collections.set(db_name, data.path );
        })
        .catch((err:any)=>{
            throw Error(err.message);
        })        
    }
}

export default JsonDB