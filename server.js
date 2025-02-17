require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Datos de MercadoPago (usa tus credenciales)
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

// Simulación de base de datos en memoria
let transactions = {};

// Ruta para generar un pago y código QR
app.post("/create-payment", async (req, res) => {
    try {
        const { machine_id, items } = req.body;

        // Crear una preferencia de pago en MercadoPago
        const preference = {
            items: items.map(item => ({
                title: item.name,
                quantity: item.quantity,
                currency_id: "MXN",
                unit_price: item.price
            })),
            external_reference: machine_id,
            // Aquí se configura la URL del webhook
            notification_url: `${process.env.WEBHOOK_URL}/payment-webhook` // URL del webhook de pago
        };

        const response = await axios.post("https://api.mercadopago.com/checkout/preferences", preference, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
            }
        });

        // Guardar la transacción temporalmente
        transactions[response.data.id] = {
            machine_id,
            status: "pending",
            items
        };

        res.json({ payment_url: response.data.init_point, qr_data: response.data.id });
    } catch (error) {
        console.error("Error creando pago:", error);
        res.status(500).json({ error: "Error al crear pago" });
    }
});

// Webhook de MercadoPago para recibir confirmación de pago
app.post("/payment-webhook", async (req, res) => {
    try {
        const paymentData = req.body;
        const prefId = paymentData.data.id; // Este es el pref_id o qr_data recibido

        if (transactions[prefId]) {
            // Consultar el estado de la preferencia de pago en MercadoPago
            const response = await axios.get(`https://api.mercadopago.com/v1/payments/search`, {
                headers: {
                    "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
                },
                params: {
                    "preference_id": prefId
                }
            });

            const paymentStatus = response.data.results[0]?.status;

            // Si el pago fue aprobado, actualizar el estado
            if (paymentStatus === 'approved') {
                transactions[prefId].status = "paid";
                console.log(`Pago confirmado para la máquina ${transactions[prefId].machine_id}`);
            } else {
                transactions[prefId].status = "failed";
                console.log(`Pago fallido para la máquina ${transactions[prefId].machine_id}`);
            }
        }

        res.sendStatus(200);  // Responder con 200 OK a MercadoPago
    } catch (error) {
        console.error("Error en webhook:", error);
        res.sendStatus(500);
    }
});

// Ruta para verificar el estado de una transacción
app.get("/transaction-status/:transaction_id", (req, res) => {
    const { transaction_id } = req.params;
    res.json(transactions[transaction_id] || { error: "Transacción no encontrada" });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Backend escuchando en http://localhost:${PORT}`);
});
