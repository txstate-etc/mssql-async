import mssql, { ConnectionPool, Transaction } from 'mssql'
import { Readable } from 'stream'

export interface QueryOptions {
  /* currently does nothing, prepared statements in mssql are extremely limited */
  saveAsPrepared?: boolean
}

export interface StreamOptions extends QueryOptions {
  highWaterMark?: number
}

interface canBeStringed {
  toString: () => string
}
interface BindObject { [keys: string]: BindParam }
type BindParam = boolean|number|string|null|Date|Buffer|canBeStringed|BindObject
type ColTypes = BindParam
interface DefaultReturnType { [keys: string]: ColTypes }
type BindInput = BindObject

interface StreamIterator <ReturnType> {
  [Symbol.asyncIterator]: () => StreamIterator<ReturnType>
  next: () => Promise<{ done: boolean, value: ReturnType }>
  return: () => Promise<{ done: boolean, value: ReturnType }>
}

interface GenericReadable<T> extends Readable {
  [Symbol.asyncIterator]: () => StreamIterator<T>
}

export class Queryable {
  protected conn: ConnectionPool | Transaction

  constructor (conn: ConnectionPool | Transaction, connectpromise?: Promise<void>) {
    this.conn = conn
  }

  request (sql: string, binds?: BindInput, options?: QueryOptions) {
    if (!options) options = {}
    const req = this.conn.request()
    for (const [key, val] of Object.entries(binds ?? {})) {
      req.input(key, val)
    }
    return req
  }

  async query<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: QueryOptions) {
    try {
      const req = this.request(sql, binds, options)
      return await req.query<ReturnType>(sql)
    } catch (e) {
      e.clientstack = e.stack
      e.stack = (new Error().stack ?? '')
      Error.captureStackTrace(e, this.query)
      throw e
    }
  }

  async getval<ReturnType = ColTypes> (sql: string, binds?: BindInput, options?: QueryOptions) {
    const row = await this.getrow<[ReturnType]>(sql, binds, options)
    if (row) return Object.values(row)[0]
  }

  async getvals<ReturnType = ColTypes> (sql: string, binds?: BindInput, options?: QueryOptions) {
    const rows = await this.getall<[ReturnType]>(sql, binds, options)
    return rows.map(r => Object.values(r)[0])
  }

  async getrow<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: QueryOptions) {
    const results = await this.getall<ReturnType>(sql, binds, options)
    if (results?.length > 0) return results?.[0]
  }

  async getall<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: QueryOptions) {
    const results = await this.query<ReturnType>(sql, binds, options)
    return results.recordset
  }

  async execute (sql: string, binds?: BindInput, options?: QueryOptions) {
    await this.query(sql, binds, options)
    return true
  }

  async update (sql: string, binds?: BindInput, options?: QueryOptions) {
    const result = await this.query(sql, binds, options)
    return result.rowsAffected[0]
  }

  async insert (sql: string, binds?: BindInput, options?: QueryOptions) {
    return await this.getval<number>(sql + '; SELECT SCOPE_IDENTITY() AS id', binds, options) as number
  }

  protected feedStream<ReturnType> (stream: GenericReadable<ReturnType>, sql: string, binds: BindInput, stacktrace: string|undefined, options: QueryOptions = {}) {
    if (stream.destroyed) return

    const req = this.request(sql, binds, options)
    req.stream = true

    let canceled = false
    stream._read = () => {
      req.resume()
    }
    stream._destroy = (err: Error, cb) => {
      if (err) stream.emit('error', err)
      canceled = true
      req.resume()
      cb()
    }
    req.on('row', row => {
      if (canceled) return
      if (!stream.push(row)) {
        req.pause()
      }
    })
    req.on('error', (err) => {
      if (canceled) return
      err.clientstack = err.stack
      err.stack = (stacktrace ?? '').replace(/^Error:/, `Error: ${err.message as string ?? ''}`)
      stream.emit('error', err)
    })
    req.on('done', () => {
      if (canceled) return
      stream.push(null)
    })

    req.query(sql).catch(e => {
      stream.emit('error', e)
    })
  }

  protected handleStreamOptions<ReturnType> (sql: string, bindsOrOptions: any, options?: StreamOptions) {
    let binds
    if (!options && (bindsOrOptions?.highWaterMark || bindsOrOptions?.objectMode)) {
      options = bindsOrOptions
      binds = []
    } else {
      binds = bindsOrOptions
    }
    const queryOptions = {
      saveAsPrepared: options?.saveAsPrepared
    }
    const streamOptions = {
      highWaterMark: options?.highWaterMark
    }
    const stream = new Readable({ ...streamOptions, objectMode: true }) as GenericReadable<ReturnType>
    stream._read = () => {}
    stream._destroy = (err: Error, cb) => {
      if (err) stream.emit('error', err)
      cb()
    }
    const stacktraceError: { stack?: string } = {}
    Error.captureStackTrace(stacktraceError, this.handleStreamOptions)
    return { binds, queryOptions, stream, stacktrace: stacktraceError.stack }
  }

  stream<ReturnType = DefaultReturnType> (sql: string, options: StreamOptions): GenericReadable<ReturnType>
  stream<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: StreamOptions): GenericReadable<ReturnType>
  stream<ReturnType = DefaultReturnType> (sql: string, bindsOrOptions: any, options?: StreamOptions) {
    const { binds, queryOptions, stream, stacktrace } = this.handleStreamOptions<ReturnType>(sql, bindsOrOptions, options)
    this.feedStream(stream, sql, binds, stacktrace, queryOptions)
    return stream
  }

  iterator<ReturnType = DefaultReturnType> (sql: string, options: StreamOptions): StreamIterator<DefaultReturnType>
  iterator<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: StreamOptions): StreamIterator<DefaultReturnType>
  iterator<ReturnType = DefaultReturnType> (sql: string, bindsOrOptions: any, options?: StreamOptions) {
    const ret = this.stream<ReturnType>(sql, bindsOrOptions, options)[Symbol.asyncIterator]()
    return ret
  }

  in (binds: BindInput, newbinds: BindParam[]) {
    const startindex = Object.keys(binds).length
    for (let i = 0; i < newbinds.length; i++) {
      binds[i + startindex] = newbinds[i]
    }
    return Array.from({ length: newbinds.length }, (v, k) => k + startindex).map(n => `@${n}`).join(',')
  }
}

export default class Db extends Queryable {
  protected pool: ConnectionPool
  protected connectpromise!: Promise<void>

  constructor (config?: Partial<mssql.config>) {
    const poolSizeString = process.env.MSSQL_POOL_SIZE ?? process.env.DB_POOL_SIZE
    const domain = config?.domain ?? process.env.MSSQL_DOMAIN ?? process.env.DB_DOMAIN
    const pool = new ConnectionPool({
      ...config,
      options: {
        ...(config?.options),
        enableArithAbort: true
      },
      server: config?.server ?? process.env.MSSQL_HOST ?? process.env.DB_HOST ?? 'mssql',
      ...(domain ? { domain } : {}),
      user: config?.user ?? process.env.MSSQL_USER ?? process.env.DB_USER ?? 'sa',
      password: config?.password ?? process.env.MSSQL_PASS ?? process.env.MSSQL_PASSWORD ?? process.env.DB_PASS ?? process.env.DB_PASSWORD ?? 'Secret123',
      database: config?.database ?? process.env.MSSQL_DATABASE ?? process.env.DB_DATABASE ?? 'default_database',
      port: config?.port ?? parseInt(process.env.MSSQL_PORT ?? process.env.DB_PORT ?? '1433'),
      pool: {
        ...config?.pool,
        ...(poolSizeString ? { max: parseInt(poolSizeString) } : {})
      }
    })
    super(pool)
    this.pool = pool
  }

  async connect () {
    let errorcount = 0
    while (true) {
      try {
        await this.pool.connect()
        return
      } catch (error) {
        if (errorcount > 2) console.error(error.message)
        errorcount++
        // sleep and try again
        if (errorcount > 1) console.log('Unable to connect to MSSQL database, trying again in 2 seconds.')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  async close () {
    await this.wait()
    await this.pool.close()
  }

  async rawpool () {
    await this.wait()
    return this.pool
  }

  async wait () {
    if (typeof this.connectpromise === 'undefined') this.connectpromise = this.connect()
    return await this.connectpromise
  }

  async query<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: QueryOptions) {
    await this.wait()
    return await super.query<ReturnType>(sql, binds, options)
  }

  stream<ReturnType = DefaultReturnType> (sql: string, options: StreamOptions): GenericReadable<ReturnType>
  stream<ReturnType = DefaultReturnType> (sql: string, binds?: BindInput, options?: StreamOptions): GenericReadable<ReturnType>
  stream<ReturnType = DefaultReturnType> (sql: string, bindsOrOptions: any, options?: StreamOptions) {
    const { binds, queryOptions, stream, stacktrace } = this.handleStreamOptions<ReturnType>(sql, bindsOrOptions, options)
    this.wait().then(() => {
      this.feedStream(stream, sql, binds, stacktrace, queryOptions)
    }).catch(e => stream.emit('error', e))
    return stream
  }

  async transaction <ReturnType> (callback: (db: Queryable) => Promise<ReturnType>, options?: { retries?: number }): Promise<ReturnType> {
    await this.wait()
    const transaction = this.pool.transaction()
    const db = new Queryable(transaction)
    await transaction.begin()
    try {
      const ret = await callback(db)
      await transaction.commit()
      return ret
    } catch (e) {
      if (e.number === 1205 && options?.retries) { // deadlock
        return await this.transaction(callback, { ...options, retries: options.retries - 1 })
      } else {
        // rollback unnecessary on deadlock, in fact it throws a new error, which is problematic
        if (e.number !== 1205) await transaction.rollback()
        throw e
      }
    }
  }
}
