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
- `new JsonDB(collectionName, dirPath)` — creates a collection directory and returns a `JsonDB` instance.

- `db.registerTable(ModelClass)` — register a table model (class extending `Table`). Returns an instance of the model bound to a file named `<ModelClassName>.json` inside the collection directory.

API: `Table` (methods)
- `insert(obj: JSONObject): Promise<JSONObject>` — inserts `obj` and returns the inserted record (an `id` is generated if not provided).
- `findAll(): Promise<JSONObject[]>` — returns all records (array).
- `findBy(predicate): Promise<JSONObject[]>` — returns all records matching `predicate`.
- `findOne(predicate): Promise<JSONObject | null>` — returns the first matching record or `null`.
- `findById(id: string): Promise<JSONObject | null>` — convenience wrapper to find a record by `id`.
- `update(id: string, patch: Partial<JSONObject>): Promise<JSONObject | null>` — applies `patch` to the record with `id` and returns the updated record (or `null` if not found).
- `deleteById(id: string): Promise<boolean>` — deletes a record by `id`; returns `true` if removed.

API: `Collection` (methods)
- `registerTable(ModelClass)` — returns a new instance of the supplied `ModelClass` (which should extend `Table`).
- `deleteTable(tableName: string): Promise<{ deleted: boolean; path: string}>` — removes the underlying JSON file for the named table.
- `drop(): Promise<{ dropped: boolean; path: string }>` — recursively deletes the collection directory and returns whether it was removed.

TypeScript types
- The package emits declaration files (`dist/index.d.ts`) so TypeScript consumers get types. The `JSONObject` type used by `Table` is `{ [k: string]: any }`.

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

## Examples and Tests

This project includes a small test-suite under `test/` which demonstrates the common user flows and acts as executable documentation. Run:

```bash
npm run build
npm test
```

What the tests cover:
- creating a `JsonDB` and `Collection`
- registering a `Table` model
- full CRUD cycle (`insert`, `findAll`, `findBy`, `findOne`, `findById`, `update`, `deleteById`)
- removing a table file via `deleteTable` and deleting the collection via `drop`
- concurrent inserts to exercise the atomic-writer queue and ensure no write corruption

If you want more examples, see `playground/creation_test.js` which demonstrates typical usage and can be run directly after `npm run build`.

Playground examples: `playground/examples/` includes:
- `table_crud_example.js` — full CRUD demo for a `User` table.
- `collection_example.js` — demonstrates `deleteTable` and `drop` on a collection.
- `concurrency_example.js` — performs many concurrent inserts to exercise atomic writes.
- `run-all-examples.sh` — helper script to build and run all examples.

Run examples:

```bash
npm run build
bash playground/examples/run-all-examples.sh
```

**Architecture & Internals**

This project now ships two storage backends and the README below describes their trade-offs:

- **JSON-file backend (original):** each table is stored as a single JSON file and mutations rewrite the whole file. Simple and easy to inspect, but writes and point-reads cost O(N) (not suitable for large tables).
- **WAL backend (new):** each table uses an append-only WAL file plus a small on-disk index mapping `id -> offset`. Inserts and updates append small records (O(1)), and lookups by id are direct seeks (O(1)). The WAL implementation files are in `src/engine/` and the WAL backend is `WalTable`.

Key notes:
- WAL file format: length-prefixed JSON records. Each record is either `put` (with `doc`) or `del` (with `id`). The index (file `.wal.idx`) stores `id` → offset into the WAL for fast reads.
- Durability: writes are appended and flushed; the index is kept on disk but rebuilt from WAL if missing or corrupted.
- Compaction: WAL grows over time; compaction/snapshotting is required to reclaim space and restore efficient full-table scans. Compaction is not yet implemented — see `docs/workflow.md` for the suggested compaction approach.
- Concurrency: single-process concurrent writes are handled (per-file operation queue + atomic write). Cross-process writer locking is not yet implemented — add `flock`/lockfile for multi-process safety before using in concurrent server processes.

Where to read more
- Implementation and internal workflow for WAL: `docs/workflow.md` (new). It explains record format, index rebuild, append/read semantics, and compaction suggestions.
- Tests and examples: `test/run-tests.js` validates both backends and `playground/examples/` contains runnable samples.

If you want me to implement compaction, inter-process locking, or a migration tool from JSON → WAL, tell me which to prioritize and I'll add it next.

## Contributing

Issues and PRs welcome. For major changes (WAL, concurrency, indexing) let's discuss design before implementation.

## License

ISC (see `LICENSE` file)
