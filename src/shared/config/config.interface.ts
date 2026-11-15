export type AppConfig = {
  PORT: number;
  DB_HOST: string;
  DB_URI: string;
  SALT: string;
};

export interface Config {
  init(): void;
  get<T extends keyof AppConfig>(key: T): AppConfig[T];
}
