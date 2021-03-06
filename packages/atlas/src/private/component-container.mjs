import hidden from 'local-scope/create'
import { FrameworkError } from '@atlas.js/errors'
import {
  defaultsDeep as defaults,
  difference,
} from 'lodash'

/**
 * This class holds and manages a component
 *
 * @private
 */
class ComponentContainer {
  /**
   * Create new container for a component
   *
   * @param     {Object}        info              Component information
   * @param     {String}        info.type         The component's type (service, hook, action)
   * @param     {String}        info.alias        The component's user-specified name/alias
   * @param     {Object}        info.aliases      Binding information from the user to locate other
   *                                              components
   * @param     {Class}         info.Component    The component class
   * @param     {Object}        info.config       The component's user-specified configuration
   * @param     {Atlas}         atlas             The Atlas instance
   */
  constructor(info, atlas) {
    this.type = info.type
    this.alias = info.alias
    this.aliases = info.aliases || {}
    this.Component = info.Component

    if (typeof this.Component !== 'function') {
      const type = typeof this.Component
      throw new FrameworkError(`Component ${this.type}:${this.alias} must be class, not ${type}`)
    }

    // Check if the component received all the aliases it requires
    const aliases = {
      provided: Object.keys(this.aliases),
      required: this.Component.requires || [],
    }
    const missing = difference(aliases.required, aliases.provided)
    const extra = difference(aliases.provided, aliases.required)

    if (missing.length) {
      throw new FrameworkError(`Missing aliases for component ${this.alias}: ${missing.join(', ')}`)
    }

    if (extra.length) {
      throw new FrameworkError(`Unneeded aliases for component ${this.alias}: ${extra.join(', ')}`)
    }

    this.component = new this.Component({
      atlas,
      log: atlas.log.child({ [this.type]: this.alias }),
      config: defaults(info.config, this.Component.defaults),
      component: resolve,
    })

    // Save the aliases for this component
    this.component::hidden().aliases = this.aliases
  }
}

function resolve(name) {
  const resolved = this::hidden().aliases[name]

  if (!resolved) {
    throw new FrameworkError(`Alias for ${name} not defined`)
  }

  const [type] = name.split(':')
  // Use a plural form of the component type, ie., action -> actions, service -> services etc.
  const component = this.atlas[`${type}s`][resolved]

  if (!component) {
    throw new FrameworkError(`Unable to find ${type} ${resolved} aliased as ${name}`)
  }

  return component
}

export default ComponentContainer
