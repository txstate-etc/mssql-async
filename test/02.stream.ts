/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'
import Db from '../src/index'

describe('streaming tests', () => {
  it('should be able to stream a row at a time', async () => {
    const stream = db.stream<{ name: string }>('SELECT * FROM test')
    let count = 0
    for await (const row of stream) {
      count++
      expect(row?.name).to.match(/^name \d+/)
    }
    expect(count).to.equal(1000)
  })

  it('should be able to stream a row at a time with a high watermark setting', async () => {
    const stream = db.stream('SELECT * FROM test', { highWaterMark: 10 })
    let count = 0
    for await (const row of stream) {
      count++
      expect(row?.name).to.match(/^name \d+/)
    }
    expect(count).to.equal(1000)
  })

  it('should put an error on the stream if the query errors', async () => {
    const stream = db.stream('SELECT blah FROM test')
    try {
      for await (const row of stream) {
        // do not expect to get this far
      }
      expect(true).to.be.false('for await should have errored')
    } catch (e: any) {
      expect(e.code).to.equal('EREQUEST')
    }
  })

  it('should properly release connections back to the pool', async () => {
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test')
      for await (const row of stream) {
        expect(row?.name).to.match(/name \d+/)
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(true).to.be.true
  })

  it('should properly release connections back to the pool when an async iterator loop throws an error', async () => {
    let errorthrown = false
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test')
      try {
        // eslint-disable-next-line no-unreachable-loop
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
          throw new Error('Fail!')
        }
      } catch (e: any) {
        expect(e.message).to.equal('Fail!')
        errorthrown = true
      }
    }
    // if thrown errors eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.true
  })

  it('should properly release connections back to the pool when a query has a syntax error', async () => {
    let errorthrown = false
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test3')
      try {
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
        }
      } catch (e: any) {
        errorthrown = true
      }
    }
    // if syntax errors eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.true
  })

  it('should properly release connections back to the pool when the consumer cancels the stream', async () => {
    let errorthrown = false
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test')
      try {
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
          stream.destroy()
        }
      } catch (e: any) {
        errorthrown = true
      }
    }
    // if cancellations eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.true
  })

  it('should properly release connections back to the pool when the consumer cancels the stream before the database is connected', async () => {
    const db2 = new Db()
    for (let i = 0; i < 15; i++) {
      const stream = db2.stream('SELECT TOP 100 * FROM test')
      stream.destroy()
    }
    const stream = db2.stream('SELECT TOP 100 * FROM test')
    for await (const row of stream) {
      expect(row?.name).to.match(/name \d+/)
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    await db2.close()
  })

  it('should properly release connections back to the pool when the consumer breaks a for await', async () => {
    let errorthrown = false
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test')
      try {
        // eslint-disable-next-line no-unreachable-loop
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
          break
        }
      } catch (e: any) {
        errorthrown = true
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.false
  })

  it('should connect to the database when a stream is the first thing attempted', async () => {
    const db2 = new Db()
    const stream = db2.stream<{ name: string }>('SELECT * FROM test')
    let count = 0
    for await (const row of stream) {
      count++
      expect(row?.name).to.match(/^name \d+/)
    }
    expect(count).to.equal(1000)
    await db2.close()
  })

  it('should show the library consumer in the error stacktrace when a streaming query errors', async () => {
    try {
      const stream = db.stream('SELECT blah FROM test')
      for await (const row of stream) {
        expect(row).to.exist
      }
      expect(true).to.be.false('should have thrown for SQL error')
    } catch (e: any) {
      expect(e.stack).to.match(/02\.stream\.ts/)
    }
  })
})
