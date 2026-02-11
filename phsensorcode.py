sudo apt update
sudo apt install python3-smbus i2c-tools
sudo raspi-config
# Interface Options → I2C → Enable

#!/usr/bin/env python3
import smbus2
import time

ADDRESS = 99         # default I2C address for Atlas EZO pH circuit
bus = smbus2.SMBus(1)  # Raspberry Pi uses I2C bus 1

def send_command(cmd):
    data = list(cmd.encode('utf-8'))
    bus.write_i2c_block_data(ADDRESS, data[0], data[1:])
    
def read_response():
    time.sleep(0.3)

    try:
        response = bus.read_i2c_block_data(ADDRESS, 0, 20)
    except:
        return None, "I2C read error"

    code = response[0]

    # Convert data bytes
    chars = []
    for byte in response[1:]:
        if byte == 0:
            break
        chars.append(chr(byte))

    return code, "".join(chars)

def decode_status(code):
    if code == 1:
        return "Success"
    elif code == 2:
        return "Failed"
    elif code == 254:
        return "Pending"
    elif code == 255:
        return "No Data"
    else:
        return f"Unknown code: {code}"

def main():
    print("Atlas Scientific pH EZO — Raspberry Pi Mode")
    print("Type commands like 'R', 'Cal,mid', 'Sleep', etc.")
    print("Press CTRL+C to exit.")
    print("--------------------------------------------")

    while True:
        cmd = input("> ").strip()

        # Lowercase for "sleep" matching (same as Arduino version)
        lc = cmd.lower()

        # Timing rules similar to Arduino code
        if lc.startswith("c") or lc.startswith("r"):
            delay = 0.815
        else:
            delay = 0.250

        # Send the command
        send_command(cmd)

        # "sleep" command → don't read
        if lc == "sleep":
            print("Sleeping… (device will not respond until awakened)")
            continue

        time.sleep(delay)

        code, data = read_response()

        print(decode_status(code))
        if data:
            print(data)

if __name__ == "__main__":
    main()
