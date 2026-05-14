import JsonDB from "../dist/index.js"

// this is example of how to create a db
import Table from "../dist/model/table.js"

// table name 
class User extends Table {}

// db collection setup
// one collection will contain all the tables 
const db = new JsonDB("users", "/home/gopal/Desktop/-json-fast-db/playground/users")
// debug
console.log('db instance keys:', Object.keys(db))
console.log('registerTable exists?:', typeof db.registerTable)
// attach the table to collection db
const users = db.registerTable(User);

(async ()=>{
	const alice = await users.insert({ name: "Alice", email: "alice@example.com" })
	console.log('Inserted:', alice)

	const all = await users.findAll()
	console.log('All records:', all)

	const found = await users.findBy(r=>r.name === 'Alice')
	console.log('Found:', found)

	const updated = await users.update(alice.id, { email: 'alice@new.com' })
	console.log('After update (returned):', updated)
	console.log('After update (findById):', await users.findById(alice.id))

	const removed = await users.deleteById(alice.id)
	console.log('Deleted:', removed)
})()

