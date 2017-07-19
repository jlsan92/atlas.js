// We use for-await pattern quite extensively here for legitimate purposes
/* eslint-disable no-await-in-loop */

import path from 'path'
import pino from 'pino'
import _ from 'lodash'
import hidden from 'local-scope/create'
import { FrameworkError } from '@strv/errors'

class Application {
  static defaults = {
    log: {
      name: path.basename(process.cwd()),
      level: 'info',
      serializers: pino.stdSerializers,
    },
  }


  get prepared() {
    return this::hidden().prepared
  }

  get started() {
    return this::hidden().started
  }

  config = {}

  services = {}

  /**
   * Create a new application
   *
   * @param     {Object}    options             Options for the app
   * @param     {Object}    options.config      Configuration object for the app and for all
   *                                            services or other components which will be added to
   *                                            the app
   */
  constructor(options = {}) {
    // Initialise private stuff
    this::hidden().prepared = false
    this::hidden().started = false
    this::hidden().catalog = {
      services: new Map(),
      hooks: new Map(),
    }

    this.config = mkdefaults(options.config, {
      application: {},
      services: {},
      hooks: {},
    })
    this.config.application = mkdefaults(this.config.application, Application.defaults)
    this.log = pino(this.config.application.log)
  }

  /**
   * Register a service into this app at given alias
   *
   * @param     {String}    alias     The alias for the service - it will be used for exposing the
   *                                  service's API on the app.services object and for passing
   *                                  configuration data to it
   * @param     {class}    Service    The service class
   * @return    {this}
   */
  service(alias, Service) {
    const { services } = this::hidden().catalog

    // Safety checks first
    if (services.has(alias)) {
      throw new FrameworkError(`Service with alias ${alias} already used`)
    }

    if (typeof Service !== 'function') {
      throw new FrameworkError(`Service must be a class, got ${typeof Service}`)
    }

    this.config.services[alias] = mkdefaults(this.config.services[alias], Service.defaults)
    services.set(alias, new Service({
      app: this,
      log: this.log.child({ service: alias }),
    }))

    this.log.debug({ service: alias }, 'service:add')

    return this
  }

  hook(alias, Hook) {
    const { hooks } = this::hidden().catalog

    // Safety checks first
    if (hooks.has(alias)) {
      throw new FrameworkError(`Hook with alias ${alias} already used`)
    }

    if (typeof Hook !== 'function') {
      throw new FrameworkError(`Hook must be a class, got ${typeof Hook}`)
    }

    this.config.hooks[alias] = mkdefaults(this.config.hooks[alias], Hook.defaults)
    hooks.set(alias, new Hook({
      app: this,
      log: this.log.child({ hook: alias }),
    }))

    this.log.debug({ hook: alias }, 'hook:add')

    return this
  }

  /**
   * Prepare all services and hooks for use
   *
   * @return    {Promise<this>}
   */
  async prepare() {
    if (this.prepared) {
      return this
    }

    const { services, hooks } = this::hidden().catalog

    // Prepare hooks (in parallel)
    // Hooks must not depend on each other since they can only react to events and we are not
    // emitting any yet
    this.log.debug('hooks:prepare:start')
    await Promise.all(Array.from(hooks.entries()).map(([alias, hook]) => {
      const config = this.config.hooks[alias]
      return hook.prepare({ config })
    }))
    this.log.debug('hooks:prepare:end')

    // Prepare services
    // @TODO (services): Refactor to make service initialisation parallel
    // Services can be initialised in parallel, but the hooks for each service must be called in
    // order, so some form of promise grouping will be necessary
    for (const [alias, service] of services.entries()) {
      this.log.debug({ service: alias }, 'service:prepare:before')
      await this::dispatch('service:prepare:before')
      await this::dispatch(`${alias}:prepare:before`)
      const config = this.config.services[alias]
      const instance = await service.prepare({ config })
      this::expose('services', alias, instance)
      await this::dispatch('service:prepare:after')
      await this::dispatch(`${alias}:prepare:after`)
      this.log.debug({ service: alias }, 'service:prepare:after')
    }

    this::hidden().prepared = true

    return this
  }

  /**
   * Start all services
   *
   * @return    {Promise<this>}
   */
  async start() {
    if (this.started) {
      return this
    }

    await this.prepare()
    await this::dispatch('application:start:before')

    const { services } = this::hidden().catalog

    for (const [alias, service] of services.entries()) {
      this.log.debug({ service: alias }, 'service:start:before')
      await this::dispatch('service:start:before')
      await this::dispatch(`${alias}:start:before`)
      await service.start()
      await this::dispatch('service:start:after')
      await this::dispatch(`${alias}:start:after`)
      this.log.debug({ service: alias }, 'service:start:after')
    }

    this::hidden().started = true
    await this::dispatch('application:start:after')
    this.log.info('app:ready')

    return this
  }

  /**
   * Stop all services and unregister their getters
   *
   * @return    {Promise<this>}
   */
  async stop() {
    if (!this.started) {
      return this
    }

    const { services } = this::hidden().catalog

    for (const [alias, service] of services.entries()) {
      delete this.services[alias]
      await service.stop()
    }

    this::hidden().started = false
    this::hidden().prepared = false

    return this
  }
}

function mkdefaults(config = {}, defaults = {}) {
  return _.defaultsDeep(config, defaults)
}

function expose(collection, property, returns) {
  Object.defineProperty(this[collection], property, {
    enumerable: true,
    configurable: true,
    get: () => returns,
  })
}

function dispatch(event) {
  const { hooks } = this::hidden().catalog

  for (const [alias, hook] of hooks.entries()) {
    if (!(event in hook)) {
      continue
    }

    this.log.debug({ hook: alias, event }, 'event:dispatch')
    hook[event]()
  }
}

export default Application