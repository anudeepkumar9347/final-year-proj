import jwt from 'jsonwebtoken'; import {config} from './config.js';
export function auth(req,res,next){const token=req.headers.authorization?.replace(/^Bearer /,''); if(!token)return res.status(401).json({error:'Authentication required'}); try{req.user=jwt.verify(token,config.secret); next();}catch{return res.status(401).json({error:'Invalid or expired token'});}}
export function errors(err,req,res,next){console.error(JSON.stringify({event:'error',path:req.path,message:err.message})); res.status(err.status||500).json({error:err.message||'Internal server error'});}
