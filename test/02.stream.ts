/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'

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

  it('should be able to stream with the iterator syntax', async () => {
    const iterator = db.iterator<{ name: string }>('SELECT * FROM test')
    let count = 0
    while (true) {
      const { value: row, done } = await iterator.next()
      if (done) break
      count++
      expect(row.name).to.match(/^name \d+/)
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

  it('should properly release connections back to the pool with iterator syntax', async () => {
    for (let i = 0; i < 15; i++) {
      const iterator = db.iterator('SELECT TOP 100 * FROM test')
      while (true) {
        const { done, value: row } = await iterator.next()
        if (done) break
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
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
          throw new Error('Fail!')
        }
      } catch (e) {
        expect(e.message).to.equal('Fail!')
        errorthrown = true
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
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
      } catch (e) {
        errorthrown = true
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
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
      } catch (e) {
        errorthrown = true
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.false
  })

  it('should properly release connections back to the pool when the consumer stops processing the stream', async () => {
    let errorthrown = false
    for (let i = 0; i < 15; i++) {
      const stream = db.stream('SELECT TOP 100 * FROM test')
      try {
        for await (const row of stream) {
          expect(row?.name).to.match(/name \d+/)
          break
        }
      } catch (e) {
        errorthrown = true
      }
    }
    // if transactions eat connections then it will hang indefinitely after 10 transactions
    // getting this far means things are working
    expect(errorthrown).to.be.false
  })
})
