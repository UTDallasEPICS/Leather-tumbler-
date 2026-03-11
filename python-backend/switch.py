import RPi.GPIO as GPIO
import requests
import time

# --- CONFIGURATION ---
SWITCH_PIN = 21      
BACKEND_URL = "http://localhost:8000" 

# --- SETUP ---
GPIO.setmode(GPIO.BCM)


GPIO.setup(SWITCH_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

last_state = None

try:
    while True:
    
        current_state = GPIO.input(SWITCH_PIN) == GPIO.LOW
        
        if current_state != last_state:
            try:
                
                payload = {"active": current_state}
                response = requests.post(f"{BACKEND_URL}/api/system/state", json=payload)
                
                if response.status_code == 200:
                    status_text = "STARTED" if current_state else "STOPPED"
                    print(f" Physical Switch turned {status_text}")
                    last_state = current_state
            except Exception as e:
                print(f"Failed to update backend with switch state: {e}")     
        
        time.sleep(0.1)

except KeyboardInterrupt:
    print("\nStopping bridge...")
    GPIO.cleanup()