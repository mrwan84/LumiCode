/*
 * LumiCode - Arduino Nano RGB LED Controller
 *
 * HW-479 RGB LED Module (common cathode)
 * Wiring: R->D9, G->D10, B->D11, GND->GND
 *
 * Commands: working, done, error, idle, thinking
 * Custom:   rgb:R,G,B (static color), pulse:R,G,B (pulsing color)
 * Handshake: LUMICODE_PING -> responds LUMICODE_PONG
 * Heartbeat: If no command received for 10s, switches to error mode
 */

const int PIN_R = 9;
const int PIN_G = 10;
const int PIN_B = 11;

const unsigned long HEARTBEAT_TIMEOUT = 10000;  // 10 seconds

char inputBuffer[32];
int bufPos = 0;

// Modes: 0=idle, 1=working, 2=done, 3=error, 4=thinking,
//        5=custom_static, 6=custom_pulse, 7=custom_blink, 8=custom_fblink
int mode = 3;  // Start in error mode until app connects and sends idle
unsigned long modeStart = 0;
unsigned long lastReceived = 0;
bool appConnected = false;

// Custom RGB values for modes 5 and 6
int customR = 0;
int customG = 0;
int customB = 0;

void setup() {
  Serial.begin(9600);
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  setColor(255, 0, 0);  // Start red (error) until app connects
}

// Parse "R,G,B" string into customR/G/B, returns true on success
bool parseRGB(const char* str) {
  int r, g, b;
  if (sscanf(str, "%d,%d,%d", &r, &g, &b) == 3) {
    customR = constrain(r, 0, 255);
    customG = constrain(g, 0, 255);
    customB = constrain(b, 0, 255);
    return true;
  }
  return false;
}

void processCommand(const char* cmd) {
  lastReceived = millis();

  if (strcmp(cmd, "LUMICODE_PING") == 0) {
    Serial.println("LUMICODE_PONG");
    return;
  }

  // heartbeat command - just resets the timer, no mode change
  if (strcmp(cmd, "heartbeat") == 0) {
    if (!appConnected) {
      appConnected = true;
      mode = 0;  // Switch to idle on first heartbeat
      modeStart = millis();
    }
    return;
  }

  appConnected = true;
  modeStart = millis();

  // Custom color commands
  if (strncmp(cmd, "rgb:", 4) == 0) {
    if (parseRGB(cmd + 4)) {
      mode = 5;  // custom static
    }
    return;
  }

  if (strncmp(cmd, "pulse:", 6) == 0) {
    if (parseRGB(cmd + 6)) {
      mode = 6;  // custom pulse
    }
    return;
  }

  if (strncmp(cmd, "blink:", 6) == 0) {
    if (parseRGB(cmd + 6)) {
      mode = 7;  // custom slow blink (working)
    }
    return;
  }

  if (strncmp(cmd, "fblink:", 7) == 0) {
    if (parseRGB(cmd + 7)) {
      mode = 8;  // custom fast blink (error)
    }
    return;
  }

  // Named commands
  if (strcmp(cmd, "working") == 0) {
    mode = 1;
  } else if (strcmp(cmd, "done") == 0) {
    mode = 2;
  } else if (strcmp(cmd, "error") == 0) {
    mode = 3;
  } else if (strcmp(cmd, "idle") == 0) {
    mode = 0;
  } else if (strcmp(cmd, "thinking") == 0) {
    mode = 4;
  }
}

void loop() {
  // Read serial
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (bufPos > 0) {
        inputBuffer[bufPos] = '\0';
        processCommand(inputBuffer);
        bufPos = 0;
      }
    } else if (bufPos < 30) {
      inputBuffer[bufPos++] = c;
    } else {
      // Buffer overflow: discard this command
      bufPos = 0;
    }
  }

  // Heartbeat watchdog: if app was connected but no command for 10s, switch to error
  if (appConnected && (millis() - lastReceived > HEARTBEAT_TIMEOUT)) {
    appConnected = false;
    mode = 3;  // error
    modeStart = millis();
  }

  // Animate
  unsigned long now = millis();
  unsigned long elapsed = now - modeStart;

  switch (mode) {
    case 0: // idle - dim blue
      setColor(0, 0, 40);
      break;

    case 1: // working - yellow slow blink
      if ((elapsed / 1000) % 2 == 0) {
        setColor(255, 40, 0);
      } else {
        setColor(0, 0, 0);
      }
      break;

    case 2: // done - solid green
      setColor(0, 180, 0);
      break;

    case 3: // error - red fast blink
      if ((elapsed / 250) % 2 == 0) {
        setColor(255, 0, 0);
      } else {
        setColor(0, 0, 0);
      }
      break;

    case 4: // thinking - purple pulse
      {
        float angle = (float)(elapsed % 2000) / 2000.0 * 6.28318;
        float b = (sin(angle) + 1.0) / 2.0;
        b = 0.15 + b * 0.85;
        setColor((int)(255 * b), 0, (int)(180 * b));
      }
      break;

    case 5: // custom static
      setColor(customR, customG, customB);
      break;

    case 6: // custom pulse
      {
        float angle = (float)(elapsed % 2000) / 2000.0 * 6.28318;
        float b = (sin(angle) + 1.0) / 2.0;
        b = 0.15 + b * 0.85;
        setColor((int)(customR * b), (int)(customG * b), (int)(customB * b));
      }
      break;

    case 7: // custom slow blink (working)
      if ((elapsed / 1000) % 2 == 0) {
        setColor(customR, customG, customB);
      } else {
        setColor(0, 0, 0);
      }
      break;

    case 8: // custom fast blink (error)
      if ((elapsed / 250) % 2 == 0) {
        setColor(customR, customG, customB);
      } else {
        setColor(0, 0, 0);
      }
      break;
  }
}

void setColor(int r, int g, int b) {
  analogWrite(PIN_R, constrain(r, 0, 255));
  analogWrite(PIN_G, constrain(g, 0, 255));
  analogWrite(PIN_B, constrain(b, 0, 255));
}
