const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Разрешаем доступ к серверу с любых адресов (например, с GitHub Pages)

const server = http.createServer(app);
// Настраиваем Socket.io для работы в реальном времени
const io = new Server(server, {
    cors: {
        origin: "*", // Позволяет фронтенду подключаться без ошибок безопасности
        methods: ["GET", "POST"]
    }
});

// Массив, где мы будем хранить активные заказы, пока их не примет водитель
let activeOrders = [];

console.log("🚕 Сервер БАЦ Такси запускается...");

io.on('connection', (socket) => {
    console.log(`🟢 Кто-то подключился: ${socket.id}`);

    // Когда пассажир делает новый заказ
    socket.on('create_order', (orderData) => {
        const newOrder = {
            id: Date.now(), // Уникальный ID заказа на основе времени
            passengerId: socket.id,
            from: orderData.from,
            to: orderData.to,
            distance: orderData.distance,
            status: 'searching'
        };

        activeOrders.push(newOrder);
        console.log(`📦 Новый заказ #${newOrder.id} от пассажира!`);

        // Мгновенно рассылаем этот заказ ВСЕМ водителям, которые сейчас в сети
        io.emit('order_list_update', activeOrders);
    });

    // Когда водитель заходит в сеть, сразу отправляем ему список текущих заказов
    socket.on('driver_ready', () => {
        socket.emit('order_list_update', activeOrders);
    });

    // Когда водитель нажимает кнопку "Принять заказ"
    socket.on('accept_order', (data) => {
        const orderIndex = activeOrders.findIndex(o => o.id === data.orderId);
        
        if (orderIndex !== -1) {
            const acceptedOrder = activeOrders[orderIndex];
            acceptedOrder.status = 'accepted';
            acceptedOrder.driverId = socket.id;

            console.log(`✅ Водитель принял заказ #${data.orderId}`);

            // Сообщаем конкретному пассажиру, что к нему едут
            io.to(acceptedOrder.passengerId).emit('order_accepted_by_driver', {
                driverId: socket.id
            });

            // Удаляем заказ из списка свободных и обновляем радар у остальных водителей
            activeOrders.splice(orderIndex, 1);
            io.emit('order_list_update', activeOrders);
        }
    });

    // Когда кто-то закрывает приложение
    socket.on('disconnect', () => {
        console.log(`🔴 Отключение: ${socket.id}`);
    });
});

// Простой проверочный маршрут, чтобы знать, что сервер жив
app.get('/', (req, res) => {
    res.send('Робот БАЦ Такси работает 24/7!');
});

// Запускаем сервер на порту 3000 (локально) или на порту, который даст бесплатный хостинг
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер БАЦ запущен на порту ${PORT}`);
});