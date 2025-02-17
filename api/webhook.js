// api/webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Usando tu clave secreta de Stripe

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // La URL de tu webhook desde Stripe
    const sig = req.headers['stripe-signature']; // Firma de Stripe
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // La clave secreta del webhook (se obtiene desde tu cuenta de Stripe)

    let event;

    try {
      // Verificamos la firma del webhook
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      // Si la verificación de la firma falla, responde con error
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Procesamos el evento
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object; // El objeto de pago
        console.log(`PaymentIntent was successful!`);
        // Aquí puedes hacer algo con el pago exitoso
        break;
      case 'payment_intent.payment_failed':
        const paymentFailedIntent = event.data.object;
        console.log(`Payment failed: ${paymentFailedIntent.last_payment_error}`);
        // Aquí puedes manejar el pago fallido
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Responder con éxito
    res.status(200).json({ received: true });
  } else {
    // Si el método HTTP no es POST, responde con un error
    res.status(405).send('Method Not Allowed');
  }
}
