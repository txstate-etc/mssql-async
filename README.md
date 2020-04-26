# Overview
This library has a few core principles:
* Focus on promises and async iterators, do away with callbacks and event-emitting streams
* Make advanced usage optional but easy, e.g.:
  * transactions
  * streaming large result sets
  * prepared statements
* Make it difficult to make a mistake, e.g.:
  * Always use a connection pool
  * Hide everything having to do with acquiring/releasing connections

# Getting Started
## Standard connection
Works just like creating a mssql pool. You will want to make a single pool and export it so that it can
be imported all over your code.
```javascript
import Db from 'mssql-async'
export const db = new Db({
  server: 'yourhost',
  ...
})

async function main() {
  const row = await db.getrow('SELECT ...')
}
main().catch(e => console.error(e))
```
## Connect with environment variables
When working in docker, it's common to keep database configuration in environment variables. In order to
make that easy, this library provides a convenient way to import a singleton pool created with the following
environment variables:
```
  MSSQL_HOST (default 'mssql')
  MSSQL_DATABASE (default 'default_database')
  MSSQL_USER (default 'sa')
  MSSQL_PASS
  MSSQL_POOL_SIZE (default is mssql's default)
```
This way, connecting is very simple, and you don't have to worry about creating a singleton pool for the
rest of your codebase to import:
```javascript
import db from 'mssql-async/db'

async function main() {
  const row = await db.getrow('SELECT ...')
}
main().catch(e => console.error(e))
```

# Basic Usage
A lot of convenience methods are provided that allow you to specify the kind of operation you are about
to do and the kind of return data you expect.
## Querying
```javascript
const rows = await db.getall('SELECT name FROM mytable')
console.log(rows) // [{ name: 'John' }, { name: 'Maria' }, ...]
const row = await db.getrow('SELECT name FROM mytable WHERE name=@name', { name: 'John' })
console.log(row) // { name: 'John' }
const name = await db.getval('SELECT name FROM mytable WHERE name=@name', { name: 'John' })
console.log(name) // John
```
## Mutating
```javascript
const insertId = await db.insert('INSERT INTO mytable (name) VALUES (@name)', { name: 'Mike' })
const rowsUpdated = await db.update('UPDATE mytable SET name=@newname WHERE name=@oldname', { newname: 'Johnny', oldname: 'John' })
const success = await db.execute('CREATE TABLE anothertable ...')
```
## Bound Parameter Arrays
Named parameters are a little cumbersome with array operations, so we provide a helper:
```javascript
const params = { age: 30 }
const rows = await db.getall(`SELECT name FROM mytable WHERE age > @age AND name IN (${db.in(params, ['John', 'Mike'])})`, params)
```
## Raw Query
If the convenience methods are hiding something you need from mssql, you can use .query() to get
back whatever would have been returned by mssql.
```javascript
const result = await db.query('INSERT INTO mytable (name) VALUES (@name); UPDATE anothertable SET col1=@col1', { name: 'Mike', col1: 'Value' })
const rowsUpdated = result.rowsUpdated[1]
```
# Advanced Usage
## Streaming
### Async Iterable
The async iterable approach is by far the simplest. It works almost exactly like `.getall()`, except
the advantage here is that it does not load the entire result set into memory at one time, which will help
you avoid out-of-memory issues when dealing with thousands or millions of rows.
```javascript
const stream = db.stream('SELECT name FROM mytable')
for await (const row of stream) {
  // work on the row
}
```
Note that `.stream()` returns a node `Readable` in object mode, so you can easily do other things with
it like `.pipe()` it to another stream processor.
### Iterator .next()
Another available approach is to use the iterator pattern directly. This is a standard javascript iterator
that you would receive from anything that supports the async iterator pattern. Probably to be avoided unless
you are working with multiple result sets at the same time (e.g. syncing two tables).
```javascript
const iterator = db.iterator('SELECT name FROM mytable')
while (true) {
  const { value: row, done } = await iterator.next()
  if (!done) {
    // work on the row
  } else {
    break
  }
}
```
## Transactions
A method is provided to support working inside a transaction. Since the core Db object is a mssql pool, you
cannot send transaction commands without this method, as each command would end up on a different connection.

To start a transaction, provide a callback that MUST return a promise (just make it async). A new instance of
`db` is provided to the callback; it represents a single connection, inside a transaction. You do NOT send
`START TRANSACTION`, `ROLLBACK`, or `COMMIT` as these are handled automatically.
```javascript
await db.transaction(async db => {
  // both of these queries happen in the same transaction
  const row = await db.getrow('SELECT * FROM ...')
  await db.update('UPDATE mytable SET ...')
})
```
If you need to roll back, simply throw an error. Similarly, any query that throws an error will trigger
a rollback.
```javascript
await db.transaction(async db => {
  const id = await db.insert('INSERT INTO user ...')
  throw new Error('oops!')
}) // the INSERT will be rolled back and will not happen
```
## Prepared Statements
Prepared statements are nearly automatic, you just need to notate which queries need it. It's desirable to
carefully pick a few complicated queries because each unique SQL string that uses prepared statement support
will use up a small amount of resources on both client and server.
```javascript
await db.getrow('SELECT m.*, o.* FROM mytable m, othertable o WHERE ...complicated...',
  [ /* bind parameters */ ],
  { saveAsPrepared: true }
)
```
Now, future calls with this same SQL statement (before inserting bound parameters) will be able to skip the
query planning stage on the mysql server and return data a little bit faster.

## Timezones
Working with timezones can be very confusing. Unfortunately there's nothing this library can do to help except
offer some advice.
* Use DATETIMEOFFSET instead of DATETIME wherever possible. Storing the original timezone (the active timezone
when the timestamp was generated) is always the best approach where possible.
* When you have to use DATETIME, always store as UTC. If you send javascript Date() objects as parameters, they
will be converted to UTC automatically.
* Remember to use GETUTCDATE() instead of GETDATE() or CURRENT_TIMESTAMP when setting a DATETIME default or
generating a timestamp in a query.
## Typescript
This library is written in typescript and provides its own types. For added convenience, methods that return
rows or values will accept a generic so that you can specify the return type you expect:
```typescript
interface Book {
  id: number
  title: string
  isbn: string
}
const row = await db.getrow<Book>('SELECT id, title, isbn FROM books WHERE id=@id', { id: 5 })
```
