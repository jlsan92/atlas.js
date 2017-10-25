# Why we created Atlas.js

@TODO: A story about a PM talking to dev guy about new project... then 1 week later the story repeats, the dev guy starts complaining about having to write the same boilerplate code over and over for each new project.

Working at a software development studio, this cycle tends to repeat quite frequently as new projects come. We soon realised that whenever we need to create a new backend API from scratch there is a lot of duplicate code to get it up and running. You need to set up your _package.json_, various dotfiles (_.eslintrc.js_, _.babelrc_, _.editorconfig_ etc.), give your files some structure, decide what technology stack you are going to use (what server library, what database, etc.) and you need to write some code to glue all the pieces together.

Well, it turns out that setting up _package.json_ and all the various dotfiles can be solved quite efficiently by using [Yeoman generators](http://yeoman.io), but no one's gonna decide the database and server type to use for this particular project. You have to make a choice.

After you have made your decision, you need to install the software and write quite a lot of code to get all the pieces working nicely together. Imagine a simple REST API server consisting of just [Koa.js](http://koajs.com) and [Mongoose](http://mongoosejs.com).

```js
import Koa from 'koa'
import mongoose from 'mongoose'
import * as schemas from './models'

for (const [name, schema] of Object.entries(schemas)) {
  mongoose.model(name, schema)
}

const app = new Koa()

app.use(async (ctx) => {
  // Let's pretend this to be something useful, like a route handler...
})

app.context.db = mongoose

async function start() {
  await mongoose.connect()
  // Start up other services, like redis
}

app.listen(process.env.PORT)

export {
  start,
}
```

Whoa, that's quite a lot of code to get an absolutely useless http server with an absolutely useless mongo connection up and running! If you ever wrote any backend code, you **know for a fact** that the actual code to get your app up on its feet is usually **much longer**.

So, it got us thinking - what can we do to reduce the amount of time needed to set all these things up?

We thought - **generators**! At first this seemed like a good idea, but we quickly discovered several drawbacks to this approach:

- Once you generate the code in your shiny new project, it is again your responsiblity to maintain it
- You reduce the time spent on setting the project up, but the code is part of your repository and the developer is responsible for fixing bugs or updating the code with new features, again causing duplicate work

Well, if not generators, we will use **a framework**! Something like [Sails.js](http://sailsjs.com) or [Nodal](http://www.nodaljs.com) or something similar!

But again, we started recognising issues with this approach, too:

- There is no single framework to fit all the use cases we might need for such a wide portfolio of projects - sometimes you need an SQL database, sometimes NoSQL and using abstractions like [Waterline](https://github.com/balderdashy/waterline) means you won't have access to the features which were the main decision-driving factor in favour of that database
- Replacing a single component of a framework with your own solution is not always easy, straightforward or even possible
- Our developers do not like being forced to use a particular code structure and using a specific framework generally tends to impose that to some degree

We concluded that we need to come up with something new to solve this problem.

## Meet Atlas.js

[Atlas.js](https://github.com/strvcom/atlas.js) is basically a state management container. You add some components to it and Atlas will initialise them, start them and, if necessary, stop them when appropriate. All you need to specify is configuration. It is not really a framework because it does not have the usual functionality a full-featured framework has and it only focuses on a very limited scope of problems:

- Managing the application's lifecycle (startup, shutdown)
- Keeping the initialisation code outside of your codebase

Let's look at how a very simple Atlas.js application looks like.

```js
import { Atlas } from '@atlas.js/atlas'
import { Service as Sequelize } from '@atlas.js/sequelize'
import { Service as Koa } from '@atlas.js/koa'

const atlas = new Atlas({
  root: __dirname,
  env: process.env.NODE_ENV,
  config: {
    services: {
      server: {
        listen: {
          port: 3000,
        },
      },
      database: {
        uri: 'postgres://postgres:postgres@127.0.0.1/postgres'
      },
    },
  },
})

// Add a component to Atlas.js under the name `database`
atlas.service('database', Sequelize)
atlas.service('server', Koa)

atlas.start()
  .then(() => console.log('Running!'))
  .catch(err => console.error(err))

export default atlas
```

Atlas.js will open a connection to the configured Postgres database and then it will start an http server on port 3000. For simple apps, this is very easy to accomplish with just a few lines of code, but if your app grows and now needs two or even three databases, some redis connection and two http servers you will face serious spaghetti code-level issues, not to mention the difficulties of stopping these services in the correct order (you **do** want to stop them in the correct order. What would happen if you close your database connection **before** you closed the http servers? 😱).
