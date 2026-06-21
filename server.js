const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Оперативные базы данных в памяти (Бесплатно 24/7)
let users = {};       // { telegramId: { name, phone, role, history: [] } }
let drivers = {};     // { telegramId: { name, phone, carBrand, carModel, carColor, carNumber, kaspiPhone, kaspiName, preferredPayments: [], dailySummary: { ordersCount: 0, earnings: 0 } } }
let activeOrders = [];

// Границы Щербактинского района из ТЗ
const BOUNDING_BOX = { north: 53.5, south: 52.5, east: 78.5, west: 77.8 };

console.log("🚕 Сервер BATZ Такси v2.0 запускается...");

io.on('connection', (socket) => {
    
    // 1. Авторизация пользователя при старте приложения
    socket.on('auth_user', (data) => {
        const { telegramId, firstName, role } = data;
        socket.telegramId = telegramId;

        if (role === 'driver') {
            if (!drivers[telegramId]) {
                drivers[telegramId] = {
                    name: firstName, phone: '', carBrand: '', carModel: '', carColor: '', carNumber: '',
                    kaspiPhone: '', kaspiName: '', preferredPayments: ['cash'],
                    dailySummary: { ordersCount: 0, earnings: 0 }, history: []
                };
            }
            socket.emit('auth_success', { profile: drivers[telegramId], isRegistered: !!drivers[telegramId].phone });
        } else {
            if (!users[telegramId]) {
                users[telegramId] = { name: firstName, phone: '', history: [] };
            }
            socket.emit('auth_success', { profile: users[telegramId], isRegistered: !!users[telegramId].phone });
        }
    });

    // 2. Сохранение профиля (Личный Кабинет)
    socket.on('save_profile', (data) => {
        const { telegramId, role, profileData } = data;
        if (role === 'driver') {
            drivers[telegramId] = { ...drivers[telegramId], ...profileData };
            socket.emit('profile_updated', { profile: drivers[telegramId] });
        } else {
            users[telegramId] = { ...users[telegramId], ...profileData };
            socket.emit('profile_updated', { profile: users[telegramId] });
        }
    });

    // 3. Создание нового заказа пассажиром
    socket.on('create_order', (orderData) => {
        const { fromLat, fromLng, toLat, toLng } = orderData;

        // Проверка границ района
        const isFromValid = fromLat <= BOUNDING_BOX.north && fromLat >= BOUNDING_BOX.south && fromLng <= BOUNDING_BOX.east && fromLng >= BOUNDING_BOX.west;
        const isToValid = toLat <= BOUNDING_BOX.north && toLat >= BOUNDING_BOX.south && toLng <= BOUNDING_BOX.east && toLng >= BOUNDING_BOX.west;

        if (!isFromValid || !isToValid) {
            socket.emit('order_error', { message: "Упс... в данном регионе БАЦ пока недоступен" });
            return;
        }

        const newOrder = {
            id: Date.now(),
            passengerId: socket.id,
            passengerTgId: socket.telegramId,
            passengerName: users[socket.telegramId]?.name || "Пассажир",
            passengerPhone: users[socket.telegramId]?.phone || "",
            ...orderData,
            status: 'searching'
        };

        activeOrders.push(newOrder);
        // Отправляем обновленный список всем водителям в сети
        io.emit('order_list_update', activeOrders);
        socket.emit('order_created_success', { orderId: newOrder.id });
    });

    // Водитель запрашивает радар заказа
    socket.on('driver_ready', () => {
        socket.emit('order_list_update', activeOrders);
    });

    // 4. Водитель принимает заказ
    socket.on('accept_order', (data) => {
        const orderIndex = activeOrders.findIndex(o => o.id === data.orderId);
        const driverProfile = drivers[socket.telegramId];

        if (orderIndex !== -1 && driverProfile) {
            const order = activeOrders[orderIndex];
            order.status = 'accepted';
            order.driverId = socket.id;
            order.driverTgId = socket.telegramId;
            order.driverData = {
                name: driverProfile.name,
                phone: driverProfile.phone,
                car: `${driverProfile.carColor} ${driverProfile.carBrand} ${driverProfile.carModel}`,
                number: driverProfile.carNumber,
                kaspiPhone: driverProfile.kaspiPhone,
                kaspiName: driverProfile.kaspiName
            };

            // Уведомляем пассажира лично
            io.to(order.passengerId).emit('order_status_changed', { status: 'accepted', driverData: order.driverData });
            
            // Удаляем из общего радара
            activeOrders.splice(orderIndex, 1);
            io.emit('order_list_update', activeOrders);
        }
    });

    // Изменение стадий поездки (На месте -> В пути -> Финиш)
    socket.on('update_status', (data) => {
        const { passengerId, status, price, orderId, fromText, toText } = data;
        io.to(passengerId).emit('order_status_changed', { status });

        // Если поездка успешно завершена, пишем в историю и сводку дня
        if (status === 'finished') {
            const dTgId = socket.telegramId;
            if (drivers[dTgId]) {
                drivers[dTgId].dailySummary.ordersCount += 1;
                drivers[dTgId].dailySummary.earnings += Number(price);
                drivers[dTgId].history.push({ id: orderId, fromText, toText, price, date: new Date().toLocaleTimeString() });
            }
            const pTgId = users[socket.telegramId] ? socket.telegramId : null; 
            if (pTgId && users[pTgId]) {
                users[pTgId].history.push({ id: orderId, fromText, toText, price, date: new Date().toLocaleDateString() });
            }
        }
    });

    socket.on('disconnect', () => {});
});

app.get('/', (req, res) => { res.send('Робот BATZ v2.0 онлайн!'); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 Сервер BATZ запущен на порту ${PORT}`); });
