const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, 
    },
  },
});

const connectPostgres = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connecté');
  } catch (error) {
    console.error('Erreur connexion PostgreSQL:', error);
  }
};

const syncDb = async () => {
  try {
    await sequelize.sync()
    console.log('Tables Sequelize synchronisées');
  } catch (error) {
    console.error('Erreur sync Sequelize:', error);
  }
};

module.exports = { sequelize, connectPostgres , syncDb};
