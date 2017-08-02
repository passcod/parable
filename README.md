# Parable

_A Systemd-based deploy tool controlled via CouchDB documents._

## The Idea

You describe one or more deployments using documents in a Couch database:

```json
{
  "app": "via-appia",
  "phase": "production",
  "repo": {
    "url": "git@github.com:storily/via-appia.git",
    "rev": "v1.0.0"
  },
  "env": {
    "hoodie_data": "$PERSISTENT/hoodie",
    "hoodie_dbUrl": "user:password@127.0.0.1:5984",
    "hoodie_port": "$PORT",
    "hoodie_url": "https://api.cogitare.nz",
    "hoodie_adminPassword": "adminpassword"
  },
  "scale": 1,
  "traffic": {
    "http": "api.cogitare.nz"
  }
}
```

### It watches and acts when needed

Parable watches the deploy documents and a socket/webhook. It fetches all
deploy documents, the Systemd state, the repositories, and the Nginx config,
and figures out if any change is needed. If so, it writes new configuration and
updates the services. Otherwise, it does nothing.

### It behaves predictably and lightly

Parable doesn't do anything beyond setting up services and Nginx configuration.
Notably, it doesn't do HTTP routing or process monitoring. It leaves that to
standard system components. Because of that, you can still interact with the
services just like you would without Parable, with `journalctl` and `systemctl`
and by browsing `/etc/nginx`. It also only affects a small part of the system
in a predictable manner, so you can continue managing other parts manually.

### It is naturally generic

Parable communicates with Systemd using the D-Bus API, and with Nginx by
writing files to `/etc/nginx/parable.d/` and reloading by using the Systemd
`reload` action on the `nginx.service`. That way, it works (in theory) with all
distributions that use Systemd, without any reliance on that being Debian,
Centos, or whatnot.

### It was written for Cogitare

Parable was written to manage Cogitare's services. I needed a lightweight
solution that didn't reinvent the wheel and could be configured easily either
manually or programmatically, while still supporting “smart” features like HTTP
hooks (to deploy from Git pushes) and responding to changes in configuration. I
also didn't want to use Docker.

### It is built to live with Systemd

Parable detects when it is run with Systemd, and logs to Journald using
structured logging automatically. Otherwise, it logs to STDOUT in JSON. It
expects a Systemd-managed socket for its HTTP hook. Instead of trying to work
around Systemd and reimplement what it already does well, we embrace it.
