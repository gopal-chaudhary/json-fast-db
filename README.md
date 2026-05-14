# quick-local-db

A tiny, zero-dependency JSON-backed embedded DB for small Node projects — safe atomic writes and simple Table/Collection primitives. Ideal for prototyping, local tools, CLIs and small single-process apps.

## Features

- File-per-table storage (JSON array of records)
- Simple `Table` base class with CRUD: `insert`, `findAll`, `findBy`, `findOne`, `findById`, `update`, `deleteById`
- `Collection` to group tables (directory per collection)
- `JsonDB` convenience wrapper for a single collection
- Atomic writes with per-file queue (temp file + rename) to reduce corruption risk

## Limitations

- Not for multi-process concurrent writes (single-process safety only)
- No indexes or advanced queries — scans full JSON arrays
- Rewrites full file on mutation (suitable for small datasets)

## Install

```
npm install quick-local-db
```

## Usage (ESM)

```js
import JsonDB from 'quick-local-db'
import Table from 'quick-local-db/dist/model/table.js'

class User extends Table {}

// create DB-backed collection directory
const db = new JsonDB('users', './data/users')
const users = db.registerTable(User)

await users.insert({ name: 'Alice', email: 'alice@example.com' })
console.log(await users.findAll())
```

## API Overview

- `new JsonDB(collectionName, dirPath)` — creates a collection directory and returns a JSON-DB instance.
- `db.registerTable(ModelClass)` — register a table model (class extending `Table`). Returns an instance of the model.
- `Table` methods: `insert(obj)`, `findAll()`, `findBy(predicate)`, `findOne(predicate)`, `findById(id)`, `update(id, patch)`, `deleteById(id)`.

## Why atomic writes?

Writes are performed via a safe sequence: write to a temporary file and `rename()` to replace the original. Writes are also queued per file in-process so concurrent writes from the same Node process do not interleave.

## Playground code

```javascript
import JsonDB from "quick-local-db"
import Table from "quick-local-db/dist/model/table.js"

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
```

## Notes for maintainers

- `files` in `package.json` includes `dist`, `README.md`, and `LICENSE`. Source (`src`) is not shipped.
- See `playground/creation_test.js` for a runnable example.

## Contributing

Issues and PRs welcome. For major changes (WAL, concurrency, indexing) let's discuss design before implementation.

## License

ISC (see `LICENSE` file)
