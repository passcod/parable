const { DeployFail } = require('./errors')
const fs = require('fs')
const git = require('simple-git/promise')
const ini = require('ini')
const log = require('./logger')
const path = require('path')
const { promisify } = require('util')

const readFile = promisify(fs.readFile)

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

  async loadService () {
    log.info(`Loading ${this.serviceFile}`)
    try {
      const source = await readFile(this.serviceFile)
      log.trace(`Parsing ${this.serviceFile}`)
      this.service = ini.decode(source)
    } catch (err) {
      log.warn(`No service file for ${this.name}`)
      log.warn(err.stack)
      this.service = null
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
      this.nginx = null
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
      this.git = null
    }
  }

  async load () {
    await this.loadService()
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
}

module.exports = Deploy
