/*
 * LumiCode - Pin Test for HW-479 RGB LED Module
 *
 * Cycles through each pin one at a time so you can identify
 * which Arduino pin controls which LED color.
 *
 * Watch the LED and note which color lights up for each pin.
 * Results are also printed to Serial Monitor (9600 baud).
 */

void setup() {
  Serial.begin(9600);
  pinMode(9, OUTPUT);
  pinMode(10, OUTPUT);
  pinMode(11, OUTPUT);

  // All off
  analogWrite(9, 0);
  analogWrite(10, 0);
  analogWrite(11, 0);

  Serial.println("=== LumiCode Pin Test ===");
  Serial.println("Watch the LED color for each pin.");
  Serial.println();
}

void loop() {
  // Test D9
  Serial.println(">> D9 ON - What color do you see?");
  analogWrite(9, 255);
  delay(3000);
  analogWrite(9, 0);
  delay(500);

  // Test D10
  Serial.println(">> D10 ON - What color do you see?");
  analogWrite(10, 255);
  delay(3000);
  analogWrite(10, 0);
  delay(500);

  // Test D11
  Serial.println(">> D11 ON - What color do you see?");
  analogWrite(11, 255);
  delay(3000);
  analogWrite(11, 0);
  delay(500);

  // All together = white
  Serial.println(">> ALL ON (D9+D10+D11) - Should be white");
  analogWrite(9, 255);
  analogWrite(10, 255);
  analogWrite(11, 255);
  delay(3000);
  analogWrite(9, 0);
  analogWrite(10, 0);
  analogWrite(11, 0);
  delay(1000);

  Serial.println("--- Restarting test ---");
  Serial.println();
}
