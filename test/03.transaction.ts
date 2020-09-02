/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'

describe('transaction tests', () => {
  it('should be able to run queries in a transaction', async () => {
    await db.transaction(async db => {
      const row = await db.getrow('SELECT * FROM test WHERE name=@name', { name: 'name 5' })
      expect(row?.name).to.equal('name 5')
    })
  })

  it('should be able to stream in a transaction', async () => {
    await db.transaction(async db => {
      const stream = db.stream('SELECT * FROM test')
      let count = 0
      for await (const row of stream) {
        count++
        expect(row?.name).to.match(/name \d+/)
      }
      expect(count).to.equal(1000)
    })
  })

  it('should commit what happens during a transaction', async () => {
    let id = 0
    await db.transaction(async db => {
      id = await db.insert('INSERT INTO test (name, modified) VALUES (@name, GETUTCDATE())', { name: 'name 2000' })
      expect(id).to.be.greaterThan(0)
    })
    const row = await db.getrow('SELECT * FROM test WHERE id=@id', { id })
    expect(row?.name).to.equal('name 2000')
  })

  it('should automatically roll back when an error is thrown inside the transaction', async () => {
    let id = 0
    try {
      await db.transaction(async db => {
        id = await db.insert('INSERT INTO test (name, modified) VALUES (@name, GETUTCDATE())', { name: 'name 2001' })
        expect(id).to.be.greaterThan(0)
        const row = await db.getrow('SELECT * FROM test WHERE id=@id', { id })
        expect(row?.name).to.equal('name 2001')
        throw new Error('Fail!')
      })
    } catch (e) {
      expect(e.message).to.equal('Fail!')
    }
    const row = await db.getrow('SELECT * FROM test WHERE id=@id', { id })
    expect(row).to.be.undefined
  })

  it('should automatically roll back when a query has an error', async () => {
    let id = 0
    try {
      await db.transaction(async db => {
        id = await db.insert('INSERT INTO test (name, modified) VALUES (@name, GETUTCDATE())', { name: 'name 2001' })
        expect(id).to.be.greaterThan(0)
        await db.getrow('SELECT * FROM test WHERE blah id=@id', { id })
      })
    } catch (e) {
      expect(e.message).to.match(/expression.*non-boolean type.*expected/i)
    }
    const row = await db.getrow('SELECT * FROM test WHERE id=@id', { id })
    expect(row).to.be.undefined
  })

  it('should properly release connections back to the pool', async () => {
    for (let i = 0; i < 15; i++) {
      await db.transaction(async db => {
        const row = await db.getrow('SELECT * FROM test WHERE name=@name', { name: `name ${i}` })
        expect(row?.name).to.equal(`name ${i}`)
      })
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(true).to.be.true
  })

  it('should properly release connections back to the pool during rollbacks', async () => {
    for (let i = 0; i < 15; i++) {
      try {
        await db.transaction(async db => {
          const row = await db.getrow('SELECT * FROM test WHERE name=@name', { name: `name ${i}` })
          expect(row?.name).to.equal(`name ${i}`)
          throw new Error('Fail!')
        })
      } catch (e) {
        expect(e.message).to.equal('Fail!')
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(true).to.be.true
  })

  it('should transmit a return value', async () => {
    const val = await db.transaction(async db => {
      return db.getval<string>('SELECT name FROM test WHERE name=@name', { name: 'name 400' })
    })
    expect(val).to.equal('name 400')
  })
})
