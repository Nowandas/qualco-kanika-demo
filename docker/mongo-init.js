const appDatabase = process.env.MONGO_APP_DATABASE || process.env.MONGO_INITDB_DATABASE;
const appUsername = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appDatabase || !appUsername || !appPassword) {
  throw new Error("Missing MONGO_APP_DATABASE, MONGO_APP_USERNAME, or MONGO_APP_PASSWORD");
}

const appDb = db.getSiblingDB(appDatabase);
const existingUser = appDb.getUser(appUsername);

if (!existingUser) {
  appDb.createUser({
    user: appUsername,
    pwd: appPassword,
    roles: [{ role: "readWrite", db: appDatabase }],
  });
  print(`Created MongoDB application user '${appUsername}' for database '${appDatabase}'.`);
} else {
  print(`MongoDB application user '${appUsername}' already exists. Skipping creation.`);
}
