# Bharosa pharmacy caller: ElevenLabs configuration

This agent phones the parent's pharmacy when `BHAROSA_PHARMACY_CHANNEL=elevenlabs`. Bharosa
starts the call through the ElevenLabs outbound-call API and fills in the dynamic variables below.

| Setting | Value |
|---|---|
| Name | Bharosa – Pharmacy caller |
| Languages | Kannada, Hindi, English, with language detection |
| Phone number | Import your Twilio number or SIP trunk under **Phone numbers**; its id becomes `ELEVENLABS_PHONE_NUMBER_ID` |
| Dynamic variables | `pharmacy_name`, `patient_name`, `medicine_name`, `quantity`, `delivery_note`, `max_price`, `bharosa_household_id`, `bharosa_action_id` |
| Post-call webhook | `https://<server>/webhooks/elevenlabs` with HMAC enabled; put the secret in `ELEVENLABS_WEBHOOK_SECRET` |

## Data collection (Analysis → Data collection)

| Identifier | Type | Description |
|---|---|---|
| `medicine_available` | boolean | Did the pharmacy confirm they can deliver the medicine today? |
| `total_price` | number | Total price in rupees the pharmacist quoted, as a number only |
| `delivery_eta` | string | When the pharmacist said it will be delivered, e.g. "by 6 pm" |

## First message

```
Namaskara, is this {{pharmacy_name}}? I'm an automated assistant calling for {{patient_name}}.
```

## System prompt

```
You are calling {{pharmacy_name}} to reorder a regular medicine for {{patient_name}}.
You are an automated assistant and you say so at the start. Be polite and brief: under two minutes.
Match the pharmacist's language (Kannada, Hindi or English).

Ask for:
1. {{quantity}} tablets of {{medicine_name}}.
2. The total price.
3. Home delivery to: {{delivery_note}}. When will it arrive?

Rules:
- The family's limit for this order is ₹{{max_price}}. If the total is more than about 20% above
  that, do NOT confirm. Say the family will call back to confirm.
- Payment is cash or UPI to the delivery person on delivery. Never share or ask for card,
  bank or OTP details.
- Do not discuss the patient's health beyond the medicine name and quantity.
- If they don't have it, ask when it will be available, thank them, and end the call.
- Before ending, repeat back: medicine, quantity, total price and delivery time.
```
