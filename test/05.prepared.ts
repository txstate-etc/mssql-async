/* eslint-disable @typescript-eslint/no-unused-expressions */
/*
import { expect } from 'chai'
import db from '../src/db'

describe('prepared statements', () => {
  it('should be able to use prepared statements to get rows', async () => {
    const row = await db.getrow('SELECT * FROM test WHERE name=@name', { name: 'name 3' }, { saveAsPrepared: true })
    expect(row?.name).to.equal('name 3')
    const anotherrow = await db.getrow('SELECT * FROM test WHERE name=@name', { name: 'name 6' }, { saveAsPrepared: true })
    expect(anotherrow?.name).to.equal('name 6')
  })

  it('should have a question mark in the SQL syntax error returned from the server', async () => {
    const promise = db.getrow('SELECT * FROM test WHERE blah name=@name', { name: 'name 6' }, { saveAsPrepared: true })
    try {
      await expect(promise).to.be.rejected
    } catch (e) {
      expect(e.message).to.match(/name=\?/)
    }
  })
})
*/
