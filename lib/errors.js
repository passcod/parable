class DeployFail extends Error {
  constructor (deploy, reason, err = null) {
    super(`Deploy ${deploy.name} failed: ${reason}`)
    this.deploy = deploy
    this.reason = reason
    if (err instanceof Error) {
      this.stack = err.stack
    }
  }
}

exports.DeployFail = DeployFail
