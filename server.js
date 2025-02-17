require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Datos de MercadoPago (usa tus credenciales)
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

// Inicializa Firebase
const serviceAccount = path.join(__dirname, 'config/serviceAccountKey.json'); // Ruta al archivo JSON de Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your-database-name.firebaseio.com" // URL de tu base de datos de Firebase
});

const db = admin.firestore();

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
            notification_url: `${process.env.WEBHOOK_URL}/payment-webhook` // URL del webhook de pago
        };

        const response = await axios.post("https://api.mercadopago.com/checkout/preferences", preference, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
            }
        });

        // Guardar la transacción en Firebase
        const transactionRef = db.collection('transactions').doc(response.data.id);
        await transactionRef.set({
            machine_id,
            status: "pending",
            items
        });

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

        const transactionRef = db.collection('transactions').doc(prefId);
        const doc = await transactionRef.get();

        if (doc.exists) {
            const paymentStatus = paymentData.data.status;

            // Si el pago fue aprobado, actualizar el estado
            if (paymentStatus === 'approved') {
                await transactionRef.update({ status: "paid" });
                console.log(`Pago confirmado para la máquina ${doc.data().machine_id}`);
            } else {
                await transactionRef.update({ status: "failed" });
                console.log(`Pago fallido para la máquina ${doc.data().machine_id}`);
            }
        }

        res.sendStatus(200);  // Responder con 200 OK a MercadoPago
    } catch (error) {
        console.error("Error en webhook:", error);
        res.sendStatus(500);
    }
});

// Ruta para verificar el estado de una transacción
app.get("/transaction-status/:transaction_id", async (req, res) => {
    const { transaction_id } = req.params;
    const transactionRef = db.collection('transactions').doc(transaction_id);
    const doc = await transactionRef.get();

    if (doc.exists) {
        res.json(doc.data());
    } else {
        res.json({ error: "Transacción no encontrada" });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Backend escuchando en http://localhost:${PORT}`);
});
