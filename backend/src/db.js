import pg from 'pg'; import {createClient} from 'redis'; import {config} from './config.js';
export const pool=new pg.Pool({connectionString:config.db});
export let redis=null;
export async function connect(){await pool.query('SELECT 1'); try{redis=createClient({url:config.redis}); redis.on('error',()=>{}); await redis.connect();}catch{redis=null; console.warn('Redis unavailable; using PostgreSQL chunk lookup');}}
export const query=(...args)=>pool.query(...args);
