import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { ok } from '../http.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024, files: 9 } }); // 单文件≤20MB，最多9个

export const uploadRouter = Router();

// 多文件上传 → 返回元数据；原始文件名经 latin1→utf8 修正中文
uploadRouter.post('/upload', upload.array('files', 9), (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const data = files.map((f) => ({
    name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    url: `/uploads/${f.filename}`,
    mime: f.mimetype,
    size: f.size,
  }));
  ok(res, data);
});
