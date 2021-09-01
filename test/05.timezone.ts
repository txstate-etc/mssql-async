/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'

function expectSameTime (date1: Date, date2: Date) {
  expect(Math.abs(date1.getTime() - date2.getTime())).to.be.lessThan(10000)
}

describe('timezone tests', () => {
  it('should automatically generate dates in UTC', async () => {
    const tz = await db.getval<Date>('SELECT TOP 1 modified FROM test')
    expect(tz).to.be.a('Date')
    expectSameTime(tz!, new Date())
  })

  it('should treat new Date() from client and GETUTCDATE() in sql as the same date', async () => {
    await db.update('UPDATE test SET modified=GETUTCDATE() WHERE id=@id', { id: 19 })
    const now = await db.getval<Date>('SELECT modified FROM test WHERE id=@id', { id: 19 })
    await db.update('UPDATE test SET modified=@modified WHERE id=@id', { modified: new Date(), id: 19 })
    const newdate = await db.getval<Date>('SELECT modified FROM test WHERE id=@id', { id: 19 })
    expectSameTime(now!, newdate!)
  })
})
