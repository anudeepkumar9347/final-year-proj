import {app} from './app.js';import {connect} from './db.js';import {config} from './config.js';
connect().then(()=>app.listen(config.port,()=>console.info(JSON.stringify({event:'started',port:config.port})))).catch(e=>{console.error(e);process.exit(1)});
