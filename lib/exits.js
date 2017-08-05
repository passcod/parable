const log = require('./logger')

exports.exit = exit
function exit (code) {
  log.trace('Exiting on next tick')
  setImmediate(() => process.exit(code))
}

log.trace('Attaching unhandledRejection handler')
process.on('unhandledRejection', (err) => {
  log.fatal('Received top-level unhandled rejection')
  log.fatal(err && err.stack || err)
  exit(2)
})

log.trace('Attaching uncaughtException handler')
process.on('uncaughtException', (err) => {
  log.fatal('Received top-level exception')
  log.fatal(err && err.stack || err)
  exit(2)
})

log.trace('Attaching warning handler')
process.on('warning', (err) => {
  log.warn('Received top-level warning')
  log.warn(err && err.stack || err)
})

log.trace('Attaching SIGINT handler')
process.on('SIGINT', () => {
  log.info('Got SIGINT. Exiting gracefully')
  exit(0)
})

log.trace('Attaching SIGTERM handler')
process.on('SIGTERM', () => {
  log.info('Got SIGTERM. Exiting gracefully')
  exit(0)
})

log.trace('Attaching beforeExit handler')
process.on('beforeExit', (code) => {
  log.trace(`Exiting soon with code ${code}`)
})

log.trace('Attaching exit handler')
process.on('exit', (code) => {
  log.trace(`Exiting with code ${code}`)
})
