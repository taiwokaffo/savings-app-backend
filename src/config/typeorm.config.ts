import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Admin@123',
  database: process.env.DB_NAME || 'savings_app',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
};

// Used by AppModule at runtime, and as the default export the `typeorm` CLI
// needs for migration:generate / migration:run (-d src/config/typeorm.config.ts).
const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
