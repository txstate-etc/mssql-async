/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'

describe('basic tests', () => {
  it('should be able to create a couple test tables', async () => {
    await Promise.all([
      db.execute(`CREATE TABLE dbo.test (
        id INT NOT NULL IDENTITY PRIMARY KEY,
        name VARCHAR(100),
        modified DATETIME
      )`),
      db.execute(`CREATE TABLE dbo.test2 (
        id INT NOT NULL IDENTITY PRIMARY KEY,
        name VARCHAR(100),
        modified DATETIME
      )`)
    ])
    const dbs = await db.getall('select * from sys.tables')
    expect(dbs?.length).to.be.greaterThan(0)
  }).timeout(5000)

  it('should be able to add test data', async () => {
    const promises = []
    for (let i = 0; i < 1000; i++) {
      promises.push(db.insert('INSERT INTO test (name, modified) VALUES (@name, GETUTCDATE())', { name: `name ${i}` }))
    }
    const ids = await Promise.all(promises)
    expect(ids?.length).to.equal(1000)
    expect(ids[0]).to.be.a('number')
  })

  it('should be able to add more test data', async () => {
    const promises = []
    for (let i = 0; i < 1000; i++) {
      promises.push(db.insert('INSERT INTO test2 (name, modified) VALUES (@name, GETUTCDATE())', { name: `name ${i}` }))
    }
    const ids = await Promise.all(promises)
    expect(ids?.length).to.equal(1000)
    expect(ids[0]).to.be.a('number')
  })

  it('should be able to select all rows', async () => {
    const rows = await db.getall('SELECT * FROM test')
    expect(rows?.length).to.equal(1000)
    expect(rows[0].name).to.be.a('string')
  })

  it('should be able to select a single row', async () => {
    const row = await db.getrow<{ name: string }>('SELECT * FROM test WHERE name=@name', { name: 'name 3' })
    expect(row?.name).to.equal('name 3')
  })

  it('should be able to select a single column in a single row', async () => {
    const name = await db.getval<string>('SELECT name FROM test WHERE name=@name', { name: 'name 3' })
    expect(name).to.equal('name 3')
  })

  it('should be able to select a single column in multiple rows', async () => {
    const names = await db.getvals<string>('SELECT TOP 5 name FROM test ORDER BY name')
    expect(names[3]).to.equal('name 100')
    expect(names).to.have.lengthOf(5)
  })

  it('should be able to update a row', async () => {
    const rows = await db.update('UPDATE test SET name=@newname WHERE name=@existing', { newname: 'name 1002', existing: 'name 999' })
    expect(rows).to.equal(1)
    const [newrow, oldrow] = await Promise.all([
      db.getrow('SELECT * FROM test WHERE name=@name', { name: 'name 1002' }),
      db.getrow('SELECT * FROM test WHERE name=@name', { name: 'name 999' })
    ])
    expect(newrow).to.exist
    expect(oldrow).to.be.undefined
  })

  it('should help you construct IN queries', async () => {
    const params = {}
    const rows = await db.getall(`SELECT * FROM test WHERE name IN (${db.in(params, ['name 2', 'name 5'])}) OR name IN (${db.in(params, ['name 8', 'name 9'])})`, params)
    expect(rows).to.have.lengthOf(4)
  })
})
