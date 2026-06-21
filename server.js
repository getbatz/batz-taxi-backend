const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let activeOrders = [];

io.on('connection', (socket) => {
    
    socket.on('create_order', (orderData) => {
        const newOrder = {
            id: Date.now(),
            passengerId: socket.id,
            from: orderData.from,
            to: orderData.to,
            fromText: orderData.fromText,
            toText: orderData.toText,
            distance: orderData.distance,
            tariff: orderData.tariff,
            price: orderData.price,
            status: 'searching'
        };
        activeOrders.push(newOrder);
        io.emit('order_list_update', activeOrders);
    });

    socket.on('driver_ready', () => {
        socket.emit('order_list_update', activeOrders);
    });

    socket.on('accept_order', (data) => {
        const order = activeOrders.find(o => o.id === data.orderId);
        if (order) {
            order.status = 'accepted';
            order.driverId = socket.id;
            io.to(order.passengerId).emit('order_status_changed', { status: 'accepted' });
            
            // Удаляем заказ из открытого списка радара
            activeOrders = activeOrders.filter(o => o.id !== data.orderId);
            io.emit('order_list_update', activeOrders);
        }
    });

    // Изменение стадий поездки (Я на месте -> Поехали -> Финиш)
    socket.on('update_status', (data) => {
        // Ищем заказ по ID (так как из activeOrders он удален, храним логику отправки пассажиру напрямую)
        // Для простоты шлем событие всем, клиент сам отфильтрует по своей роли
        io.emit('order_status_changed', { orderId: data.orderId, status: data.status });
    });

    socket.on('disconnect', () => {});
});

app.get('/', (req, res) => { res.send('Робот BATZ Такси работает 24/7!'); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 Сервер на порту ${PORT}`); });
