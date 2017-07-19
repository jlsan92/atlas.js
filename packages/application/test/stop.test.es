import Application from '..'

class DummyService {
  prepare() {}
  start() {}
  stop() {}
}

describe('Application::stop()', () => {
  let app
  let options

  beforeEach(() => {
    options = {
      config: {
        application: {
          log: {
            level: 'warn',
          },
        },
        services: {
          dummy: {
            test: true,
          },
        },
        hooks: {
          dummy: {
            test: true,
          },
        },
      },
    }
    app = new Application(options)
    app.service('dummy', DummyService)

    return app.start()
  })


  it('is async', () => {
    expect(app.stop()).to.be.instanceof(Promise)
  })

  it('returns this', async () => {
    expect(await app.stop()).to.equal(app)
  })

  it('sets app.started and app.prepared to false', async () => {
    expect(app.started).to.equal(true)
    expect(app.prepared).to.equal(true)
    await app.stop()
    expect(app.started).to.equal(false)
    expect(app.prepared).to.equal(false)
  })


  describe('Service interactions', () => {
    beforeEach(function() {
      this.sb.each.stub(DummyService.prototype, 'stop').resolves()
    })


    it('calls stop on the service', async () => {
      await app.stop()
      expect(DummyService.prototype.stop).to.have.callCount(1)
    })

    it('calls the method only once for each service for multiple .stop() calls', async () => {
      await app.stop()
      await app.stop()

      expect(DummyService.prototype.stop).to.have.callCount(1)
    })

    it('removes getters for services', async () => {
      expect(app.services).to.have.property('dummy')
      await app.stop()
      expect(app.services).to.not.have.property('dummy')
    })
  })
})