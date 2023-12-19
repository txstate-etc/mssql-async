/* global before */
import Db from '../src'

before(async function () {
  // on first run, mssql needs a long time to set up the data volume
  this.timeout(100000)
  const db = new Db({
    database: '',
    pool: { max: 10 }
  })
  await db.wait()
  await db.execute(`
  IF NOT EXISTS
  (
    SELECT name FROM master.dbo.sysdatabases
    WHERE name = N'default_database'
  )
  CREATE DATABASE default_database`)
  await db.execute('USE default_database')
  await db.execute('DROP TABLE IF EXISTS test')
  await db.execute('DROP TABLE IF EXISTS test2')
})
