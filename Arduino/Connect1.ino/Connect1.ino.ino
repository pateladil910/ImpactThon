// ================= PIN DEFINITIONS =================
#define RELAY_PIN 26     // Relay (ACTIVE LOW) → Motor
#define BUZZER_PIN 25   // Buzzer

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // -------- FAIL SAFE --------
  digitalWrite(RELAY_PIN, HIGH);   // Motor OFF at start
  digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF

  Serial.println("ESP32 READY");
}

// ================= LOOP =================
void loop() {

  if (Serial.available()) {
    String state = Serial.readStringUntil('\n');
    state.trim();

    // 🚨 DANGER ZONE (Camera detected human)
    if (state == "DANGER") {
      digitalWrite(RELAY_PIN, HIGH);   // Motor OFF
      digitalWrite(BUZZER_PIN, HIGH);  // Buzzer ON
      Serial.println("DANGER: Motor OFF | Buzzer ON");
    }

    // ✅ SAFE ZONE (No human detected)
    else if (state == "SAFE") {
      digitalWrite(RELAY_PIN, LOW);    // Motor ON
      digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF
      Serial.println("SAFE: Motor ON | Buzzer OFF");
    }
  }
}