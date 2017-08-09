const { DeployFail } = require('./errors')
const fs = require('fs')
const git = require('simple-git/promise')
const ini = require('ini')
const log = require('./logger')
const path = require('path')
const { promisify } = require('util')
const systemd = require('./systemd')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

class Deploy {
  constructor (data) {
    delete data._id
    delete data._rev

    // Defaults
    data.repo = Object.assign({ ref: 'master' }, data.repo)
    data = Object.assign({
      env: {},
      scale: 1,
      traffic: {}
    }, data)

    Object.assign(this, data)

    if (!this.app || `${this.app}`.trim().length < 1) {
      throw new DeployFail('Missing .app property')
    }

    if (!this.phase) {
      this.phase = 'production'
    }

    if (!this.env) {
      this.env = {}
    }

    if (!this.env.NODE_ENV) {
      this.env.NODE_ENV = this.phase
    }

    this.service = {}
    this.systemd = systemd.systemd
  }

  get name () {
    return `${this.app}:${this.phase}`
  }

  get serviceName () {
    return `${this.name}.service`
  }

  get serviceFile () {
    return path.join('/etc/systemd/system', this.serviceName)
  }

  async loadServiceFile () {
    log.info(`Loading ${this.serviceFile}`)
    try {
      const source = await readFile(this.serviceFile)
      log.trace(`Parsing ${this.serviceFile}`)
      this.service.file = ini.decode(source)
    } catch (err) {
      log.warn(`No service file for ${this.name}`)
      log.warn(err.stack)
    }
  }

  async loadServiceUnit () {
    log.info(`Loading ${this.serviceName} unit`)
    try {
      const unit = await this.systemd.unit(this.serviceName)
      if (await unit.exists()) {
        this.service.unit = unit
      } else {
        log.warn(`No service unit for ${this.name}`)
      }
    } catch (err) {
      log.warn(`Could not load service unit for ${this.name}`)
      log.warn(err.stack)
    }
  }

  get nginxFile () {
    return path.join('/etc/nginx/palabre.d/', `${this.name}.conf`)
  }

  async loadNginx () {
    log.info(`Loading ${this.nginxFile}`)
    try {
      const source = await readFile(this.nginxFile)
      log.trace(`Parsing ${this.nginxFile}`)
      this.nginx = await promisify(nginx.createFromSource)(source)
    } catch (err) {
      log.warn(`No nginx config for ${this.name}`)
      log.warn(err.stack)
    }
  }

  get appPath () {
    return path.join('/opt/parable/apps/', this.app, this.phase)
  }

  async loadGit () {
    log.info(`Loading ${this.appPath}`)
    const repo = path.join(this.appPath, '.git')

    try {
      await promisify(fs.access)(repo)
      log.trace('This looks like a git repo, let’s load it', this.appPath)
      this.git = git(this.appPath)
      this.repo.HEAD = (await this.git.revparse(['HEAD'])).trim()
      log.debug(`HEAD revision for ${this.appPath}: ${this.HEAD}`)
    } catch (err) {
      log.warn(`No git repo for ${this.name}`)
      log.warn(err.stack)
    }
  }

  async load () {
    await this.loadServiceFile()
    await this.loadServiceUnit()
    await this.loadNginx()
    await this.loadGit()
  }

  async applyGit ({ noRetry } = {}) {
    if (!this.git) {
      log.info(`Cloning repo for the first time for ${this.name}`)
      try {
        await git().clone(this.repo.url, this.appPath)
      } catch (err) {
        log.error(`Error cloning ${this.name}`, { err })
      }

      await this.loadGit()
    }

    if (!this.git) {
      throw new DeployFail(this, 'Failed to get a good repo')
    }

    log.debug(`Querying ref for '${this.repo.ref}' on remote`)
    this.repo.remote = (await this.git.listRemote(['origin', this.repo.ref]))
      .trim().split(/\s+/)[0]
    log.debug(`Remote ref for '${this.repo.ref}': ${this.repo.remote}`)

    if (this.repo.HEAD === this.repo.remote) {
      log.info(`Repo is up to date for ${this.name}`)
    } else if (!noRetry) {
      log.info(`Repo is out of date for ${this.name}, updating`)

      try {
        await this.git.fetch('origin', this.repo.remote)
        await this.git.reset('hard')
        await this.git.checkout(this.repo.remote)
      } catch (err) {
        throw new DeployFail(this, 'Failed to fetch repo update', err)
      }

      await this.applyGit({ noRetry: true })
    } else {
      throw new DeployFail(this, 'Failed to get a good updated repo')
    }
  }

  async applyService ({ noRetry } = {}) {
    let s = this.service.file
    if (!s) {
      s = {
        Unit: {},
        Service: {},
        Install: {}
      }
    }

    if (!s.Unit.Description) {
      s.Unit.Description = `Parable service for ${this.name}`
    }

    if (!s.Service.ExecStart) {
      s.Service.ExecStart = '/usr/bin/env npm start'
    }

    if (!s.Install.WantedBy) {
      s.Install.WantedBy = 'multi-user.target'
    }

    s.Service.Environment = Object.entries(this.env).map(([k, v]) => `"${k}=${v}"`).join(' ')
    this.service.file = s

    try {
      await writeFile(this.serviceFile, ini.encode(this.service.file))
    } catch (err) {
      throw new DeployFail(this, 'Failed to write service file', err)
    }
  }

  async apply () {
    await this.applyGit()
    await this.applyService()
  }
}

module.exports = Deploy
