import JsonDB from "../dist/index.js"
import Table from "../dist/model/table.js"

class User extends Table {}

const db = new JsonDB("users", "./playground/users")
const users = db.registerTable(User);

(async ()=>{
  const all = await users.findAll()
  let target = all[0]
  if(!target){
    target = await users.insert({ name: "Alice", email: "alice@example.com" })
    console.log("Inserted:", target)
  } else {
    console.log("Using existing:", target)
  }

  const removed = await users.deleteById(target.id)
  console.log("Deleted:", removed)
})()