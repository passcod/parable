const DBus = require('dbus')
const log = require('./logger')
const { promisify } = require('util')

function promised (obj, name) {
  return promisify(obj[name].bind(obj))
}

log.info('Connecting to system bus')
const bus = DBus.getBus('session')

function busInterface (name, path) {
  log.info(`Getting systemd ${name} interface`)
  return promised(bus, 'getInterface')(
    'org.freedesktop.systemd1',
    path,
    `org.freedesktop.systemd1.${name}`
  )
}

class Iface {
  constructor (name, path) {
    this.ifacename = name
    this.ifacepath = path
  }

  async init () {
    this.iface = await busInterface(this.ifacename, this.ifacepath)
  }

  props () {
    log.trace(`Fetching properties of ${this.ifacename} on ${this.ifacepath}`)
    return promised(this.iface, 'getProperties')()
  }

  method (name, ...args) {
    log.trace(`Calling method ${this.ifacename}.${name} on ${this.ifacepath}`)
    return promised(this.iface, name)(...args)
  }
}

class Systemd extends Iface {
  constructor () {
    super('Manager', '/org/freedesktop/systemd1')
  }

  async unit (name) {
    const path = await promised(this.iface, 'LoadUnit')(name)
    const unit = new Unit(name, path)
    await unit.init()
    return unit
  }
}

class Unit extends Iface {
  constructor (name, path) {
    super('Unit', path)
    this.name = name
  }

  async exists () {
    const { LoadState } = await this.props()
    return LoadState !== 'not-found'
  }
}

exports.init = init
async function init () {
  if (exports.systemd) {
    return exports.systemd
  }

  const systemd = new Systemd()
  await systemd.init()
  exports.systemd = systemd
  return systemd
}
