// ================= PIN DEFINITIONS =================
#define RELAY_PIN 26     // Relay (ACTIVE LOW) → Motor
#define BUZZER_PIN 25   // Buzzer

char buffer[10];  // to store incoming data

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);   // ⬅️ reduce timeout to 10 ms

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // -------- FAIL SAFE --------
  digitalWrite(RELAY_PIN, HIGH);   // Motor OFF
  digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF

  Serial.println("ESP32 READY");
}

// ================= LOOP =================
void loop() {

  if (Serial.available()) {

    int len = Serial.readBytesUntil('\n', buffer, sizeof(buffer) - 1);
    buffer[len] = '\0';  // null terminate

    // 🚨 DANGER ZONE / STOP COMMAND
    /* ORIGINAL MATCH - PRESERVED FOR EASY RESTORE
    if (strcmp(buffer, "DANGER") == 0) {
    */
    if (strcmp(buffer, "DANGER") == 0 || strcmp(buffer, "STOP") == 0) {
      digitalWrite(RELAY_PIN, HIGH);   // Motor OFF
      digitalWrite(BUZZER_PIN, HIGH);  // Buzzer ON
      Serial.println("STOP/DANGER: Motor OFF | Buzzer ON");
    }

    // ✅ SAFE ZONE
    else if (strcmp(buffer, "SAFE") == 0) {
      digitalWrite(RELAY_PIN, LOW);    // Motor ON
      digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF
      Serial.println("SAFE: Motor ON | Buzzer OFF");
    }

    // 🛑 TIMEOUT / MANUAL STOP
    else if (strcmp(buffer, "TIMEOUT") == 0) {
      digitalWrite(RELAY_PIN, HIGH);   // Motor OFF
      digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF
      Serial.println("TIMEOUT: Motor OFF | Buzzer OFF");
    }
  }
}