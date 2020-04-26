/* eslint-disable @typescript-eslint/no-unused-expressions */
/* global describe, it */
import { expect } from 'chai'
import db from '../src/db'

describe('iterator tests', () => {
  it('should be able to return an AsyncIterableIterator', async () => {
    const iter = db.iterator('SELECT * FROM test')
    let finished = false
    let count = 0
    while (!finished) {
      const result = await iter.next()
      finished = result.done ?? false
      if (!finished) {
        expect(result?.value?.name).to.match(/^name \d+$/)
        count++
      }
    }
    expect(count).to.equal(1001)
  })
})
