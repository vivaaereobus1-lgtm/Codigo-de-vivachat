import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(); const server=http.createServer(app); const io=new Server(server);
const PORT=process.env.PORT||3000; const SECRET=process.env.JWT_SECRET||'CHANGE_ME_VIVACHAT_SECRET';
const db=new Database(path.join(__dirname,'vivachat.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,avatar TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id INTEGER NOT NULL,receiver_id INTEGER NOT NULL,text TEXT DEFAULT '',file_url TEXT DEFAULT '',file_name TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contacts(user_id INTEGER NOT NULL,contact_id INTEGER NOT NULL,UNIQUE(user_id,contact_id));`);
const uploadDir=path.join(__dirname,'public/uploads'); fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({dest:uploadDir,limits:{fileSize:15*1024*1024}});
app.use(express.json()); app.use(express.static(path.join(__dirname,'public')));
function tokenFor(u){return jwt.sign({id:u.id,name:u.name,username:u.username},SECRET,{expiresIn:'30d'});}
function auth(req,res,next){try{const h=req.headers.authorization||''; req.user=jwt.verify(h.replace('Bearer ',''),SECRET);next();}catch{return res.status(401).json({error:'Sesión inválida'});}}
app.post('/api/register',async(req,res)=>{const {name,username,password}=req.body||{}; if(!name||!username||!password||password.length<6)return res.status(400).json({error:'Completa nombre, usuario y contraseña (mínimo 6 caracteres).'}); try{const hash=await bcrypt.hash(password,10); const r=db.prepare('INSERT INTO users(name,username,password) VALUES(?,?,?)').run(name.trim(),username.trim().toLowerCase(),hash); const u=db.prepare('SELECT id,name,username,avatar FROM users WHERE id=?').get(r.lastInsertRowid); res.json({token:tokenFor(u),user:u});}catch(e){res.status(400).json({error:'Ese usuario ya existe.'});}});
app.post('/api/login',async(req,res)=>{const {username,password}=req.body||{}; const u=db.prepare('SELECT * FROM users WHERE username=?').get((username||'').trim().toLowerCase()); if(!u||!(await bcrypt.compare(password||'',u.password)))return res.status(401).json({error:'Usuario o contraseña incorrectos.'}); res.json({token:tokenFor(u),user:{id:u.id,name:u.name,username:u.username,avatar:u.avatar}});});
app.get('/api/me',auth,(req,res)=>{res.json(db.prepare('SELECT id,name,username,avatar FROM users WHERE id=?').get(req.user.id));});
app.get('/api/users',auth,(req,res)=>{res.json(db.prepare('SELECT id,name,username,avatar FROM users WHERE id<>? ORDER BY name').all(req.user.id));});
app.get('/api/messages/:id',auth,(req,res)=>{const id=Number(req.params.id); const rows=db.prepare(`SELECT m.*,u.name sender_name,u.username sender_username FROM messages m JOIN users u ON u.id=m.sender_id WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY m.id ASC LIMIT 500`).all(req.user.id,id,id,req.user.id); res.json(rows);});
app.post('/api/upload',auth,upload.single('file'),(req,res)=>{if(!req.file)return res.status(400).json({error:'No se recibió archivo'}); const safe=req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'); const final=`${Date.now()}-${safe}`; fs.renameSync(req.file.path,path.join(uploadDir,final)); res.json({url:`/uploads/${final}`,name:req.file.originalname});});
app.post('/api/profile',auth,(req,res)=>{const {name}=req.body||{}; if(!name?.trim())return res.status(400).json({error:'Nombre requerido'}); db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(),req.user.id); res.json({ok:true});});
io.use((socket,next)=>{try{socket.user=jwt.verify(socket.handshake.auth?.token||'',SECRET);next();}catch{next(new Error('unauthorized'));}});
io.on('connection',socket=>{socket.join(`user:${socket.user.id}`); socket.on('send_message',({to,text='',file_url='',file_name=''})=>{const receiver=Number(to); if(!receiver||(!text.trim()&&!file_url))return; const r=db.prepare('INSERT INTO messages(sender_id,receiver_id,text,file_url,file_name) VALUES(?,?,?,?,?)').run(socket.user.id,receiver,text.trim(),file_url,file_name); const msg=db.prepare(`SELECT m.*,u.name sender_name,u.username sender_username FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(r.lastInsertRowid); io.to(`user:${receiver}`).emit('new_message',msg); io.to(`user:${socket.user.id}`).emit('message_sent',msg);});});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
server.listen(PORT,()=>console.log(`VivaChat listo en puerto ${PORT}`));
