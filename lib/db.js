const log = require('./logger')
const nano = require('nano')
const { promisify } = require('util')
const { URL } = require('url')

module.exports = { connect }

async function connect () {
  let url = new URL(process.env.DATABASE_URL)

  const dbname = url.pathname.replace(/^\//, '')
  log.trace(`Extracted database name '${dbname}' from DATABASE_URL`)

  url.pathname = ''
  url = url.toString().replace(/\/$/, '')

  log.info('Connecting to CouchDB')
  log.trace(`Connection URL: ${url}`)
  const couch = nano(url)

  log.debug(`Opening '${dbname}' database`)
  const db = couch.use(dbname)

  await promisify(db.info)()
  log.info('Got CouchDB')

  return { couch, db }
}
