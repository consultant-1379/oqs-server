// Get dependencies
var http = require('http'),
  bodyParser = require('body-parser'),
  checkenv = require('checkenv'),
  express = require('express'),
  lusca = require('lusca'),
  session = require('express-session'),
  passport = require('passport'),
  MongoStore = require('connect-mongo')(session),
  config = require('./config/config'),
  envJson = require('./config/lib/env.json'),
  ldap = require('./config/lib/ldap'),
  logger = require('./config/lib/logger'),
  coreRoutes = require('./modules/core/routes/core.routes'),
  queueRoutes = require('./modules/core/routes/queues.routes'),
  deploymentRoutes = require('./modules/deployments/routes/deployments.routes'),
  podRoutes = require('./modules/pods/routes/pods.routes'),
  historyRoutes = require('./modules/history/routes/history.routes'),
  authRoutes = require('./modules/users/routes/auth.routes'),
  userRoutes = require('./modules/users/routes/user.routes'),
  configurationRoutes = require('./modules/configurations/routes/configurations.routes'),
  mongoose = require('./config/lib/mongoose'),
  policy = require('./config/lib/policy'),
  app = express();

// database connection setup
mongoose.connect(config.dbMean);

checkenv.setConfig(envJson);
checkenv.check();

// Parsers for POST data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: false
}));

// Cross Origin middleware
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});

// Express MongoDB session storage
app.use(session({
  saveUninitialized: false,
  resave: false,
  secret: config.sessionSecret,
  cookie: {
    maxAge: config.sessionCookie.maxAge,
    httpOnly: config.sessionCookie.httpOnly,
    secure: config.sessionCookie.secure && config.secure.ssl
  },
  name: config.sessionKey,
  store: new MongoStore({
    url: config.dbMean.uri,
    collection: config.sessionCollection
  })
}));
ldap.addPassportStrategies();
app.use(passport.initialize());
app.use(passport.session());
app.use(ldap.signInFromBasicAuthentication());

// Add Lusca CSRF Middleware
app.use(lusca(config.csrf));

// Set our api routes
app.use('/core', coreRoutes);
app.use('/queues', queueRoutes);
app.use('/deployments', deploymentRoutes);
app.use('/pods', podRoutes);
app.use('/logs', historyRoutes);
app.use('/auth', authRoutes);
app.use('/configurations', configurationRoutes);
app.use('/users', userRoutes);
/**
 * Get port from environment and store in Express.
 */
var port = process.env.PORT || '3000';
app.set('port', port);
policy.invokeRolesPolicies();
/**
 * Create HTTP server.
 */
var server = http.createServer(app);
/**
 * Listen on provided port, on all network interfaces if the port is not already allocated.
 */
if (!module.parent) {
  server.listen(port, function () {
    logger.info(`API running on localhost: ${port}`);
  });
}

module.exports = server;
