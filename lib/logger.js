const isJournal = require('is-connected-to-systemd-journal').sync
const { name } = require('../package.json')

const logger = (isJournal() || process.env.FORCE_JOURNALD)
  ? new (require('systemd-journald'))({ syslog_identifier: name })
  : require('pino')()

if (logger.level) {
  logger.level = 'trace'
}

if (!logger.trace) {
  logger.trace = () => {}
}

if (!logger.warn) {
  logger.warn = (...args) => logger.warning(...args)
}

if (!logger.error) {
  logger.error = (...args) => logger.err(...args)
}

if (!logger.fatal) {
  logger.fatal = (...args) => logger.crit(...args)
}

module.exports = logger
