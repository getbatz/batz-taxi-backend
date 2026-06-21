const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Создаем папку для хранения картинок профиля, если её нет
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Настройка сохранения файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, 'avatar-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Файлы локальной базы данных
const USERS_FILE = path.join(__dirname, 'local_users.json');
const ORDERS_FILE = path.join(__dirname, 'local_orders.json');
const CARS_FILE = path.join(__dirname, 'cars.json');

// Инициализация пустых файлов, если они отсутствуют
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

const readJSON = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJSON = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

// --- МАРШРУТЫ ПРИЛОЖЕНИЯ ---

// 1. Получение автомобилей и цветов
app.get('/api/cars-data', (req, res) => {
    if (fs.existsSync(CARS_FILE)) {
        res.json(readJSON(CARS_FILE));
    } else {
        res.json({ brands: [], colors: [] });
    }
});

// 2. Регистрация нового пользователя
app.post('/api/register', (req, res) => {
    const { name, phone, dob, pin, role } = req.body;
    const users = readJSON(USERS_FILE);

    if (users.find(u => u.phone === phone)) {
        return res.json({ success: false, message: 'Этот номер телефона уже зарегистрирован!' });
    }

    const newUser = {
        name,
        phone,
        dob,
        pin,
        role: role || 'passenger',
        avatar: '',
        bonuses: 200 // Приветственные бонусы в подарок
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);
    res.json({ success: true, user: newUser });
});

// 3. Авторизация по PIN-коду
app.post('/api/login-pin', (req, res) => {
    const { phone, pin } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.phone === phone && u.pin === pin);

    if (user) {
        res.json({ success: true, user });
    } else {
        res.json({ success: false, message: 'Неверный PIN-код быстрого входа!' });
    }
});

// 4. Загрузка аватарки пользователя
app.post('/api/user/upload-avatar', upload.single('avatar'), (req, res) => {
    const { phone } = req.body;
    if (!req.file) return res.json({ success: false, message: 'Файл картинки не получен' });

    const users = readJSON(USERS_FILE);
    const userIndex = users.findIndex(u => u.phone === phone);

    if (userIndex !== -1) {
        users[userIndex].avatar = '/uploads/' + req.file.filename;
        writeJSON(USERS_FILE, users);
        res.json({ success: true, avatarUrl: users[userIndex].avatar });
    } else {
        res.json({ success: false, message: 'Пользователь не найден' });
    }
});

// 5. Создание поездки (Имитация для проверки работы)
app.post('/api/orders/create', (req, res) => {
    const { passengerPhone, from, to, price, paymentMethod } = req.body;
    const orders = readJSON(ORDERS_FILE);

    const newOrder = {
        id: orders.length + 1,
        passengerPhone,
        from,
        to,
        price: Number(price) || 1000,
        paymentMethod,
        createdAt: new Date().toISOString()
    };

    orders.push(newOrder);
    writeJSON(ORDERS_FILE, orders);
    res.json({ success: true, order: newOrder });
});

// 6. АДМИНКА: Проверка входа администратора
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'Batz2026') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Доступ заблокирован: неверные данные!' });
    }
});

// 7. АДМИНКА: Расчет сводки (День, Неделя, Месяц) без внешних СУБД
app.get('/api/admin/stats', (req, res) => {
    const orders = readJSON(ORDERS_FILE);
    const now = new Date();

    const getStatsForDays = (days) => {
        const msLimit = days * 24 * 60 * 60 * 1000;
        const filtered = orders.filter(o => (now - new Date(o.createdAt)) <= msLimit);
        return {
            count: filtered.length,
            revenue: filtered.reduce((sum, o) => sum + o.price, 0)
        };
    };

    res.json({
        day: getStatsForDays(1),
        week: getStatsForDays(7),
        month: getStatsForDays(30)
    });
});

// Главная страница приложения
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[Batz Taxi Server] Запущен на http://localhost:${PORT}`);
});
