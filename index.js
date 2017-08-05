const DB = require('./lib/db')
const Deploy = require('./lib/deploy')
const { DeployFail } = require('./lib/errors')
const { exit } = require('./lib/exits')
const log = require('./lib/logger')
const { promisify } = require('util')

log.debug('Loading .env')
require('dotenv').config()

const { version } = require('./package.json')
log.info(`Starting parable ${version}`)

log.debug('Starting main()')
main()
  .then(() => log.info('End of story, goodnight!'))
  .catch((err) => {
    log.fatal('Received rejection/exception from main()')
    log.fatal(err && err.stack || err)
    exit(1)
  })

async function main () {
  const { db } = await DB.connect()

  log.debug('Fetching all configs')
  const { rows, total_rows } = await promisify(db.list)({ include_docs: true })
  log.info(`Got ${total_rows} configs`)

  const deploys = rows.map((r) => new Deploy(r.doc))
  for (const deploy of deploys) {
    try {
      await deploy.load()
      await deploy.applyGit()
    } catch (e) {
      if (e instanceof DeployFail) {
        log.error(e.message)
        log.error(e.stack)
        continue
      }

      throw e
    }
  }
}
