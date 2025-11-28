const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Сохраняем оригинальное имя файла
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB лимит
  }
});

// Хранилище информации о файлах
const FILES_DB_PATH = path.join(__dirname, 'files.json');

function readFiles() {
  try {
    if (fs.existsSync(FILES_DB_PATH)) {
      return JSON.parse(fs.readFileSync(FILES_DB_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading files database:', error);
  }
  return [];
}

function writeFiles(files) {
  try {
    fs.writeFileSync(FILES_DB_PATH, JSON.stringify(files, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing files database:', error);
    return false;
  }
}

// Маршруты API
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Сервер файлообменника работает',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/files', (req, res) => {
  const files = readFiles();
  res.json(files);
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не был загружен' });
    }

    const user = JSON.parse(req.body.user);
    
    const fileInfo = {
      id: Date.now().toString(),
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      uploadDate: new Date().toLocaleString('ru-RU'),
      author: user.name,
      authorId: user.id,
      authorColor: user.color,
      filename: req.file.filename,
      path: req.file.path
    };
    
    const files = readFiles();
    files.push(fileInfo);
    
    if (writeFiles(files)) {
      res.json(fileInfo);
    } else {
      res.status(500).json({ error: 'Ошибка сохранения информации о файле' });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
});

app.get('/api/download/:id', (req, res) => {
  const files = readFiles();
  const file = files.find(f => f.id === req.params.id);
  
  if (!file) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  
  const filePath = path.join(__dirname, 'uploads', file.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден на сервере' });
  }
  
  res.download(filePath, file.name);
});

app.delete('/api/files/:id', (req, res) => {
  try {
    const { userId } = req.body;
    const files = readFiles();
    const fileIndex = files.findIndex(f => f.id === req.params.id);
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    const file = files[fileIndex];
    
    // Проверяем, что пользователь удаляет свой файл
    if (file.authorId !== userId) {
      return res.status(403).json({ error: 'Нельзя удалить чужой файл' });
    }
    
    // Удаляем физический файл
    const filePath = path.join(__dirname, 'uploads', file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Удаляем информацию о файле
    files.splice(fileIndex, 1);
    
    if (writeFiles(files)) {
      res.json({ message: 'Файл удален' });
    } else {
      res.status(500).json({ error: 'Ошибка при удалении файла' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Ошибка при удалении файла' });
  }
});

// Статическая страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой' });
    }
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер файлообменника запущен на порту ${PORT}`);
  console.log(`Доступен по адресу: http://localhost:${PORT}`);
});